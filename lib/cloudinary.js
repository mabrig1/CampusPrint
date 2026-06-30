import path from 'path';

// Uploadcare — replaces Cloudinary for file storage
const UPLOAD_URL = 'https://upload.uploadcare.com/base/';
const API_URL    = 'https://api.uploadcare.com';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

export function cloudinaryResourceType(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (IMAGE_EXTS.has(ext) || ext === '.pdf') return 'image';
  return 'raw';
}

export async function uploadToCloudinary(buffer, originalName, mimeType = 'application/octet-stream') {
  const ext          = path.extname(originalName).toLowerCase();
  const resourceType = cloudinaryResourceType(originalName);

  const form = new FormData();
  form.append('UPLOADCARE_PUB_KEY', process.env.UPLOADCARE_PUBLIC_KEY);
  form.append('UPLOADCARE_STORE', '1');
  form.append('filename', originalName);
  form.append('file', new Blob([buffer], { type: mimeType }), originalName);

  const res = await fetch(UPLOAD_URL, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Uploadcare upload failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  const uuid = data.file;
  if (!uuid) throw new Error(`Uploadcare returned no file UUID: ${JSON.stringify(data)}`);

  return {
    public_id:     uuid,
    secure_url:    `https://ucarecdn.com/${uuid}/`,
    resource_type: resourceType,
    format:        ext.replace('.', ''),
    width:         null,
    height:        null,
  };
}

export function getPreviewUrl(publicId, resourceType, format) {
  if (resourceType === 'image') {
    if (format === 'pdf') return `https://ucarecdn.com/${publicId}/`;
    return `https://ucarecdn.com/${publicId}/-/preview/900x900/`;
  }
  return null;
}

export async function deleteFromCloudinary(publicId) {
  const pk = process.env.UPLOADCARE_PUBLIC_KEY;
  const sk = process.env.UPLOADCARE_SECRET_KEY;
  try {
    await fetch(`${API_URL}/files/${publicId}/storage/`, {
      method: 'DELETE',
      headers: {
        Authorization: `Uploadcare.Simple ${pk}:${sk}`,
        Accept: 'application/vnd.uploadcare-v0.7+json',
      },
    });
  } catch { /* ignore delete errors */ }
}
