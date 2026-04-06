const express = require("express");
const router = express.Router();
const db = require("../db");

// ==========================
// GET /api/favorites/:userId
// ==========================
router.get("/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);

    if (!userId) {
      return res.status(400).json({ error: "Invalid userId" });
    }

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

    const [rows] = await db.query(sql, [userId]);
    res.json(rows);
  } catch (err) {
    console.error("GET FAVORITES ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ==========================
// POST /api/favorites
// ==========================
router.post("/", async (req, res) => {
  try {
    const userId = Number(req.body.userId);
    const jobId = Number(req.body.jobId);

    if (!userId || !jobId) {
      return res.status(400).json({ error: "Invalid data" });
    }

    await db.query(
      "INSERT IGNORE INTO job_favorites (userId, jobId) VALUES (?, ?)",
      [userId, jobId],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("POST FAVORITES ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ==========================
// DELETE /api/favorites/:userId/:jobId
// ==========================
router.delete("/:userId/:jobId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const jobId = Number(req.params.jobId);

    if (!userId || !jobId) {
      return res.status(400).json({ error: "Invalid params" });
    }

    await db.query("DELETE FROM job_favorites WHERE userId = ? AND jobId = ?", [
      userId,
      jobId,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE FAVORITES ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;
