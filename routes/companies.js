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
router.post('/', async (req, res) => {
  try {
    const { userId, companyName, industry, size, website, description, logo, location, founded } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const [existing] = await db.query(
      'SELECT id FROM company_profiles WHERE userId = ?',
      [userId]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE company_profiles SET
          companyName=?, industry=?, size=?, website=?,
          description=?, logo=?, location=?, founded=?
        WHERE userId=?`,
        [companyName, industry, size, website, description, logo, location, founded, userId]
      );
      res.json({ success: true, updated: true });
    } else {
      const [result2] = await db.query(
        'INSERT INTO company_profiles SET ?',
        [{ userId, companyName, industry, size, website, description, logo, location, founded }]
      );
      res.json({ success: true, id: result2.insertId });
    }
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;