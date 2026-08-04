import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import { getBackendEnv } from '../env.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_COUNT = 10;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export type UploadImage = (buffer: Buffer, folder: string) => Promise<string>;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGE_COUNT, fields: 4 },
  fileFilter(_req, file, callback) {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(Object.assign(new Error('Only JPEG, PNG, WebP, and AVIF images are accepted.'), {
      status: 415,
      code: 'UNSUPPORTED_IMAGE_TYPE',
    }));
  },
});

export const uploadToCloudinary: UploadImage = (buffer, folder) => {
  const env = getBackendEnv();
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    return Promise.reject(Object.assign(new Error('Image upload is not configured.'), {
      status: 503,
      code: 'IMAGE_UPLOAD_NOT_CONFIGURED',
    }));
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error || !result) {
          reject(Object.assign(new Error('Image upload failed.'), { status: 502, code: 'IMAGE_UPLOAD_FAILED' }));
          return;
        }
        resolve(result.secure_url);
      },
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

export function createUploadRouter(uploadImage: UploadImage = uploadToCloudinary) {
  const router = Router();

  router.post('/', upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: { code: 'IMAGE_REQUIRED', message: 'An image file is required.', details: {} } });
        return;
      }
      const url = await uploadImage(req.file.buffer, 'nafah-agro');
      res.json({ success: true, data: { url } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/multiple', upload.array('images', MAX_IMAGE_COUNT), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ success: false, error: { code: 'IMAGES_REQUIRED', message: 'At least one image file is required.', details: {} } });
        return;
      }
      const urls = await Promise.all(files.map((file) => uploadImage(file.buffer, 'nafah-agro')));
      res.json({ success: true, data: { urls } });
    } catch (error) {
      next(error);
    }
  });

  router.use((error: unknown, _req: Request, _res: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      next(Object.assign(error, {
        status: tooLarge ? 413 : 400,
        code: tooLarge ? 'IMAGE_TOO_LARGE' : 'IMAGE_UPLOAD_LIMIT_EXCEEDED',
        message: tooLarge
          ? `Each image must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller.`
          : `No more than ${MAX_IMAGE_COUNT} images may be uploaded at once.`,
      }));
      return;
    }
    next(error);
  });

  return router;
}

export default createUploadRouter();
