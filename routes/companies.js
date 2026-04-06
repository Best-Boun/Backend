const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/companies/:userId
router.get("/:userId", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM company_profiles WHERE userId = ?",
      [req.params.userId],
    );

    if (rows.length === 0) return res.json({});
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// POST /api/companies
router.post('/', (req, res) => {
  const { userId, companyName, industry, size, website, description, logo, location, founded } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  db.query(
    'SELECT id FROM company_profiles WHERE userId = ?',
    [userId],
    (err, existing) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      if (existing.length > 0) {
        db.query(
          `UPDATE company_profiles SET
            companyName=?, industry=?, size=?, website=?,
            description=?, logo=?, location=?, founded=?
          WHERE userId=?`,
          [companyName, industry, size, website, description, logo, location, founded, userId],
          (err2) => {
            if (err2) return res.status(500).json({ error: 'Update failed' });
            res.json({ success: true, updated: true });
          }
        );
      } else {
        db.query(
          'INSERT INTO company_profiles SET ?',
          [{ userId, companyName, industry, size, website, description, logo, location, founded }],
          (err2, result2) => {
            if (err2) return res.status(500).json({ error: 'Insert failed' });
            res.json({ success: true, id: result2.insertId });
          }
        );
      }
    }
  );
});

module.exports = router;