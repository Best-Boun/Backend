const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/favorites/:userId
router.get('/:userId', (req, res) => {
  const sql = `
    SELECT
      jf.jobId,
      j.title, j.company, j.logo, j.location, j.salary,
      j.type, j.level, j.postedDate, j.applicants, j.active,
      j.userId AS employerUserId
    FROM job_favorites jf
    JOIN jobs j ON jf.jobId = j.id
    WHERE jf.userId = ?
    ORDER BY jf.id DESC
  `;
  db.query(sql, [req.params.userId], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(result);
  });
});

// POST /api/favorites
router.post('/', (req, res) => {
  const { userId, jobId } = req.body;
  db.query(
    'INSERT IGNORE INTO job_favorites (userId, jobId) VALUES (?, ?)',
    [userId, jobId],
    (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true });
    }
  );
});

// DELETE /api/favorites/:userId/:jobId
router.delete('/:userId/:jobId', (req, res) => {
  db.query(
    'DELETE FROM job_favorites WHERE userId = ? AND jobId = ?',
    [req.params.userId, req.params.jobId],
    (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true });
    }
  );
});

module.exports = router;
