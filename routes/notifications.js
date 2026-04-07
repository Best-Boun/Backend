const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middleware/authMiddleware');

// GET /api/notifications — ดึง notifications ของ user ที่ login อยู่
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [result] = await db.query(
      'SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 20',
      [userId]
    );
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [result] = await db.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE userId = ? AND isRead = 0',
      [userId]
    );
    res.json({ count: result[0].count });
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/notifications/:id/read — mark as read
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    await db.query(
      'UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?',
      [req.params.id, userId]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    await db.query(
      'UPDATE notifications SET isRead = 1 WHERE userId = ?',
      [userId]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
