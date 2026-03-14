const express = require("express");
const router = express.Router();
const db = require("../db");

// get user profile
router.get("/:id", (req, res) => {
  const sql = "SELECT id,name,email,profileImage FROM users WHERE id = ?";

  db.query(sql, [req.params.id], (err, result) => {
    if (err) return res.status(500).json(err);

    res.json(result[0]);
  });
});

module.exports = router;
