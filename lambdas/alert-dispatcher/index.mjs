import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

const sns = new SNSClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1' });
const topicArn = process.env.SNS_TOPIC_ARN;

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
      console.log('Published SafeTrace alert', {
        personId: payload.personId,
        sightingId: payload.sightingId,
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

function buildMessage(payload) {
  const parts = [
    payload.message || 'A SafeTrace sighting alert was received.',
    payload.personId ? `Person ID: ${payload.personId}` : null,
    payload.sightingId ? `Sighting ID: ${payload.sightingId}` : null,
    payload.createdAt ? `Queued at: ${payload.createdAt}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}
