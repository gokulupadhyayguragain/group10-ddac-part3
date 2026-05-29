import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetQueueAttributesCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
let tableName = process.env.TABLE_NAME || process.env.DYNAMODB_TABLE || 'safetrace-serverless';
let photoBucket = process.env.PHOTO_BUCKET || process.env.S3_BUCKET || '';
let queueUrl = process.env.SQS_QUEUE_URL || '';
let jwtSecret = process.env.JWT_SECRET || 'serverless-demo-change-me';
let corsOrigin = process.env.CORS_ORIGIN || '*';
let activeSecretId = process.env.SAFETRACE_SECRET_ID || process.env.SERVERLESS_SECRET_ID || process.env.SECRET_ID || '';
let secretsLoaded = false;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({ region });
const sqs = new SQSClient({ region });
const cloudwatch = new CloudWatchClient({ region });
const secrets = new SecretsManagerClient({ region });

export async function handler(event) {
  try {
    await loadRuntimeSecrets();
    const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
    if (method === 'OPTIONS') return respond(204, {});

    const path = normalizePath(event.rawPath || event.path || '/');
    const body = parseBody(event);
    const auth = await currentUser(event);

    if (method === 'GET' && path === '/api/health') {
      return respond(200, { ok: true, service: 'safetrace-serverless-api', table: tableName });
    }

    if (method === 'POST' && path === '/api/auth/register') {
      const limited = await enforceRateLimit(event, 'register', 5, 300);
      if (limited) return limited;
      return register(body);
    }
    if (method === 'POST' && path === '/api/auth/login') {
      const limited = await enforceRateLimit(event, 'login', 10, 300);
      if (limited) return limited;
      return login(body);
    }
    if (method === 'POST' && path === '/api/auth/verify-email') return verifyEmail(body);
    if (method === 'POST' && path === '/api/auth/resend-verification') {
      const limited = await enforceRateLimit(event, 'resend-verification', 3, 300);
      if (limited) return limited;
      return resendVerification(body);
    }
    if (method === 'GET' && path === '/api/auth/profile') return requireUser(auth, () => getProfile(auth));
    if (method === 'PUT' && path === '/api/auth/profile') return requireUser(auth, () => updateProfile(auth, body));

    if (method === 'GET' && path === '/api/persons') return respond(200, await listPersons());
    if (method === 'POST' && path === '/api/persons') return requireUser(auth, () => createPerson(auth, body));
    if (method === 'GET' && match(path, /^\/api\/persons\/([^/]+)$/)) return getPerson(capture(path, /^\/api\/persons\/([^/]+)$/));
    if (method === 'PATCH' && match(path, /^\/api\/persons\/([^/]+)$/)) return requireUser(auth, () => updatePerson(capture(path, /^\/api\/persons\/([^/]+)$/), body));
    if (method === 'PUT' && match(path, /^\/api\/persons\/([^/]+)\/status$/)) return requireUser(auth, () => updateStatus('PERSON', capture(path, /^\/api\/persons\/([^/]+)\/status$/), body.status, ['missing', 'found', 'safe', 'closed', 'archived']));
    if (method === 'DELETE' && match(path, /^\/api\/persons\/([^/]+)$/)) return requireUser(auth, () => deleteEntity('PERSON', capture(path, /^\/api\/persons\/([^/]+)$/)));

    if (method === 'GET' && path === '/api/sightings') return respond(200, await listSightings());
    if (method === 'POST' && path === '/api/sightings') return requireUser(auth, () => createSighting(auth, body));
    if (method === 'PATCH' && match(path, /^\/api\/sightings\/([^/]+)\/status$/)) return requireUser(auth, () => updateStatus('SIGHTING', capture(path, /^\/api\/sightings\/([^/]+)\/status$/), body.status, ['new', 'reviewing', 'verified', 'dismissed', 'archived']));
    if (method === 'DELETE' && match(path, /^\/api\/sightings\/([^/]+)$/)) return requireUser(auth, () => deleteEntity('SIGHTING', capture(path, /^\/api\/sightings\/([^/]+)$/)));

    if (method === 'GET' && path === '/api/alerts') return respond(200, await listAlerts());
    if (method === 'POST' && path === '/api/alerts') return requireUser(auth, () => createAlert(body));
    if (method === 'PATCH' && match(path, /^\/api\/alerts\/([^/]+)\/status$/)) return requireUser(auth, () => updateStatus('ALERT', capture(path, /^\/api\/alerts\/([^/]+)\/status$/), body.status, ['queued', 'sent', 'acknowledged', 'failed', 'archived']));
    if (method === 'DELETE' && match(path, /^\/api\/alerts\/([^/]+)$/)) return requireUser(auth, () => deleteEntity('ALERT', capture(path, /^\/api\/alerts\/([^/]+)$/)));

    if (method === 'POST' && path === '/api/admin/seed') return seedDemo();
    if (method === 'GET' && path === '/api/admin/dashboard') return requireAdmin(auth, dashboard);
    if (method === 'GET' && path === '/api/admin/users') return requireAdmin(auth, async () => respond(200, await listUsers()));
    if (method === 'PATCH' && match(path, /^\/api\/admin\/users\/([^/]+)$/)) return requireAdmin(auth, () => updateUser(capture(path, /^\/api\/admin\/users\/([^/]+)$/), body));
    if (method === 'GET' && path === '/api/admin/cloud-status') return requireAdmin(auth, cloudStatus);

    return respond(404, { error: `No route for ${method} ${path}` });
  } catch (error) {
    console.error('serverless-api failed', error);
    return respond(500, { error: error?.message || 'Internal server error' });
  }
}

