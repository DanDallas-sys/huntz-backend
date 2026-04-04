import express from 'express';
import { requireAuth, requireRole, requireEmailVerified } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { scoreApplication } from '../services/openai.js';

const router = express.Router();

// ── Apply to a job (Path B — Explore opportunities) ──────
router.post('/apply/:jobId', requireAuth, requireRole('seeker'), requireEmailVerified, async (req, res) => {
  try {
    // Must have NIN verified
    const { rows: uRows } = await query(
      'SELECT nin_verified FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!uRows[0].nin_verified) {
      return res.status(403).json({ error: 'Please verify your NIN before applying to jobs' });
    }

    // Fetch seeker profile + CV data
    const { rows: spRows } = await query(
      'SELECT * FROM seeker_profiles WHERE user_id = $1',
      [req.user.id]
    );
    if (!spRows.length || !spRows[0].cv_url) {
      return res.status(400).json({ error: 'Please upload your CV before applying' });
    }
    const seekerProfile = spRows[0];

    // Fetch job
    const { rows: jRows } = await query('SELECT * FROM jobs WHERE id = $1 AND is_active = TRUE', [req.params.jobId]);
    if (!jRows.length) return res.status(404).json({ error: 'Job not found or no longer active' });
    const job = jRows[0];

    // Check for duplicate application
    const { rows: dupRows } = await query(
      'SELECT id FROM applications WHERE job_id = $1 AND seeker_id = $2',
      [job.id, seekerProfile.id]
    );
    if (dupRows.length) {
      return res.status(409).json({ error: 'You have already applied to this job' });
    }

    // Generate employability score via AI
    const scoring = await scoreApplication(seekerProfile, seekerProfile.cv_parsed_data || {}, job);

    const { rows: appRows } = await query(
      `INSERT INTO applications
         (job_id, seeker_id, employability_score, ai_summary, ai_strengths, ai_gaps)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, submitted_at`,
      [job.id, seekerProfile.id, scoring.score, scoring.summary, scoring.strengths, scoring.gaps]
    );

    // Notify employer (in-app)
    const { rows: epRows } = await query(
      'SELECT user_id FROM employer_profiles WHERE id = $1',
      [job.employer_id]
    );
    if (epRows.length) {
      await query(
        'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
        [epRows[0].user_id, 'new_application', `New application received for "${job.title}"`]
      );
    }

    res.status(201).json({
      message:       'Application submitted successfully',
      application_id: appRows[0].id,
      submitted_at:  appRows[0].submitted_at,
    });
  } catch (err) {
    console.error('Application error:', err);
    res.status(500).json({ error: 'Could not submit application. Please try again.' });
  }
});

// ── Get seeker's applications ────────────────────────────
router.get('/mine', requireAuth, requireRole('seeker'), async (req, res) => {
  try {
    const { rows: spRows } = await query('SELECT id FROM seeker_profiles WHERE user_id = $1', [req.user.id]);
    if (!spRows.length) return res.status(404).json({ error: 'Profile not found' });

    const { rows } = await query(
      `SELECT
         a.id, a.status, a.submitted_at,
         j.title AS job_title, j.location, j.job_type, j.location_type,
         ep.company_name, ep.website_url
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN employer_profiles ep ON ep.id = j.employer_id
       WHERE a.seeker_id = $1
       ORDER BY a.submitted_at DESC`,
      [spRows[0].id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch applications' });
  }
});

export default router;
