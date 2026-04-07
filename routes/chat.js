const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middleware/authMiddleware');

// GET /api/chat/conversations — ดึง conversations ของ user ที่ login
router.get('/conversations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.query(
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
      [userId, userId, userId]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/chat/conversations — สร้างหรือเปิด conversation
router.post('/conversations', verifyToken, async (req, res) => {
  try {
    const { seekerId } = req.body;
    const employerId = req.user.id;

    if (!seekerId) return res.status(400).json({ error: 'seekerId required' });

    const [existing] = await db.query(
      'SELECT * FROM conversations WHERE employerId = ? AND seekerId = ?',
      [employerId, seekerId]
    );
    if (existing.length > 0) return res.json(existing[0]);

    const [result] = await db.query(
      'INSERT INTO conversations (employerId, seekerId) VALUES (?, ?)',
      [employerId, seekerId]
    );
    const [rows] = await db.query(
      'SELECT * FROM conversations WHERE id = ?',
      [result.insertId]
    );
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/chat/conversations/:id/messages — ดึง messages
router.get('/conversations/:id/messages', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const convId = req.params.id;

    const [convRows] = await db.query(
      'SELECT * FROM conversations WHERE id = ? AND (employerId = ? OR seekerId = ?)',
      [convId, userId, userId]
    );
    if (convRows.length === 0) return res.status(403).json({ error: 'Forbidden' });

    // Mark as read
    await db.query(
      'UPDATE messages SET isRead = 1 WHERE conversationId = ? AND senderId != ?',
      [convId, userId]
    );

    const [rows] = await db.query(
      `SELECT m.*,
        COALESCE(p.name, cp.companyName, u.name) AS senderName,
        COALESCE(p.profileImage, cp.logo) AS senderImage
       FROM messages m
       LEFT JOIN profiles p ON m.senderId = p.userId
       LEFT JOIN company_profiles cp ON m.senderId = cp.userId
       LEFT JOIN users u ON m.senderId = u.id
       WHERE m.conversationId = ?
       ORDER BY m.createdAt ASC`,
      [convId]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