async function loadRuntimeSecrets() {
  if (secretsLoaded) return;
  secretsLoaded = true;
  const secretId = activeSecretId;
  if (!secretId) return;
  const response = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  const raw = response.SecretString || (response.SecretBinary ? Buffer.from(response.SecretBinary).toString('utf8') : '{}');
  const values = JSON.parse(raw);
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) process.env[key] = String(value);
  });
  tableName = process.env.TABLE_NAME || process.env.DYNAMODB_TABLE || tableName;
  photoBucket = process.env.PHOTO_BUCKET || process.env.S3_BUCKET || photoBucket;
  queueUrl = process.env.SQS_QUEUE_URL || queueUrl;
  jwtSecret = process.env.JWT_SECRET || jwtSecret;
  corsOrigin = process.env.CORS_ORIGIN || corsOrigin;
}

function normalizePath(path) {
  const clean = `/${String(path || '').replace(/^\/+/, '')}`;
  return clean.replace(/\/+$/, '') || '/';
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  if (typeof raw !== 'string') return raw || {};
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': corsOrigin,
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-api-key',
    },
    body: statusCode === 204 ? '' : JSON.stringify(body),
  };
}

function match(path, regex) {
  return regex.test(path);
}

function capture(path, regex) {
  return decodeURIComponent(path.match(regex)?.[1] || '');
}

function nowIso() {
  return new Date().toISOString();
}

function nextId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function key(type, id) {
  return { PK: `${type}#${id}`, SK: 'META' };
}

async function putEntity(type, item) {
  const created = item.created_at || nowIso();
  const record = {
    ...item,
    ...key(type, item.id),
    entityType: type,
    created_at: created,
    updated_at: nowIso(),
    GSI1PK: type,
    GSI1SK: `${created}#${item.id}`,
  };
  await ddb.send(new PutCommand({ TableName: tableName, Item: record }));
  return stripKeys(record);
}

async function getEntity(type, id) {
  const item = await getRawEntity(type, id);
  return item ? stripKeys(item) : null;
}

async function getRawEntity(type, id) {
  const result = await ddb.send(new GetCommand({ TableName: tableName, Key: key(type, id) }));
  return result.Item || null;
}

async function listEntities(type) {
  const result = await ddb.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: '#entityType = :type',
    ExpressionAttributeNames: { '#entityType': 'entityType' },
    ExpressionAttributeValues: { ':type': type },
  }));
  return (result.Items || [])
    .map(stripKeys)
    .sort((a, b) => Number(b.id) - Number(a.id));
}

function stripKeys(item) {
  const { PK, SK, GSI1PK, GSI1SK, entityType, updated_at, password_hash, verification_code_hash, ...safe } = item;
  return safe;
}

async function patchEntity(type, id, values) {
  const current = await getRawEntity(type, id);
  if (!current) return null;
  return putEntity(type, { ...current, ...values, id: current.id, created_at: current.created_at });
}

async function deleteEntity(type, id) {
  const current = await getEntity(type, id);
  if (!current) return respond(404, { error: `${type.toLowerCase()} not found` });
  await ddb.send(new DeleteCommand({ TableName: tableName, Key: key(type, id) }));
  return respond(200, { deleted: true, id: Number(id) || id });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return bcrypt.hashSync(String(password), 10);
}

