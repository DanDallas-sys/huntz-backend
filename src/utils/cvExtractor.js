import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// Extract plain text from CV buffer (PDF or DOCX)
export const extractCVText = async (buffer, filename) => {
  try {
    const lower = filename.toLowerCase();

    if (lower.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      return data.text;
    }

    if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    return null;
  } catch (err) {
    console.error('CV text extraction error:', err);
    return null;
  }
};
