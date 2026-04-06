const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/skills
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM skills ORDER BY category, name",
    );

    res.json(rows);
  } catch (err) {
    console.error("GET SKILLS ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;
