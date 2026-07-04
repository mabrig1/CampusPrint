import path from 'path';
import { uploadFile as ucUploadFile } from '@uploadcare/upload-client';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

export function storageResourceType(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (IMAGE_EXTS.has(ext) || ext === '.pdf') return 'image';
  return 'raw';
}

export async function uploadToStorage(buffer, originalName, mimeType = 'application/octet-stream') {
  const ext          = path.extname(originalName).toLowerCase();
  const resourceType = storageResourceType(originalName);

  const result = await ucUploadFile(buffer, {
    publicKey:   process.env.UPLOADCARE_PUBLIC_KEY,
    fileName:    originalName,
    contentType: mimeType,
    store:       '1',
  });

  console.log('Uploadcare upload result:', result.uuid, result.cdnUrl);

  // Append the (sanitised) original filename to the CDN URL — Uploadcare
  // serves ucarecdn.com/<uuid>/<filename> with that filename, so direct
  // opens/downloads don't end up named after the bare UUID.
  const safeName = encodeURIComponent(originalName.replace(/[^\w.\- ]+/g, '_'));

  return {
    public_id:     result.uuid,
    secure_url:    `${result.cdnUrl}${safeName}`,
    resource_type: resourceType,
    format:        ext.replace('.', ''),
    width:         result.imageInfo?.width  || null,
    height:        result.imageInfo?.height || null,
  };
}

export function getPreviewUrl(publicId, resourceType, format) {
  if (resourceType === 'image') {
    if (format === 'pdf') return `https://ucarecdn.com/${publicId}/`;
    return `https://ucarecdn.com/${publicId}/-/preview/900x900/`;
  }
  return null;
}

export async function deleteFromStorage(publicId) {
  const pk = process.env.UPLOADCARE_PUBLIC_KEY;
  const sk = process.env.UPLOADCARE_SECRET_KEY;
  try {
    await fetch(`https://api.uploadcare.com/files/${publicId}/storage/`, {
      method: 'DELETE',
      headers: {
        Authorization: `Uploadcare.Simple ${pk}:${sk}`,
        Accept: 'application/vnd.uploadcare-v0.7+json',
      },
    });
  } catch { /* ignore delete errors */ }
}
