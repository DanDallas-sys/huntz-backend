import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { createUploader } from '../config/storage.js';
import { extractCVText } from '../utils/cvExtractor.js';
import { parseCV } from '../services/openai.js';

const router      = express.Router();
const cvUploader  = createUploader('cvs');
const certUploader = createUploader('certificates');

// ── Get seeker profile ───────────────────────────────────
router.get('/profile', requireAuth, requireRole('seeker'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT sp.*, u.full_name, u.email, u.state, u.nin_verified, u.id_verified, u.email_verified
       FROM seeker_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.user_id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch profile' });
  }
});

// ── Update seeker profile ────────────────────────────────
router.put('/profile', requireAuth, requireRole('seeker'), async (req, res) => {
  try {
    const {
      industry, job_title, years_experience, education_level,
      preferred_job_types, expected_salary_min, expected_salary_max
    } = req.body;

    const { rows } = await query(
      `UPDATE seeker_profiles
       SET industry = $1, job_title = $2, years_experience = $3, education_level = $4,
           preferred_job_types = $5, expected_salary_min = $6, expected_salary_max = $7,
           profile_complete = TRUE, updated_at = NOW()
       WHERE user_id = $8 RETURNING *`,
      [industry, job_title, years_experience, education_level,
       preferred_job_types, expected_salary_min, expected_salary_max, req.user.id]
    );
    res.json({ message: 'Profile updated', profile: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update profile' });
  }
});

// ── Upload CV ────────────────────────────────────────────
router.post('/upload-cv', requireAuth, requireRole('seeker'), cvUploader.single('cv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const cvUrl = req.file.location;

    // Parse CV in background — extract text then run AI parse
    const cvText = await extractCVText(cvUrl);
    let parsedData = null;
    if (cvText) {
      parsedData = await parseCV(cvText);
    }

    await query(
      'UPDATE seeker_profiles SET cv_url = $1, cv_parsed_data = $2, updated_at = NOW() WHERE user_id = $3',
      [cvUrl, JSON.stringify(parsedData), req.user.id]
    );

    res.json({
      message: 'CV uploaded and parsed successfully',
      cv_url:  cvUrl,
      parsed:  parsedData ? true : false,
    });
  } catch (err) {
    console.error('CV upload error:', err);
    res.status(500).json({ error: 'CV upload failed. Please try again.' });
  }
});

// ── Upload Certificates ──────────────────────────────────
router.post('/upload-certificates', requireAuth, requireRole('seeker'), certUploader.array('certificates', 10), async (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const urls = req.files.map(f => f.location);

    // Append to existing certificates
    await query(
      `UPDATE seeker_profiles
       SET certificates_urls = array_cat(COALESCE(certificates_urls, ARRAY[]::text[]), $1::text[]),
           updated_at = NOW()
       WHERE user_id = $2`,
      [urls, req.user.id]
    );

    res.json({ message: `${urls.length} certificate(s) uploaded`, urls });
  } catch (err) {
    console.error('Certificate upload error:', err);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// ── Get profile completion percentage ────────────────────
router.get('/completion', requireAuth, requireRole('seeker'), async (req, res) => {
  try {
    const { rows: uRows } = await query(
      'SELECT email_verified, nin_verified, id_verified FROM users WHERE id = $1',
      [req.user.id]
    );
    const { rows: pRows } = await query(
      'SELECT industry, job_title, years_experience, education_level, cv_url, certificates_urls FROM seeker_profiles WHERE user_id = $1',
      [req.user.id]
    );

    const u = uRows[0];
    const p = pRows[0] || {};

    const checks = [
      u.email_verified,
      u.nin_verified,
      u.id_verified,
      !!p.industry,
      !!p.job_title,
      !!p.years_experience,
      !!p.education_level,
      !!p.cv_url,
      !!(p.certificates_urls && p.certificates_urls.length),
    ];

    const completed = checks.filter(Boolean).length;
    const percentage = Math.round((completed / checks.length) * 100);

    res.json({ percentage, completed, total: checks.length });
  } catch (err) {
    res.status(500).json({ error: 'Could not calculate completion' });
  }
});

export default router;
