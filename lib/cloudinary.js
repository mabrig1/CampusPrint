import { v2 as cloudinary } from 'cloudinary';
import path from 'path';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

export function cloudinaryResourceType(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (ext === '.pdf') return 'image'; // enables page preview generation
  return 'raw'; // .doc, .docx, .pptx, etc.
}

export async function uploadToCloudinary(buffer, originalName) {
  const resourceType = cloudinaryResourceType(originalName);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder: 'campusprint',
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        context: { original_name: originalName },
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

export function getPreviewUrl(publicId, resourceType, format) {
  if (resourceType === 'image') {
    if (format === 'pdf') {
      // First page of PDF as JPEG
      return cloudinary.url(publicId, {
        resource_type: 'image',
        format: 'jpg',
        page: 1,
        width: 900,
        quality: 'auto',
        secure: true,
      });
    }
    return cloudinary.url(publicId, {
      resource_type: 'image',
      width: 900,
      quality: 'auto',
      fetch_format: 'auto',
      secure: true,
    });
  }
  return null;
}

export async function deleteFromCloudinary(publicId, resourceType = 'raw') {
  try {
    return await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch {
    return null;
  }
}

export { cloudinary };
