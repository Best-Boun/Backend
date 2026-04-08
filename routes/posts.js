const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require("../middleware/authMiddleware");


// ==========================
// GET POSTS
// ==========================
router.get("/", async (req, res) => {
  try {
    const sql = `
      SELECT 
        posts.*, 
        users.name AS username,
        users.profileImage
      FROM posts
      JOIN users ON posts.userId = users.id
      ORDER BY posts.createdAt DESC
    `;

    const [result] = await db.query(sql);

    res.json(result);
  } catch (err) {
    console.error("GET POSTS ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ==========================
// CREATE POST
// ==========================
router.post("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { text, image } = req.body;
   

   const sql = `
  INSERT INTO posts (userId, text, image)
  VALUES (?, ?, ?)
`;

   await db.query(sql, [userId, text, image]);

    res.json({ message: "Post created" });
  } catch (err) {
    console.error("CREATE POST ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ==========================
// UPDATE POST
// ==========================
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    const role = req.user.role;
   const { text, image } = req.body;

    // หาโพสก่อน
    const [result] = await db.query("SELECT * FROM posts WHERE id = ?", [
      postId,
    ]);

    if (result.length === 0) {
      return res.status(404).json({ message: "Post not found" });
    }

    const post = result[0];

    // เช็คสิทธิ์
    if (post.userId !== userId && role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // update
    await db.query("UPDATE posts SET text = ?, image = ? WHERE id = ?", [
      text,
      image,
      postId,
    ]);

    res.json({ message: "Post updated" });
  } catch (err) {
    console.error("UPDATE POST ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ==========================
// DELETE POST
// ==========================
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    const role = req.user.role;

    // หาโพสก่อน
    const [result] = await db.query("SELECT * FROM posts WHERE id = ?", [
      postId,
    ]);

    if (result.length === 0) {
      return res.status(404).json({ message: "Post not found" });
    }

    const post = result[0];

    // เช็คสิทธิ์
    if (post.userId !== userId && role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // ลบ
    await db.query("DELETE FROM posts WHERE id = ?", [postId]);

    res.json({ message: "Post deleted" });
  } catch (err) {
    console.error("DELETE POST ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;
