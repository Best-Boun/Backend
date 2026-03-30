const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/skills
router.get('/', (req, res) => {
  db.query('SELECT * FROM skills ORDER BY category, name', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

module.exports = router;
