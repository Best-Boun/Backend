const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require("../middleware/authMiddleware");

// ================= GET COMMENTS =================
router.get("/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;

    const sql = `
  SELECT 
    comments.*, 
    COALESCE(NULLIF(profiles.name, ''), users.name) AS name,
    users.profileImage
  FROM comments
  JOIN users ON comments.userId = users.id
  LEFT JOIN profiles ON users.id = profiles.userId
  WHERE postId = ?
  ORDER BY comments.createdAt ASC
`;

    const [result] = await db.query(sql, [postId]);

    res.json(result);
  } catch (err) {
    console.error("GET COMMENTS ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ================= CREATE COMMENT =================
router.post("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { postId, text } = req.body;

    // กันค่า null / ว่าง
    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Empty comment" });
    }

    if (!postId) {
      return res.status(400).json({ message: "PostId required" });
    }

    const sql = `
      INSERT INTO comments (postId, userId, text, createdAt)
      VALUES (?, ?, ?, NOW())
    `;

    await db.query(sql, [postId, userId, text]);

    res.json({ message: "Comment added" });
  } catch (err) {
    console.error("CREATE COMMENT ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ================= DELETE COMMENT =================
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const commentId = req.params.id;
    const userId = req.user.id;
    const role = req.user.role;

    // หา comment ก่อน
    const [result] = await db.query("SELECT * FROM comments WHERE id = ?", [
      commentId,
    ]);

    if (result.length === 0) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const comment = result[0];

    // เช็คสิทธิ์
    if (comment.userId !== userId && role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // ลบ
    await db.query("DELETE FROM comments WHERE id = ?", [commentId]);

    res.json({ message: "Comment deleted" });
  } catch (err) {
    console.error("DELETE COMMENT ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ================= UPDATE COMMENT =================
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const commentId = req.params.id;
    const userId = req.user.id;
    const role = req.user.role;
    const { text } = req.body;

    // กันข้อความว่าง
    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Empty comment" });
    }

    // หา comment
    const [result] = await db.query("SELECT * FROM comments WHERE id = ?", [
      commentId,
    ]);

    if (result.length === 0) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const comment = result[0];

    // เช็คสิทธิ์ (เจ้าของ หรือ admin)
    if (comment.userId !== userId && role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // update
    await db.query(
      "UPDATE comments SET text = ? WHERE id = ?",
      [text, commentId]
    );

    res.json({ message: "Comment updated" });
  } catch (err) {
    console.error("UPDATE COMMENT ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;
