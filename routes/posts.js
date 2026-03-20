const express = require("express");
const router = express.Router();
const db = require("../db");

const verifyToken = require("../middleware/authMiddleware");

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
router.post("/", verifyToken, (req, res) => {
  const userId = req.user.id;
  const { text } = req.body;

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
router.delete("/:id", verifyToken, (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;

  const sql = "DELETE FROM posts WHERE id = ? AND userId = ?";

  db.query(sql, [postId, userId], (err, result) => {
    if (err) {
      return res.status(500).json(err);
    }

    res.json({
      message: "Post deleted",
    });
  });
});

module.exports = router;
