import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const sns = new SNSClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1' });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1' }));
const topicArn = process.env.SNS_TOPIC_ARN;
const tableName = process.env.TABLE_NAME || process.env.DYNAMODB_TABLE;

export async function handler(event) {
  if (!topicArn) {
    throw new Error('SNS_TOPIC_ARN is required');
  }

  const batchItemFailures = [];

  await Promise.all((event.Records || []).map(async (record) => {
    try {
      const payload = JSON.parse(record.body || '{}');
      const message = buildMessage(payload);
      await sns.send(new PublishCommand({
        TopicArn: topicArn,
        Subject: 'SafeTrace sighting alert',
        Message: message,
        MessageAttributes: {
          personId: { DataType: 'Number', StringValue: String(payload.personId || 0) },
          source: { DataType: 'String', StringValue: 'safetrace-sqs-lambda' },
        },
      }));
      await markAlertSent(payload);
      console.log('Published SafeTrace alert', {
        personId: payload.personId,
        sightingId: payload.sightingId,
        alertId: payload.alertId,
        messageId: record.messageId,
      });
    } catch (error) {
      console.error('Failed to process SQS record', {
        messageId: record.messageId,
        error: error?.message || error,
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }));

  return { batchItemFailures };
}

async function markAlertSent(payload) {
  if (!tableName || !payload.alertId) return;
  await ddb.send(new UpdateCommand({
    TableName: tableName,
    Key: { PK: `ALERT#${payload.alertId}`, SK: 'META' },
    UpdateExpression: 'SET #status = :status, sent_at = :sentAt, updated_at = :sentAt',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': 'sent',
      ':sentAt': new Date().toISOString(),
    },
  }));
}

function buildMessage(payload) {
  const parts = [
    payload.message || 'A SafeTrace sighting alert was received.',
    payload.personId ? `Person ID: ${payload.personId}` : null,
    payload.sightingId ? `Sighting ID: ${payload.sightingId}` : null,
    payload.createdAt ? `Queued at: ${payload.createdAt}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}
