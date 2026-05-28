import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../auth';
import { uploadBufferToS3 } from '../aws';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/photo', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Only image uploads are supported' });
  try {
    const result = await uploadBufferToS3({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      folder: String(req.body.folder || 'safetrace'),
    });
    res.json(result);
  } catch (error: any) {
    res.status(501).json({ error: error.message || 'S3 upload failed' });
  }
});

export default router;
