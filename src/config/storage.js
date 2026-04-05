import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

export const s3 = new S3Client({
  region:   'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const allowedTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// Upload a buffer directly to R2 and return the file URL
export const uploadToR2 = async (buffer, folder, userId, originalname, mimetype) => {
  const ext = path.extname(originalname);
  const key = `${folder}/${userId}-${Date.now()}${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket:      process.env.AWS_BUCKET_NAME,
    Key:         key,
    Body:        buffer,
    ContentType: mimetype,
  }));

  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.AWS_BUCKET_NAME}/${key}`;
};

// Multer using memory storage — files land in req.file.buffer, then call uploadToR2
export const createUploader = (folder) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
      if (allowedTypes.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Invalid file type. Only PDF, JPG, PNG and Word documents are allowed.'));
    },
  });
