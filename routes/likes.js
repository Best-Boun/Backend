const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require("../middleware/authMiddleware");

// ================= GET BULK LIKE STATUS =================
router.get("/bulk-status", verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const [result] = await db.query(
      "SELECT postId FROM likes WHERE userId = ?",
      [userId],
    );

    const likedPosts = result.map((r) => r.postId);

    res.json({ likedPosts });
  } catch (err) {
    console.error("Bulk status error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// ================= GET ALL COUNTS =================
router.get("/counts", async (req, res) => {
  try {
    const [result] = await db.query(
      "SELECT postId, COUNT(*) AS count FROM likes GROUP BY postId",
    );

    const counts = {};
    result.forEach((row) => {
      counts[row.postId] = row.count;
    });

    res.json({ counts });
  } catch (err) {
    console.error("Bulk count error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// ================= CHECK LIKE STATUS =================
router.get("/status/:postId", verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const postId = req.params.postId;

    if (!userId) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const [result] = await db.query(
      "SELECT 1 FROM likes WHERE userId = ? AND postId = ?",
      [userId, postId],
    );

    res.json({ liked: result.length > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});

// ================= COUNT PER POST =================
router.get("/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;

    const [result] = await db.query(
      "SELECT COUNT(*) AS count FROM likes WHERE postId = ?",
      [postId],
    );

    res.json({ count: result[0].count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});

// ================= LIKE / UNLIKE =================
router.post("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { postId } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Invalid token" });
    }

    if (!postId) {
      return res.status(400).json({ message: "postId required" });
    }

    // เช็คว่ามี like อยู่มั้ย
    const [existing] = await db.query(
      "SELECT 1 FROM likes WHERE userId = ? AND postId = ?",
      [userId, postId],
    );

    // ================= UNLIKE =================
    if (existing.length > 0) {
      await db.query("DELETE FROM likes WHERE userId = ? AND postId = ?", [
        userId,
        postId,
      ]);

      return res.json({
        liked: false,
        message: "Unliked",
      });
    }

    // ================= LIKE =================
    await db.query("INSERT INTO likes (userId, postId) VALUES (?, ?)", [
      userId,
      postId,
    ]);

    return res.json({
      liked: true,
      message: "Liked",
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.json({
        liked: true,
        message: "Already liked",
      });
    }

    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});

module.exports = router;
