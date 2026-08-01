import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import { getBackendEnv } from '../env.js';

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

function uploadToCloudinary(buffer: Buffer, folder: string): Promise<string> {
  const env = getBackendEnv();
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  ) {
    return Promise.reject(new Error('Cloudinary is not configured'));
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
        if (error || !result) return reject(error ?? new Error('Upload failed'));
        resolve(result.secure_url);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// POST /api/v1/upload — single image upload
router.post('/', upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const url = await uploadToCloudinary(req.file.buffer, 'nafah-agro');
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/upload/multiple — up to 10 images
router.post('/multiple', upload.array('images', 10), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files provided' });
    const urls = await Promise.all(files.map((f) => uploadToCloudinary(f.buffer, 'nafah-agro')));
    res.json({ urls });
  } catch (err) {
    next(err);
  }
});

export default router;
