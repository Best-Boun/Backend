const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middleware/authMiddleware');

// GET /api/notifications — ดึง notifications ของ user ที่ login อยู่
router.get('/', verifyToken, (req, res) => {
  const userId = req.user.id;
  db.query(
    'SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 20',
    [userId],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(result);
    }
  );
});

// GET /api/notifications/unread-count
router.get('/unread-count', verifyToken, (req, res) => {
  const userId = req.user.id;
  db.query(
    'SELECT COUNT(*) AS count FROM notifications WHERE userId = ? AND isRead = 0',
    [userId],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ count: result[0].count });
    }
  );
});

// PATCH /api/notifications/:id/read — mark as read
router.patch('/:id/read', verifyToken, (req, res) => {
  const userId = req.user.id;
  db.query(
    'UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?',
    [req.params.id, userId],
    (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true });
    }
  );
});

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', verifyToken, (req, res) => {
  const userId = req.user.id;
  db.query(
    'UPDATE notifications SET isRead = 1 WHERE userId = ?',
    [userId],
    (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true });
    }
  );
});

module.exports = router;
