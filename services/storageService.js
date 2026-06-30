import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as s3GetSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const USE_S3 = Boolean(
  process.env.AWS_S3_BUCKET &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY
);

const s3 = USE_S3
  ? new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
  : null;

function mimeForExt(ext) {
  if (ext === '.pdf')  return 'application/pdf';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/msword';
}

/**
 * Store a file buffer. Returns { key, url } where url = /uploads/<key>.
 * The /uploads/:key route in server.js handles delivery for both backends.
 */
export async function uploadBuffer(buffer, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const key = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

  if (USE_S3) {
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeForExt(ext),
      ContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(originalName)}`,
    }));
  } else {
    fs.writeFileSync(path.join(UPLOAD_DIR, key), buffer);
  }

  return { key, url: `/uploads/${key}` };
}

/**
 * Return a URL that lets someone view the file.
 * S3: pre-signed GET URL valid for 1 hour.
 * Disk: the public /uploads/<key> path.
 */
export async function getViewUrl(key) {
  if (USE_S3) {
    return s3GetSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }),
      { expiresIn: 3600 }
    );
  }
  return `/uploads/${key}`;
}

/** Remove a file from whichever backend is active. */
export async function deleteStoredFile(key) {
  if (USE_S3) {
    await s3.send(new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    }));
  } else {
    const filePath = path.join(UPLOAD_DIR, key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}
