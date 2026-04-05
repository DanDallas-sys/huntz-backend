import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { createUploader, uploadToR2 } from '../config/storage.js';

const router     = express.Router();
const cacUploader = createUploader('cac-documents');

// ── Get employer profile ─────────────────────────────────
router.get('/profile', requireAuth, requireRole('employer'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ep.*, u.full_name, u.email, u.email_verified
       FROM employer_profiles ep
       JOIN users u ON u.id = ep.user_id
       WHERE ep.user_id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch profile' });
  }
});

// ── Update employer profile ──────────────────────────────
router.put('/profile', requireAuth, requireRole('employer'), async (req, res) => {
  try {
    const { company_name, company_address, company_location, website_url } = req.body;
    const { rows } = await query(
      `UPDATE employer_profiles
       SET company_name = $1, company_address = $2, company_location = $3,
           website_url = $4, updated_at = NOW()
       WHERE user_id = $5 RETURNING *`,
      [company_name, company_address, company_location, website_url, req.user.id]
    );
    res.json({ message: 'Profile updated', profile: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update profile' });
  }
});

// ── Upload CAC document ──────────────────────────────────
router.post('/upload-cac', requireAuth, requireRole('employer'), cacUploader.single('cac_document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = await uploadToR2(req.file.buffer, 'cac-documents', req.user.id, req.file.originalname, req.file.mimetype);
    await query(
      'UPDATE employer_profiles SET cac_doc_url = $1, updated_at = NOW() WHERE user_id = $2',
      [url, req.user.id]
    );
    res.json({ message: 'CAC document uploaded', url });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ── Post a new job ───────────────────────────────────────
router.post('/jobs', requireAuth, requireRole('employer'), async (req, res) => {
  try {
    const { rows: epRows } = await query(
      'SELECT id, cac_verified, verification_status FROM employer_profiles WHERE user_id = $1',
      [req.user.id]
    );
    if (!epRows.length) return res.status(404).json({ error: 'Employer profile not found' });
    if (!epRows[0].cac_verified) {
      return res.status(403).json({ error: 'Your company must be verified before posting jobs' });
    }

    const {
      title, department, job_type, location, location_type,
      salary_min, salary_max, experience_required, education_required,
      skills_required, description, application_requirements
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'title and description are required' });
    }

    const { rows } = await query(
      `INSERT INTO jobs
         (employer_id, title, department, job_type, location, location_type,
          salary_min, salary_max, experience_required, education_required,
          skills_required, description, application_requirements)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [epRows[0].id, title, department, job_type, location, location_type,
       salary_min, salary_max, experience_required, education_required,
       skills_required, description, application_requirements]
    );
    res.status(201).json({ message: 'Job posted successfully', job: rows[0] });
  } catch (err) {
    console.error('Post job error:', err);
    res.status(500).json({ error: 'Could not post job' });
  }
});

// ── Get employer's own jobs ──────────────────────────────
router.get('/jobs', requireAuth, requireRole('employer'), async (req, res) => {
  try {
    const { rows: epRows } = await query('SELECT id FROM employer_profiles WHERE user_id = $1', [req.user.id]);
    if (!epRows.length) return res.status(404).json({ error: 'Profile not found' });

    const { rows } = await query(
      `SELECT j.*,
         (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS application_count
       FROM jobs j
       WHERE j.employer_id = $1
       ORDER BY j.created_at DESC`,
      [epRows[0].id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch jobs' });
  }
});

// ── Toggle job active/inactive ───────────────────────────
router.patch('/jobs/:jobId/toggle', requireAuth, requireRole('employer'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE jobs SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1
         AND employer_id = (SELECT id FROM employer_profiles WHERE user_id = $2)
       RETURNING id, is_active`,
      [req.params.jobId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json({ message: `Job is now ${rows[0].is_active ? 'active' : 'inactive'}`, is_active: rows[0].is_active });
  } catch (err) {
    res.status(500).json({ error: 'Could not update job' });
  }
});

// ── Get applicants for a job (with employability score) ──
router.get('/jobs/:jobId/applicants', requireAuth, requireRole('employer'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         a.id, a.status, a.employability_score, a.ai_summary, a.ai_strengths,
         a.ai_gaps, a.submitted_at,
         u.full_name, u.email, u.state,
         sp.industry, sp.job_title, sp.years_experience, sp.education_level, sp.cv_url
       FROM applications a
       JOIN seeker_profiles sp ON sp.id = a.seeker_id
       JOIN users u ON u.id = sp.user_id
       WHERE a.job_id = $1
         AND EXISTS (
           SELECT 1 FROM jobs j
           JOIN employer_profiles ep ON ep.id = j.employer_id
           WHERE j.id = $1 AND ep.user_id = $2
         )
       ORDER BY a.employability_score DESC`,
      [req.params.jobId, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch applicants' });
  }
});

// ── Update application status ────────────────────────────
router.patch('/applications/:appId/status', requireAuth, requireRole('employer'), async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['viewed', 'shortlisted', 'rejected'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
    }

    await query(
      'UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, req.params.appId]
    );

    // Notify seeker by email
    const { rows } = await query(
      `SELECT u.email, u.full_name, j.title AS job_title, ep.company_name
       FROM applications a
       JOIN seeker_profiles sp ON sp.id = a.seeker_id
       JOIN users u ON u.id = sp.user_id
       JOIN jobs j ON j.id = a.job_id
       JOIN employer_profiles ep ON ep.id = j.employer_id
       WHERE a.id = $1`,
      [req.params.appId]
    );
    if (rows.length) {
      const { sendApplicationUpdateEmail } = await import('../services/email.js');
      await sendApplicationUpdateEmail(rows[0].email, rows[0].full_name, rows[0].job_title, rows[0].company_name, status);

      // Add in-app notification
      await query(
        `INSERT INTO notifications (user_id, type, message)
         SELECT u.id, 'application_update', $1
         FROM seeker_profiles sp JOIN users u ON u.id = sp.user_id
         WHERE sp.id = (SELECT seeker_id FROM applications WHERE id = $2)`,
        [`${rows[0].company_name} has ${status} your application for ${rows[0].job_title}`, req.params.appId]
      );
    }

    res.json({ message: 'Application status updated' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update status' });
  }
});

// ── Employer dashboard stats ─────────────────────────────
router.get('/dashboard', requireAuth, requireRole('employer'), async (req, res) => {
  try {
    const { rows: epRows } = await query('SELECT id FROM employer_profiles WHERE user_id = $1', [req.user.id]);
    if (!epRows.length) return res.status(404).json({ error: 'Profile not found' });
    const eid = epRows[0].id;

    const [jobsRes, appsRes, shortlistRes] = await Promise.all([
      query('SELECT COUNT(*) FROM jobs WHERE employer_id = $1 AND is_active = TRUE', [eid]),
      query('SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.employer_id = $1', [eid]),
      query(`SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.employer_id = $1 AND a.status = 'shortlisted'`, [eid]),
    ]);

    res.json({
      active_jobs:         parseInt(jobsRes.rows[0].count),
      total_applications:  parseInt(appsRes.rows[0].count),
      shortlisted:         parseInt(shortlistRes.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch dashboard data' });
  }
});

export default router;