function verifyPassword(password, stored) {
  try {
    return bcrypt.compareSync(String(password), String(stored || ''));
  } catch {
    return false;
  }
}

function signToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 }));
  const signature = crypto.createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  const [header, body, signature] = String(token || '').split('.');
  if (!header || !body || !signature) return null;
  const expected = crypto.createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function currentUser(event) {
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  return getRawEntity('USER', payload.sub);
}

function requireUser(user, next) {
  if (!user) return respond(401, { error: 'Missing or invalid auth' });
  return next();
}

function requireAdmin(user, next) {
  if (!user) return respond(401, { error: 'Missing or invalid auth' });
  if (user.role !== 'admin') return respond(403, { error: 'admin required' });
  return next();
}

async function findUserByEmail(email) {
  const users = await listRawUsers();
  return users.find((user) => user.email === normalizeEmail(email)) || null;
}

async function listRawUsers() {
  const result = await ddb.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: '#entityType = :type',
    ExpressionAttributeNames: { '#entityType': 'entityType' },
    ExpressionAttributeValues: { ':type': 'USER' },
  }));
  return result.Items || [];
}

async function listUsers() {
  const users = await listRawUsers();
  return users
    .map(stripKeys)
    .sort((a, b) => Number(b.id) - Number(a.id));
}

