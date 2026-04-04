import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../config/db.js';

const router = express.Router();

// ── Get all notifications ─────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch notifications' });
  }
});

// ── Mark all as read ─────────────────────────────────────
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update notifications' });
  }
});

// ── Mark one as read ─────────────────────────────────────
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    await query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update notification' });
  }
});

// ── Unread count ─────────────────────────────────────────
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [req.user.id]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch count' });
  }
});

export default router;
