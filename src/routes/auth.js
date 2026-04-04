import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.js';

const router = express.Router();

// ── Sign Up ──────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { email, password, full_name, user_type, state } = req.body;

    if (!email || !password || !full_name || !user_type) {
      return res.status(400).json({ error: 'email, password, full_name and user_type are required' });
    }
    if (!['seeker', 'employer'].includes(user_type)) {
      return res.status(400).json({ error: 'user_type must be seeker or employer' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check existing user
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const email_verify_token = uuidv4();

    const { rows } = await query(
      `INSERT INTO users (email, password_hash, full_name, user_type, state, email_verify_token)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, user_type`,
      [email.toLowerCase(), password_hash, full_name, user_type, state, email_verify_token]
    );
    const user = rows[0];

    // Create matching profile record
    if (user_type === 'seeker') {
      await query('INSERT INTO seeker_profiles (user_id) VALUES ($1)', [user.id]);
    } else {
      const { company_name, company_location } = req.body;
      if (!company_name) return res.status(400).json({ error: 'company_name is required for employers' });
      await query(
        'INSERT INTO employer_profiles (user_id, company_name, company_location) VALUES ($1, $2, $3)',
        [user.id, company_name, company_location]
      );
    }

    await sendVerificationEmail(email, full_name, email_verify_token);

    res.status(201).json({
      message: 'Account created. Please check your email to verify your account.',
      userId: user.id,
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Login ────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { userId: user.id, user_type: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id:             user.id,
        email:          user.email,
        full_name:      user.full_name,
        user_type:      user.user_type,
        email_verified: user.email_verified,
        nin_verified:   user.nin_verified,
        id_verified:    user.id_verified,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ── Verify Email ─────────────────────────────────────────
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { rows } = await query(
      'UPDATE users SET email_verified = TRUE, email_verify_token = NULL WHERE email_verify_token = $1 RETURNING id',
      [req.params.token]
    );
    if (!rows.length) return res.status(400).json({ error: 'Invalid or expired verification link' });

    // Redirect to frontend dashboard after verification
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?verified=true`);
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── Get current user (me) ────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, email, full_name, user_type, state, nin_verified, id_verified, email_verified, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch user' });
  }
});

// ── Forgot Password ──────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const { rows } = await query('SELECT id, full_name FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!rows.length) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const token = uuidv4();
    const expires = new Date(Date.now() + 3600000); // 1 hour
    await query('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3', [token, expires, rows[0].id]);
    await sendPasswordResetEmail(email, rows[0].full_name, token);
    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ── Reset Password ───────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const { rows } = await query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );
    if (!rows.length) return res.status(400).json({ error: 'Invalid or expired reset link' });

    const hash = await bcrypt.hash(password, 12);
    await query('UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2', [hash, rows[0].id]);
    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong' });
  }
});

export default router;
