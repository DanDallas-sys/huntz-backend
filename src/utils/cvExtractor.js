import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3 } from '../config/storage.js';
import dotenv from 'dotenv';
dotenv.config();

// Download file buffer from S3
const downloadFromS3 = async (fileUrl) => {
  const key = fileUrl.split('.amazonaws.com/')[1] ||
              fileUrl.split(`${process.env.AWS_BUCKET_NAME}/`)[1];
  const { Body } = await s3.send(new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key:    key,
  }));
  const chunks = [];
  for await (const chunk of Body) chunks.push(chunk);
  return Buffer.concat(chunks);
};

// Extract plain text from CV file (PDF or DOCX)
export const extractCVText = async (fileUrl) => {
  try {
    const buffer   = await downloadFromS3(fileUrl);
    const lowerUrl = fileUrl.toLowerCase();

    if (lowerUrl.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      return data.text;
    }

    if (lowerUrl.endsWith('.docx') || lowerUrl.endsWith('.doc')) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    return null;
  } catch (err) {
    console.error('CV text extraction error:', err);
    return null;
  }
};
