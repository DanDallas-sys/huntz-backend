import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

// ── API Key guard ─────────────────────────────────────────
export const requireApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
};

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await query('SELECT id, email, user_type, email_verified FROM users WHERE id = $1', [decoded.userId]);
    if (!rows.length) return res.status(401).json({ error: 'User not found' });

    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Restrict to a specific user_type
export const requireRole = (role) => (req, res, next) => {
  if (req.user.user_type !== role) {
    return res.status(403).json({ error: `Access restricted to ${role}s` });
  }
  next();
};

// Ensure email is verified before sensitive actions
export const requireEmailVerified = (req, res, next) => {
  if (!req.user.email_verified) {
    return res.status(403).json({ error: 'Please verify your email address first' });
  }
  next();
};
