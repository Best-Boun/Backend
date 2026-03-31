const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require("../middleware/authMiddleware");

// ================= GET BULK LIKE STATUS =================
router.get("/bulk-status", verifyToken, (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      message: "Invalid token",
    });
  }

  db.query(
    "SELECT postId FROM likes WHERE userId = ?",
    [userId],
    (err, result) => {
      if (err) {
        console.error("Bulk status error:", err);
        return res.status(500).json({
          message: "Database error",
        });
      }

      const likedPosts = result.map((r) => r.postId);

      return res.json({ likedPosts });
    },
  );
});


router.get("/counts", (req, res) => {
  db.query(
    "SELECT postId, COUNT(*) AS count FROM likes GROUP BY postId",
    (err, result) => {
      if (err) {
        console.error("Bulk count error:", err);
        return res.status(500).json({
          message: "Database error",
        });
      }

      const counts = {};
      result.forEach((row) => {
        counts[row.postId] = row.count;
      });

      return res.json({ counts });
    }
  );
});


router.get("/status/:postId", verifyToken, (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      message: "Invalid token",
    });
  }

  const postId = req.params.postId;

  db.query(
    "SELECT 1 FROM likes WHERE userId = ? AND postId = ?",
    [userId, postId],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          message: "Database error",
        });
      }

      return res.json({
        liked: result.length > 0,
      });
    },
  );
});


router.get("/:postId", (req, res) => {
  const postId = req.params.postId;

  db.query(
    "SELECT COUNT(*) AS count FROM likes WHERE postId = ?",
    [postId],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          message: "Database error",
        });
      }

      return res.json({
        count: result[0].count,
      });
    },
  );
});


router.post("/", verifyToken, (req, res) => {
  const userId = req.user?.id;
  const { postId } = req.body;

  if (!userId) {
    return res.status(401).json({
      message: "Invalid token",
    });
  }

  if (!postId) {
    return res.status(400).json({
      message: "postId required",
    });
  }

  db.query(
    "SELECT 1 FROM likes WHERE userId = ? AND postId = ?",
    [userId, postId],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          message: "Database error",
        });
      }

      // ================= UNLIKE =================
      if (result.length > 0) {
        db.query(
          "DELETE FROM likes WHERE userId = ? AND postId = ?",
          [userId, postId],
          (err) => {
            if (err) {
              console.error(err);
              return res.status(500).json({
                message: "Database error",
              });
            }

            return res.json({
              liked: false,
              message: "Unliked",
            });
          },
        );
      }
      // ================= LIKE =================
      else {
        db.query(
          "INSERT INTO likes (userId, postId) VALUES (?, ?)",
          [userId, postId],
          (err) => {
            if (err) {
              if (err.code === "ER_DUP_ENTRY") {
                return res.json({
                  liked: true,
                  message: "Already liked",
                });
              }

              console.error(err);
              return res.status(500).json({
                message: "Database error",
              });
            }

            return res.json({
              liked: true,
              message: "Liked",
            });
          },
        );
      }
    },
  );
});

module.exports = router;
