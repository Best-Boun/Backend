const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middleware/authMiddleware');

// GET /api/chat/conversations — ดึง conversations ของ user ที่ login
router.get('/conversations', verifyToken, (req, res) => {
  const userId = req.user.id;

  db.query(
    `SELECT c.*,
      COALESCE(cp.companyName, eu.name) AS employerName,
      cp.logo AS employerImage,
      COALESCE(sp.name, su.name) AS seekerName,
      sp.profileImage AS seekerImage,
      (SELECT message FROM messages WHERE conversationId = c.id ORDER BY createdAt DESC LIMIT 1) AS lastMessage,
      (SELECT createdAt FROM messages WHERE conversationId = c.id ORDER BY createdAt DESC LIMIT 1) AS lastMessageAt,
      (SELECT COUNT(*) FROM messages WHERE conversationId = c.id AND isRead = 0 AND senderId != ?) AS unreadCount
     FROM conversations c
     LEFT JOIN company_profiles cp ON c.employerId = cp.userId
     LEFT JOIN users eu ON c.employerId = eu.id
     LEFT JOIN profiles sp ON c.seekerId = sp.userId
     LEFT JOIN users su ON c.seekerId = su.id
     WHERE c.employerId = ? OR c.seekerId = ?
     ORDER BY lastMessageAt DESC`,
    [userId, userId, userId],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(result);
    }
  );
});

// POST /api/chat/conversations — สร้างหรือเปิด conversation
router.post('/conversations', verifyToken, (req, res) => {
  const { seekerId } = req.body;
  const employerId = req.user.id;

  if (!seekerId) return res.status(400).json({ error: 'seekerId required' });

  // เช็คว่ามีอยู่แล้วไหม
  db.query(
    'SELECT * FROM conversations WHERE employerId = ? AND seekerId = ?',
    [employerId, seekerId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      if (rows.length > 0) return res.json(rows[0]);

      // สร้างใหม่
      db.query(
        'INSERT INTO conversations (employerId, seekerId) VALUES (?, ?)',
        [employerId, seekerId],
        (err2, result) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          db.query('SELECT * FROM conversations WHERE id = ?', [result.insertId], (err3, rows2) => {
            if (err3) return res.status(500).json({ error: 'Database error' });
            res.json(rows2[0]);
          });
        }
      );
    }
  );
});

// GET /api/chat/conversations/:id/messages — ดึง messages
router.get('/conversations/:id/messages', verifyToken, (req, res) => {
  const userId = req.user.id;
  const convId = req.params.id;

  // เช็คว่า user เป็นส่วนหนึ่งของ conversation นี้
  db.query(
    'SELECT * FROM conversations WHERE id = ? AND (employerId = ? OR seekerId = ?)',
    [convId, userId, userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (rows.length === 0) return res.status(403).json({ error: 'Forbidden' });

      // Mark as read
      db.query(
        'UPDATE messages SET isRead = 1 WHERE conversationId = ? AND senderId != ?',
        [convId, userId]
      );

      db.query(
        `SELECT m.*,
          COALESCE(p.name, cp.companyName, u.name) AS senderName,
          COALESCE(p.profileImage, cp.logo) AS senderImage
         FROM messages m
         LEFT JOIN profiles p ON m.senderId = p.userId
         LEFT JOIN company_profiles cp ON m.senderId = cp.userId
         LEFT JOIN users u ON m.senderId = u.id
         WHERE m.conversationId = ?
         ORDER BY m.createdAt ASC`,
        [convId],
        (err2, result) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.json(result);
        }
      );
    }
  );
});

module.exports = router;
