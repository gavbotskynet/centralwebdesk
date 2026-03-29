/**
 * R2 S3-compatible client for Cloudflare R2.
 * Uses the AWS SDK for S3 which handles AWS Signature V4 correctly.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2Config {
  bucket: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface R2UploadResult {
  key: string;
  url: string;
}

function makeClient(cfg: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export async function uploadToR2(
  arrayBuffer: ArrayBuffer,
  filename: string,
  contentType: string,
  cfg: R2Config
): Promise<R2UploadResult> {
  const client = makeClient(cfg);
  const objectKey = `bullet-images/${filename}`;

  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: objectKey,
    ContentType: contentType,
    Body: new Uint8Array(arrayBuffer),
  });

  // Use getSignedUrl to get a pre-signed URL, then PUT directly
  // Set expires to 5 minutes (足够Worker处理)
  const signedUrl = await getSignedUrl(client, command, { expiresIn: 300 });

  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: new Uint8Array(arrayBuffer),
  });

  if (!response.ok && response.status !== 200 && response.status !== 204) {
    const text = await response.text().catch(() => '');
    throw new Error(`R2 upload failed: ${response.status} ${text.slice(0, 100)}`);
  }

  const publicUrl = `https://${cfg.bucket}.${cfg.accountId}.r2.dev/${objectKey}`;
  return { key: objectKey, url: publicUrl };
}

export async function getSignedGetUrl(objectKey: string, cfg: R2Config): Promise<string> {
  const client = makeClient(cfg);
  const command = new GetObjectCommand({
    Bucket: cfg.bucket,
    Key: objectKey,
  });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

export async function deleteFromR2(objectKey: string, cfg: R2Config): Promise<void> {
  const client = makeClient(cfg);

  const command = new DeleteObjectCommand({
    Bucket: cfg.bucket,
    Key: objectKey,
  });

  const signedUrl = await getSignedUrl(client, command, { expiresIn: 300 });

  await fetch(signedUrl, {
    method: 'DELETE',
  });
}
