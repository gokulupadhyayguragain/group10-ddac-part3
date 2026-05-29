import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;

const region = process.env.AWS_REGION || 'us-east-1';
const databaseUrl = process.env.DATABASE_URL;
const tableName = process.env.TABLE_NAME || process.env.DYNAMODB_TABLE;
const photoBucket = process.env.PHOTO_BUCKET || process.env.S3_BUCKET;
const dryRun = process.env.DRY_RUN === 'true';

if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!tableName) throw new Error('TABLE_NAME or DYNAMODB_TABLE is required');

const pool = new Pool({ connectionString: databaseUrl });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({ region });

const tables = [
  {
    type: 'USER',
    name: 'users',
    select: 'SELECT * FROM users ORDER BY id',
  },
  {
    type: 'PERSON',
    name: 'missing_persons',
    select: 'SELECT * FROM missing_persons ORDER BY id',
    photoField: 'photo_url',
    photoFolder: 'persons',
  },
  {
    type: 'SIGHTING',
    name: 'sightings',
    select: 'SELECT * FROM sightings ORDER BY id',
    photoField: 'photo_url',
    photoFolder: 'sightings',
  },
  {
    type: 'ALERT',
    name: 'alerts',
    select: 'SELECT * FROM alerts ORDER BY id',
  },
];

try {
  for (const table of tables) {
    const rows = (await pool.query(table.select)).rows;
    console.log(`Migrating ${rows.length} ${table.name} rows as ${table.type}`);
    for (const row of rows) {
      if (table.photoField && row[table.photoField]) {
        row[table.photoField] = await maybeUploadDataUrl(row[table.photoField], table.photoFolder, row.id);
      }
      await putEntity(table.type, row);
    }
  }
  console.log(dryRun ? 'Dry run complete.' : 'Migration complete.');
} finally {
  await pool.end();
}

async function putEntity(type, row) {
  const createdAt = toIso(row.created_at) || new Date().toISOString();
  const item = {
    ...normalizeRow(row),
    PK: `${type}#${row.id}`,
    SK: 'META',
    entityType: type,
    GSI1PK: type,
    GSI1SK: `${createdAt}#${row.id}`,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
  };
  if (dryRun) {
    console.log(JSON.stringify({ PK: item.PK, entityType: type, id: item.id }));
    return;
  }
  await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
}

function normalizeRow(row) {
  const next = {};
  Object.entries(row).forEach(([key, value]) => {
    if (value instanceof Date) next[key] = value.toISOString();
    else if (value !== undefined) next[key] = value;
  });
  return next;
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

async function maybeUploadDataUrl(value, folder, id) {
  if (!String(value).startsWith('data:')) return value;
  if (!photoBucket) {
    console.warn(`PHOTO_BUCKET/S3_BUCKET missing; keeping data URL for ${folder}/${id}`);
    return value;
  }
  const match = String(value).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return value;
  const contentType = match[1];
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'jpg';
  const key = `${folder}/${id}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const body = Buffer.from(match[2], 'base64');
  if (!dryRun) {
    await s3.send(new PutObjectCommand({
      Bucket: photoBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  }
  return `https://${photoBucket}.s3.${region}.amazonaws.com/${key}`;
}
