const express = require("express");
const router = express.Router();
const db = require("../db");

// ==========================
// GET POSTS
// ==========================
router.get("/", (req, res) => {
  const sql = `
 SELECT posts.*, users.name AS username
FROM posts
JOIN users ON posts.userId = users.id
ORDER BY posts.createdAt DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      return res.status(500).json(err);
    }

    res.json(result);
  });
});

// ==========================
// CREATE POST
// ==========================
router.post("/", (req, res) => {
  const { userId, text } = req.body;

  const sql = `
  INSERT INTO posts (userId, text)
  VALUES (?, ?)
  `;

  db.query(sql, [userId, text], (err, result) => {
    if (err) {
      return res.status(500).json(err);
    }

    res.json({
      message: "Post created",
    });
  });
});

// ==========================
// DELETE POST
// ==========================
router.delete("/:id", (req, res) => {
  const postId = req.params.id;

  const sql = "DELETE FROM posts WHERE id = ?";

  db.query(sql, [postId], (err, result) => {
    if (err) {
      return res.status(500).json(err);
    }

    res.json({
      message: "Post deleted",
    });
  });
});

module.exports = router;
