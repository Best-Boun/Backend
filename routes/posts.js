const express = require("express");
const router = express.Router();
const db = require("../db");

const verifyToken = require("../middleware/authMiddleware");

// ==========================
// GET POSTS
// ==========================
router.get("/", (req, res) => {
  const sql = `
    SELECT 
      posts.*, 
      users.name AS username,
      users.profileImage
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
// UPDATE POST (🔥 เพิ่มให้)
// ==========================
router.put("/:id", verifyToken, (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;
  const { text } = req.body;

  // หาโพสก่อน
  db.query("SELECT * FROM posts WHERE id = ?", [postId], (err, result) => {
    if (err) return res.status(500).json(err);

    if (result.length === 0) {
      return res.status(404).json({ message: "Post not found" });
    }

    const post = result[0];

    // เช็คสิทธิ์
    if (post.userId !== userId && role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // update ได้
    db.query(
      "UPDATE posts SET text = ? WHERE id = ?",
      [text, postId],
      (err) => {
        if (err) return res.status(500).json(err);

        res.json({ message: "Post updated" });
      },
    );
  });
});

// ==========================
// DELETE POST
// ==========================
router.delete("/:id", verifyToken, (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;

  // หาโพสก่อน
  db.query("SELECT * FROM posts WHERE id = ?", [postId], (err, result) => {
    if (err) return res.status(500).json(err);

    if (result.length === 0) {
      return res.status(404).json({ message: "Post not found" });
    }

    const post = result[0];

    // เช็คสิทธิ์
    if (post.userId !== userId && role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // ลบได้
    db.query("DELETE FROM posts WHERE id = ?", [postId], (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Post deleted" });
    });
  });
});

module.exports = router;