async function register(body) {
  const name = String(body.name || '').trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!name || !email || !password) return respond(400, { error: 'name, email, and password are required' });
  if (password.length < 8) return respond(400, { error: 'password must be at least 8 characters' });
  const existing = await findUserByEmail(email);
  if (existing?.email_verified) return respond(409, { error: 'Email exists' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const user = await putEntity('USER', {
    id: existing?.id || nextId(),
    name,
    email,
    role: ['family', 'community'].includes(body.role) ? body.role : 'family',
    phone: body.phone || null,
    password_hash: hashPassword(password),
    email_verified: process.env.AUTH_DEV_EXPOSE_VERIFICATION_CODE === 'true',
    verification_code_hash: hashPassword(code),
    verification_code_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  const delivery = await deliverVerificationCode(email, code, name);
  return respond(201, {
    id: user.id,
    email,
    verificationRequired: !user.email_verified,
    delivery,
    message: 'Verification code generated.',
    ...(process.env.AUTH_DEV_EXPOSE_VERIFICATION_CODE === 'true' ? { devVerificationCode: code } : {}),
  });
}

async function verifyEmail(body) {
  const user = await findUserByEmail(body.email);
  if (!user) return respond(400, { error: 'Invalid verification code' });
  const code = String(body.code || '').trim();
  if (user.verification_code_expires_at && new Date(user.verification_code_expires_at).getTime() < Date.now()) {
    return respond(400, { error: 'Verification code expired' });
  }
  if (!verifyPassword(code, user.verification_code_hash)) return respond(400, { error: 'Invalid verification code' });
  await putEntity('USER', { ...user, email_verified: true, email_verified_at: nowIso(), verification_code_hash: null });
  return respond(200, { verified: true });
}

async function resendVerification(body) {
  const user = await findUserByEmail(body.email);
  if (!user || user.email_verified) return respond(200, { sent: true, verified: Boolean(user?.email_verified) });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await putEntity('USER', { ...user, verification_code_hash: hashPassword(code), verification_code_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  const delivery = await deliverVerificationCode(user.email, code, user.name || 'SafeTrace user');
  return respond(200, {
    sent: true,
    delivery,
    ...(process.env.AUTH_DEV_EXPOSE_VERIFICATION_CODE === 'true' ? { devVerificationCode: code } : {}),
  });
}

async function deliverVerificationCode(email, code, name) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.RESEND_FROM_EMAIL || '';
  if (!apiKey || !from) {
    console.log(`Verification code for ${email}: ${code}`);
    return 'cloudwatch-log';
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Your SafeTrace verification code',
      html: `<p>Hello ${escapeHtml(name)},</p><p>Your SafeTrace verification code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.warn('Resend verification email failed', response.status, text);
    if (process.env.AUTH_DEV_EXPOSE_VERIFICATION_CODE === 'true') return 'dev-code';
    throw new Error('Verification email could not be sent');
  }

  return 'resend';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function login(body) {
  const user = await findUserByEmail(body.email);
  if (!user || !verifyPassword(body.password, user.password_hash)) return respond(401, { error: 'Invalid credentials' });
  if (!user.email_verified) return respond(403, { error: 'Please verify your email before logging in.', verificationRequired: true });
  return respond(200, { token: signToken({ sub: user.id, role: user.role }) });
}

async function getProfile(user) {
  return respond(200, stripKeys(user));
}

async function updateProfile(user, body) {
  const avatar_url = await maybeStoreDataUrl(body.avatar_url || null, 'avatars');
  const next = await putEntity('USER', {
    ...user,
    name: String(body.name || user.name).trim(),
    phone: body.phone || null,
    avatar_url,
    notification_prefs: typeof body.notification_prefs === 'string' ? body.notification_prefs : JSON.stringify(body.notification_prefs || {}),
    ...(body.new_password ? { password_hash: hashPassword(body.new_password) } : {}),
  });
  return respond(200, next);
}

async function maybeStoreDataUrl(value, folder) {
  if (!value || !String(value).startsWith('data:')) return value || null;
  if (!photoBucket) return value;
  const match = String(value).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return value;
  const contentType = match[1];
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'jpg';
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  await s3.send(new PutObjectCommand({
    Bucket: photoBucket,
    Key: key,
    Body: Buffer.from(match[2], 'base64'),
    ContentType: contentType,
  }));
  return `https://${photoBucket}.s3.${region}.amazonaws.com/${key}`;
}

async function listPersons() {
  return listEntities('PERSON');
}

async function getPerson(id) {
  const person = await getEntity('PERSON', id);
  if (!person) return respond(404, { error: 'Person not found' });
  return respond(200, person);
}

async function createPerson(user, body) {
  if (!String(body.full_name || '').trim()) return respond(400, { error: 'full_name is required' });
  const photo_url = await maybeStoreDataUrl(body.photo_url || null, 'persons');
  const person = await putEntity('PERSON', {
    id: nextId(),
    reported_by: user.id,
    full_name: String(body.full_name).trim(),
    age: body.age || null,
    description: body.description || null,
    last_seen_location: body.last_seen_location || null,
    last_seen_at: body.last_seen_at || null,
    caregiver_name: body.caregiver_name || null,
    caregiver_phone: body.caregiver_phone || null,
    emergency_contact: body.emergency_contact || null,
    medical_notes: body.medical_notes || null,
    latitude: body.latitude || null,
    longitude: body.longitude || null,
    photo_url,
    status: body.status || 'missing',
  });
  return respond(200, { id: person.id });
}

async function updatePerson(id, body) {
  if (!String(body.full_name || '').trim()) return respond(400, { error: 'full_name is required' });
  const photo_url = await maybeStoreDataUrl(body.photo_url || null, 'persons');
  const updated = await patchEntity('PERSON', id, {
    full_name: String(body.full_name).trim(),
    age: body.age || null,
    description: body.description || null,
    last_seen_location: body.last_seen_location || null,
    last_seen_at: body.last_seen_at || null,
    caregiver_name: body.caregiver_name || null,
    caregiver_phone: body.caregiver_phone || null,
    emergency_contact: body.emergency_contact || null,
    medical_notes: body.medical_notes || null,
    latitude: body.latitude || null,
    longitude: body.longitude || null,
    photo_url,
    status: body.status || 'missing',
  });
  if (!updated) return respond(404, { error: 'Person not found' });
  return respond(200, updated);
}

async function listSightings() {
  const [sightings, persons] = await Promise.all([listEntities('SIGHTING'), listPersons()]);
  const names = new Map(persons.map((person) => [String(person.id), person.full_name]));
  return sightings.map((sighting) => ({ ...sighting, person_name: names.get(String(sighting.person_id)) || null }));
}

async function createSighting(user, body) {
  const personId = Number(body.person_id);
  if (!Number.isInteger(personId) || personId <= 0) return respond(400, { error: 'Invalid person_id' });
  const person = await getEntity('PERSON', personId);
  if (!person) return respond(404, { error: 'Person not found' });
  if (!String(body.location || '').trim()) return respond(400, { error: 'Location is required' });
  const photo_url = await maybeStoreDataUrl(body.photo_url || null, 'sightings');
  const sighting = await putEntity('SIGHTING', {
    id: nextId(),
    person_id: personId,
    reported_by: user.id,
    reporter_name: body.reporter_name || null,
    reporter_phone: body.reporter_phone || null,
    location: String(body.location).trim(),
    latitude: body.latitude || null,
    longitude: body.longitude || null,
    notes: body.notes || null,
    confidence: body.confidence || 'medium',
    status: 'new',
    photo_url,
  });
  const message = `New sighting for ${person.full_name} at ${sighting.location}`;
  const alert = await putEntity('ALERT', {
    id: nextId(),
    person_id: personId,
    sighting_id: sighting.id,
    message,
    channel: 'sns',
    status: 'queued',
  });
  await enqueueAlert({ personId, sightingId: sighting.id, alertId: alert.id, message, createdAt: nowIso() });
  return respond(200, sighting);
}

async function listAlerts() {
  const [alerts, persons] = await Promise.all([listEntities('ALERT'), listPersons()]);
  const names = new Map(persons.map((person) => [String(person.id), person.full_name]));
  return alerts.map((alert) => ({ ...alert, person_name: names.get(String(alert.person_id)) || null }));
}

async function createAlert(body) {
  const personId = Number(body.person_id);
  if (!Number.isInteger(personId) || personId <= 0) return respond(400, { error: 'Invalid person_id' });
  if (!String(body.message || '').trim()) return respond(400, { error: 'message is required' });
  const alert = await putEntity('ALERT', {
    id: nextId(),
    person_id: personId,
    message: String(body.message).trim(),
    channel: body.channel || 'sns',
    status: 'queued',
  });
  await enqueueAlert({ personId, alertId: alert.id, message: alert.message, createdAt: nowIso() });
  return respond(200, alert);
}

async function enqueueAlert(payload) {
  if (!queueUrl) return;
  await sqs.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify({ type: 'sighting-alert', source: 'serverless-api', ...payload }),
  }));
}

async function updateStatus(type, id, status, allowed) {
  if (!allowed.includes(status)) return respond(400, { error: 'Invalid status' });
  const updated = await patchEntity(type, id, { status });
  if (!updated) return respond(404, { error: `${type.toLowerCase()} not found` });
  return respond(200, updated);
}

async function updateUser(id, body) {
  const user = await getRawEntity('USER', id);
  if (!user) return respond(404, { error: 'User not found' });
  const updated = await putEntity('USER', {
    ...user,
    name: String(body.name || user.name).trim(),
    role: ['admin', 'family', 'community', 'responder'].includes(body.role) ? body.role : 'family',
    phone: body.phone || null,
  });
  return respond(200, updated);
}

async function seedDemo() {
  const users = await listRawUsers();
  if (!users.length) {
    await putEntity('USER', { id: 1, name: 'Admin User', email: 'admin@example.com', password_hash: hashPassword('password'), role: 'admin', phone: '+100000000', email_verified: true });
    await putEntity('USER', { id: 2, name: 'Caregiver Demo', email: 'caregiver@example.com', password_hash: hashPassword('password'), role: 'family', phone: '+9779800000001', email_verified: true });
    await putEntity('USER', { id: 3, name: 'Community Volunteer', email: 'volunteer@example.com', password_hash: hashPassword('password'), role: 'community', phone: '+9779800000002', email_verified: true });
  }
  const persons = await listPersons();
  if (!persons.length) {
    await putEntity('PERSON', {
      id: 1,
      reported_by: 2,
      full_name: 'Maya Shrestha',
      age: 74,
      description: 'Alzheimer patient, may appear confused and repeatedly ask for her old home.',
      last_seen_location: 'Jawalakhel, Lalitpur',
      last_seen_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      caregiver_name: 'Sita Shrestha',
      caregiver_phone: '+9779800000001',
      emergency_contact: 'Family contact: +9779800000001',
      medical_notes: 'Needs calm communication. Avoid crowding. Diabetic medication due at evening.',
      latitude: 27.6728,
      longitude: 85.3186,
      status: 'missing',
    });
    await putEntity('SIGHTING', {
      id: 1,
      person_id: 1,
      reported_by: 3,
      reporter_name: 'Community Volunteer',
      reporter_phone: '+9779800000002',
      location: 'Near Patan Dhoka',
      latitude: 27.6785,
      longitude: 85.3209,
      notes: 'Seen walking slowly toward the main road, wearing a blue cardigan.',
      confidence: 'high',
      status: 'new',
    });
    await putEntity('ALERT', {
      id: 1,
      person_id: 1,
      sighting_id: 1,
      message: 'Community sighting received near Patan Dhoka. Caregiver should verify.',
      channel: 'sns',
      status: 'queued',
    });
  }
  return respond(200, { seeded: true });
}

async function dashboard() {
  const [persons, sightings, alerts, users] = await Promise.all([
    listPersons(),
    listEntities('SIGHTING'),
    listEntities('ALERT'),
    listUsers(),
  ]);
  return respond(200, {
    persons: groupBy(persons, 'status'),
    sightings: groupBy(sightings, 'status'),
    alerts: groupBy(alerts, 'status'),
    users: groupBy(users, 'role'),
  });
}

function groupBy(items, field) {
  const counts = new Map();
  items.forEach((item) => counts.set(item[field] || 'unknown', (counts.get(item[field] || 'unknown') || 0) + 1));
  return [...counts.entries()].map(([value, count]) => ({ [field]: value, count }));
}

async function cloudStatus() {
  const queue = await getQueueStatus();
  return respond(200, {
    queue,
    s3: { configured: Boolean(photoBucket), bucket: photoBucket || null },
    sns: { configured: Boolean(process.env.SNS_TOPIC_ARN), topicArn: process.env.SNS_TOPIC_ARN || null },
    secretsManager: { configured: Boolean(activeSecretId), secretId: activeSecretId || null },
    email: { resendConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL), from: process.env.RESEND_FROM_EMAIL || null },
  });
}

async function enforceRateLimit(event, action, maxRequests, windowSeconds) {
  try {
    const ip = getClientIp(event);
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
    const clientHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
    const result = await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: `RATE#${action}#${clientHash}`, SK: `WINDOW#${windowStart}` },
      UpdateExpression: 'ADD #count :one SET #entityType = :entityType, #expires = :expires',
      ExpressionAttributeNames: {
        '#count': 'count',
        '#entityType': 'entityType',
        '#expires': 'expires_at_epoch',
      },
      ExpressionAttributeValues: {
        ':one': 1,
        ':entityType': 'RATE_LIMIT',
        ':expires': windowStart + windowSeconds * 2,
      },
      ReturnValues: 'ALL_NEW',
    }));
    const count = Number(result.Attributes?.count || 0);
    if (count > maxRequests) {
      return respond(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    return null;
  } catch (error) {
    console.warn('rate limit skipped', error?.message || error);
    return null;
  }
}

