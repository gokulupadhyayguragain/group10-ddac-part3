import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const queueUrl = process.env.SQS_QUEUE_URL;
const expectedApiKey = process.env.SIGHTING_EVENT_API_KEY;
const sqs = new SQSClient({ region });

export async function handler(event) {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return response(204, {});
  }

  if (!queueUrl) {
    return response(500, { error: 'SQS_QUEUE_URL is required' });
  }

  if (expectedApiKey && event.headers?.['x-api-key'] !== expectedApiKey) {
    return response(401, { error: 'Invalid API key' });
  }

  let payload;
  try {
    payload = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
  } catch (error) {
    return response(400, { error: 'Invalid JSON body' });
  }

  const personId = Number(payload.personId || payload.person_id);
  if (!Number.isInteger(personId) || personId <= 0) {
    return response(400, { error: 'personId is required' });
  }

  const message = String(payload.message || '').trim();
  if (!message) {
    return response(400, { error: 'message is required' });
  }

  const body = {
    type: payload.type || 'sighting-alert',
    ...payload,
    personId,
    message,
    createdAt: payload.createdAt || new Date().toISOString(),
    source: 'api-gateway-lambda',
  };

  await sqs.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(body),
  }));

  return response(202, { queued: true });
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,x-api-key',
    },
    body: JSON.stringify(body),
  };
}
