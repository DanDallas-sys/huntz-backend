import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config();

import { requireApiKey }  from './middleware/auth.js';
import authRoutes         from './routes/auth.js';
import seekerRoutes       from './routes/seeker.js';
import employerRoutes     from './routes/employer.js';
import jobRoutes          from './routes/jobs.js';
import applicationRoutes  from './routes/applications.js';
import matchingRoutes     from './routes/matching.js';
import verificationRoutes from './routes/verification.js';
import notificationRoutes from './routes/notifications.js';

const app = express();

// ── Security headers ─────────────────────────────────────
app.use(helmet());

// ── CORS — only allow your frontend origin ───────────────
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  credentials: true,
}));

// ── Body parser ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Global rate limiter ───────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests. Please slow down.' },
});
app.use(globalLimiter);

// ── Strict limiter for auth endpoints ────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
});

// ── Health check (exempt from API key) ───────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Huntz API', timestamp: new Date().toISOString() });
});

// ── Email verification (exempt from API key — clicked in browser) ─
app.use('/api/auth/verify-email', authRoutes);

// ── API key guard — all routes below require x-api-key ───
app.use(requireApiKey);

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',          authLimiter, authRoutes);
app.use('/api/seeker',        seekerRoutes);
app.use('/api/employer',      employerRoutes);
app.use('/api/jobs',          jobRoutes);
app.use('/api/applications',  applicationRoutes);
app.use('/api/matching',      matchingRoutes);
app.use('/api/verify',        verificationRoutes);
app.use('/api/notifications', notificationRoutes);

// ── 404 handler ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err.message?.includes('Invalid file type')) {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
  }
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Huntz API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});
