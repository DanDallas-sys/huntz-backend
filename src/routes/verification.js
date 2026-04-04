import express from 'express';
import { requireAuth, requireEmailVerified } from '../middleware/auth.js';
import { verifyNIN, verifyCAC } from '../services/prembly.js';
import { query } from '../config/db.js';
import { createUploader } from '../config/storage.js';

const router  = express.Router();
const idUploader = createUploader('identity-docs');

// ── Verify NIN ───────────────────────────────────────────
router.post('/nin', requireAuth, requireEmailVerified, async (req, res) => {
  try {
    const { nin } = req.body;
    if (!nin || nin.length !== 11) {
      return res.status(400).json({ error: 'NIN must be exactly 11 digits' });
    }

    const { rows } = await query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const result = await verifyNIN(nin, rows[0].full_name);

    if (!result.verified) {
      return res.status(400).json({ error: result.reason });
    }

    await query('UPDATE users SET nin = $1, nin_verified = TRUE WHERE id = $2', [nin, req.user.id]);
    res.json({ message: 'NIN verified successfully', verified: true });
  } catch (err) {
    console.error('NIN route error:', err);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// ── Upload + Verify ID Document ──────────────────────────
router.post('/id-document', requireAuth, requireEmailVerified, idUploader.single('id_document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileUrl = req.file.location;
    await query('UPDATE users SET id_doc_url = $1, id_verified = TRUE WHERE id = $2', [fileUrl, req.user.id]);
    res.json({ message: 'ID document uploaded and verified', url: fileUrl });
  } catch (err) {
    console.error('ID upload error:', err);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// ── Verify CAC (Employer) ────────────────────────────────
router.post('/cac', requireAuth, requireEmailVerified, async (req, res) => {
  try {
    const { cac_number } = req.body;
    if (!cac_number) return res.status(400).json({ error: 'CAC number is required' });

    const { rows } = await query('SELECT company_name FROM employer_profiles WHERE user_id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Employer profile not found' });

    const result = await verifyCAC(cac_number, rows[0].company_name);
    if (!result.verified) {
      return res.status(400).json({ error: result.reason });
    }

    await query(
      'UPDATE employer_profiles SET cac_number = $1, cac_verified = TRUE, verification_status = $2 WHERE user_id = $3',
      [cac_number, 'verified', req.user.id]
    );
    res.json({ message: 'Company verified successfully', verified: true });
  } catch (err) {
    console.error('CAC route error:', err);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// ── Get Verification Status ──────────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT email_verified, nin_verified, id_verified FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch status' });
  }
});

export default router;
