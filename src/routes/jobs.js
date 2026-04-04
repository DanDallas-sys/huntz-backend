import express from 'express';
import { query } from '../config/db.js';

const router = express.Router();

// ── Browse jobs with filters ─────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      search, industry, location_type, job_type,
      salary_min, salary_max,
      page = 1, limit = 20
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['j.is_active = TRUE', 'ep.cac_verified = TRUE'];
    const params = [];
    let i = 1;

    if (search) {
      conditions.push(`(j.title ILIKE $${i} OR ep.company_name ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (location_type) {
      conditions.push(`j.location_type = $${i}`);
      params.push(location_type); i++;
    }
    if (job_type) {
      conditions.push(`j.job_type = $${i}`);
      params.push(job_type); i++;
    }
    if (salary_min) {
      conditions.push(`j.salary_min >= $${i}`);
      params.push(parseInt(salary_min)); i++;
    }
    if (salary_max) {
      conditions.push(`j.salary_max <= $${i}`);
      params.push(parseInt(salary_max)); i++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countRes = await query(
      `SELECT COUNT(*) FROM jobs j JOIN employer_profiles ep ON ep.id = j.employer_id ${where}`,
      params
    );

    params.push(parseInt(limit), offset);
    const { rows } = await query(
      `SELECT
         j.id, j.title, j.job_type, j.location, j.location_type,
         j.salary_min, j.salary_max, j.experience_required,
         j.skills_required, j.created_at,
         ep.company_name, ep.company_location, ep.website_url
       FROM jobs j
       JOIN employer_profiles ep ON ep.id = j.employer_id
       ${where}
       ORDER BY j.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      params
    );

    res.json({
      jobs:  rows,
      total: parseInt(countRes.rows[0].count),
      page:  parseInt(page),
      pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)),
    });
  } catch (err) {
    console.error('Jobs feed error:', err);
    res.status(500).json({ error: 'Could not fetch jobs' });
  }
});

// ── Get single job detail ────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         j.*,
         ep.company_name, ep.company_location, ep.website_url
       FROM jobs j
       JOIN employer_profiles ep ON ep.id = j.employer_id
       WHERE j.id = $1 AND j.is_active = TRUE`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch job' });
  }
});

export default router;
