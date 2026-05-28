import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { GetQueueAttributesCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import crypto from 'crypto';

function awsRegion() {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
}

export type CloudQueueStatus = {
  configured: boolean;
  queueUrl?: string;
  visible: number;
  inFlight: number;
  delayed: number;
  oldestAgeSeconds: number | null;
  receiveWaitSeconds: number | null;
  visibilityTimeoutSeconds: number | null;
  mode: 'aws' | 'local';
  message?: string;
};

function secretId() {
  return process.env.SAFETRACE_SECRET_ID || process.env.AWS_SECRETS_MANAGER_SECRET_ID || process.env.AWS_SECRET_ID;
}

export async function loadRuntimeSecrets() {
  const id = secretId();
  if (!id) return;

  const client = new SecretsManagerClient({ region: awsRegion() });
  const response = await client.send(new GetSecretValueCommand({ SecretId: id }));
  const raw = response.SecretString || (response.SecretBinary ? Buffer.from(response.SecretBinary).toString('utf8') : '{}');
  const values = JSON.parse(raw) as Record<string, string>;

  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      process.env[key] = String(value);
    }
  });
}

function s3Bucket() {
  return process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
}

export async function uploadBufferToS3(input: { buffer: Buffer; filename: string; contentType: string; folder?: string }) {
  const bucket = s3Bucket();
  if (!bucket) throw new Error('S3_BUCKET is not configured');

  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  const safeFolder = (input.folder || 'uploads').replace(/[^a-zA-Z0-9/_-]/g, '-').replace(/^\/+|\/+$/g, '');
  const key = `${safeFolder || 'uploads'}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const region = awsRegion();
  const client = new S3Client({ region });
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: input.buffer,
    ContentType: input.contentType,
  }));

  const baseUrl = process.env.S3_PUBLIC_BASE_URL || `https://${bucket}.s3.${region}.amazonaws.com`;
  return { key, url: `${baseUrl.replace(/\/$/, '')}/${key}` };
}

function queueUrl() {
  return process.env.SQS_QUEUE_URL || process.env.AWS_SQS_QUEUE_URL;
}

function eventIngestApiUrl() {
  return process.env.SIGHTING_EVENT_API_URL || process.env.ALERT_INGEST_API_URL;
}

export async function enqueueSightingEvent(payload: Record<string, unknown>) {
  const apiUrl = eventIngestApiUrl();
  if (apiUrl) {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SIGHTING_EVENT_API_KEY ? { 'x-api-key': process.env.SIGHTING_EVENT_API_KEY } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Sighting event API failed with ${response.status}: ${text}`);
    }
    return { mode: 'aws' as const, queued: true, via: 'api-gateway' as const };
  }

  const url = queueUrl();
  if (!url) return { mode: 'local' as const, queued: false };

  const client = new SQSClient({ region: awsRegion() });
  await client.send(new SendMessageCommand({
    QueueUrl: url,
    MessageBody: JSON.stringify(payload),
  }));
  return { mode: 'aws' as const, queued: true };
}

export async function publishSnsAlert(payload: { subject: string; message: string }) {
  const topicArn = process.env.SNS_TOPIC_ARN || process.env.AWS_SNS_TOPIC_ARN;
  if (!topicArn) return { mode: 'local' as const, published: false };

  const client = new SNSClient({ region: awsRegion() });
  await client.send(new PublishCommand({
    TopicArn: topicArn,
    Subject: payload.subject.slice(0, 100),
    Message: payload.message,
  }));
  return { mode: 'aws' as const, published: true };
}

export async function getQueueStatus(): Promise<CloudQueueStatus> {
  const url = queueUrl();
  if (!url) {
    return {
      configured: false,
      visible: 0,
      inFlight: 0,
      delayed: 0,
      oldestAgeSeconds: null,
      receiveWaitSeconds: null,
      visibilityTimeoutSeconds: null,
      mode: 'local',
      message: 'SQS_QUEUE_URL is not configured; local database alerts are being used.',
    };
  }

  const sqs = new SQSClient({ region: awsRegion() });
  const attributes = await sqs.send(new GetQueueAttributesCommand({
    QueueUrl: url,
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
    queueUrl: url,
    visible: Number(attributes.Attributes?.ApproximateNumberOfMessages || 0),
    inFlight: Number(attributes.Attributes?.ApproximateNumberOfMessagesNotVisible || 0),
    delayed: Number(attributes.Attributes?.ApproximateNumberOfMessagesDelayed || 0),
    oldestAgeSeconds: await getOldestMessageAgeSeconds(url),
    receiveWaitSeconds: Number(attributes.Attributes?.ReceiveMessageWaitTimeSeconds || 0),
    visibilityTimeoutSeconds: Number(attributes.Attributes?.VisibilityTimeout || 0),
    mode: 'aws',
  };
}

async function getOldestMessageAgeSeconds(url: string) {
  const queueName = url.split('/').pop();
  if (!queueName) return null;
  const client = new CloudWatchClient({ region: awsRegion() });
  const end = new Date();
  const start = new Date(end.getTime() - 10 * 60 * 1000);
  try {
    const metric = await client.send(new GetMetricStatisticsCommand({
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
  } catch (error) {
    return null;
  }
}
