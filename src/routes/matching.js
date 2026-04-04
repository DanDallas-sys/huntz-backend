import express from 'express';
import { requireAuth, requireRole, requireEmailVerified } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { findMatchingJobs } from '../services/openai.js';
import { sendMatchesFoundEmail } from '../services/email.js';

const router = express.Router();

// ── Trigger AI matching ──────────────────────────────────
router.post('/find', requireAuth, requireRole('seeker'), requireEmailVerified, async (req, res) => {
  try {
    const { rows: uRows } = await query(
      'SELECT nin_verified, id_verified, email FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!uRows[0].nin_verified || !uRows[0].id_verified) {
      return res.status(403).json({
        error: 'You must complete identity verification (NIN + ID) before using AI job matching'
      });
    }

    const { rows: spRows } = await query(
      'SELECT * FROM seeker_profiles WHERE user_id = $1',
      [req.user.id]
    );
    if (!spRows.length || !spRows[0].cv_url) {
      return res.status(400).json({ error: 'Please upload your CV before triggering job matching' });
    }
    const profile = spRows[0];

    // Run AI matching
    const matches = await findMatchingJobs(profile);
    if (!matches.length) {
      return res.status(200).json({ message: 'No matches found at this time. Try again later.', matches: [] });
    }

    // Store matches
    const values = matches.map(m =>
      `('${profile.id}', '${m.job_title}', '${m.company_name}', '${m.location}',
        '${m.job_type}', '${m.salary_range}', ${m.match_score}, '${m.source_url}')`
    ).join(',');

    await query(
      `INSERT INTO job_matches (seeker_id, job_title, company_name, location, job_type, salary_range, match_score, source_url)
       VALUES ${values}`
    );

    // Notify seeker
    await query(
      'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
      [req.user.id, 'matches_found', `${matches.length} new job matches found for you`]
    );
    await sendMatchesFoundEmail(uRows[0].email, req.user.full_name, matches.length);

    res.json({ message: 'Matching complete', total: matches.length, matches });
  } catch (err) {
    console.error('Matching error:', err);
    res.status(500).json({ error: 'Job matching failed. Please try again.' });
  }
});

// ── Get seeker's pending matches ─────────────────────────
router.get('/my-matches', requireAuth, requireRole('seeker'), async (req, res) => {
  try {
    const { rows: spRows } = await query('SELECT id FROM seeker_profiles WHERE user_id = $1', [req.user.id]);
    const { rows } = await query(
      `SELECT * FROM job_matches WHERE seeker_id = $1 AND status = 'pending'
       ORDER BY match_score DESC`,
      [spRows[0].id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch matches' });
  }
});

// ── Approve a match (send profile to employer) ────────────
router.post('/approve/:matchId', requireAuth, requireRole('seeker'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE job_matches SET status = 'applied'
       WHERE id = $1 AND seeker_id = (SELECT id FROM seeker_profiles WHERE user_id = $2)
       RETURNING *`,
      [req.params.matchId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Match not found' });
    res.json({ message: 'Profile sent to employer', match: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not approve match' });
  }
});

// ── Dismiss a match ───────────────────────────────────────
router.post('/dismiss/:matchId', requireAuth, requireRole('seeker'), async (req, res) => {
  try {
    await query(
      `UPDATE job_matches SET status = 'dismissed'
       WHERE id = $1 AND seeker_id = (SELECT id FROM seeker_profiles WHERE user_id = $2)`,
      [req.params.matchId, req.user.id]
    );
    res.json({ message: 'Match dismissed' });
  } catch (err) {
    res.status(500).json({ error: 'Could not dismiss match' });
  }
});

export default router;
