import { Buffer } from 'node:buffer';
import { enqueueSightingEvent, publishSnsAlert, uploadBufferToS3 } from './aws';

function fileExtension(contentType: string) {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  return 'bin';
}

export async function maybeStoreDataUrl(value: string | null | undefined, prefix: string) {
  if (!value) return null;
  if (!value.startsWith('data:')) return value;

  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return value;

  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  try {
    const uploaded = await uploadBufferToS3({
      buffer,
      filename: `photo.${fileExtension(contentType)}`,
      contentType,
      folder: prefix,
    });
    return uploaded.url;
  } catch (error) {
    if (process.env.S3_BUCKET || process.env.AWS_S3_BUCKET) throw error;
    return value;
  }
}

export async function dispatchCloudAlert(payload: { personId: number; message: string; channel?: string; sightingId?: number | null }) {
  const queued = await enqueueSightingEvent({
    type: 'sighting-alert',
    ...payload,
    createdAt: new Date().toISOString(),
  });
  if (queued.queued) {
    return queued;
  }

  return publishSnsAlert({
    subject: 'SafeTrace Alert',
    message: payload.message,
  });
}