function getClientIp(event) {
  return event.requestContext?.http?.sourceIp
    || event.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    || event.headers?.['X-Forwarded-For']?.split(',')[0]?.trim()
    || 'unknown';
}

async function getQueueStatus() {
  if (!queueUrl) {
    return {
      configured: false,
      visible: 0,
      inFlight: 0,
      delayed: 0,
      oldestAgeSeconds: null,
      receiveWaitSeconds: null,
      visibilityTimeoutSeconds: null,
      mode: 'local',
      message: 'SQS_QUEUE_URL is not configured.',
    };
  }
  const attributes = await sqs.send(new GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: [
      'ApproximateNumberOfMessages',
      'ApproximateNumberOfMessagesNotVisible',
      'ApproximateNumberOfMessagesDelayed',
      'ReceiveMessageWaitTimeSeconds',
      'VisibilityTimeout',
    ],
  }));
  return {
    configured: true,
    queueUrl,
    visible: Number(attributes.Attributes?.ApproximateNumberOfMessages || 0),
    inFlight: Number(attributes.Attributes?.ApproximateNumberOfMessagesNotVisible || 0),
    delayed: Number(attributes.Attributes?.ApproximateNumberOfMessagesDelayed || 0),
    oldestAgeSeconds: await oldestMessageAge(queueUrl),
    receiveWaitSeconds: Number(attributes.Attributes?.ReceiveMessageWaitTimeSeconds || 0),
    visibilityTimeoutSeconds: Number(attributes.Attributes?.VisibilityTimeout || 0),
    mode: 'aws',
  };
}

async function oldestMessageAge(url) {
  const queueName = url.split('/').pop();
  if (!queueName) return null;
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 10 * 60 * 1000);
    const metric = await cloudwatch.send(new GetMetricStatisticsCommand({
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateAgeOfOldestMessage',
      Dimensions: [{ Name: 'QueueName', Value: queueName }],
      StartTime: start,
      EndTime: end,
      Period: 60,
      Statistics: ['Maximum'],
    }));
    const latest = [...(metric.Datapoints || [])].sort((a, b) => Number(b.Timestamp) - Number(a.Timestamp))[0];
    return latest?.Maximum ?? null;
  } catch {
    return null;
  }
}
