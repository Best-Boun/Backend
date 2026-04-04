const express = require("express");
const router = express.Router();
const db = require("../db");

// ✅ ใช้ middleware ของทีม
const verifyToken = require("../middleware/authMiddleware");

// ─────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────
function parseData(raw) {
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

function isValidId(id) {
  return /^\d+$/.test(id) && Number(id) > 0;
}

function buildDataJson(body, fallback = {}) {
  const f = fallback;

  const {
    fullName,
    jobTitle,
    summary,
    skills,
    education,
    experience,
    languages,
    profileImage,
    template,
  } = body;

  return JSON.stringify({
    fullName: fullName !== undefined ? String(fullName).trim() : f.fullName || "",
    jobTitle: jobTitle !== undefined ? jobTitle : f.jobTitle || "",
    summary: summary !== undefined ? summary : f.summary || "",
    skills: Array.isArray(skills) ? skills : f.skills || [],
    education: Array.isArray(education) ? education : f.education || [],
    experience: Array.isArray(experience) ? experience : f.experience || [],
    languages: Array.isArray(languages) ? languages : f.languages || [],
    profileImage: profileImage !== undefined ? profileImage : f.profileImage || "",
    template: ["modern", "minimal", "bold"].includes(template)
      ? template
      : f.template || "modern",
  });
}

// ─────────────────────────────────────────────
// POST → สร้าง Resume
// ─────────────────────────────────────────────
router.post("/", verifyToken, (req, res) => {
  if (!req.body.fullName) {
    return res.status(400).json({
      success: false,
      message: "fullName is required",
    });
  }

  const dataJson = buildDataJson(req.body);

  db.query(
    "INSERT INTO resumes (user_id, data) VALUES (?, ?)",
    [req.user.id, dataJson],
    (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(409).json({
            success: false,
            message: "Resume already exists, use PUT instead",
          });
        }
        return res.status(500).json({ success: false, error: err.message });
      }

      res.status(201).json({
        success: true,
        id: result.insertId,
      });
    }
  );
});

// ─────────────────────────────────────────────
// GET → เอา resume ของตัวเอง
// ─────────────────────────────────────────────
router.get("/me", verifyToken, (req, res) => {
  db.query(
    "SELECT * FROM resumes WHERE user_id = ? LIMIT 1",
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json(err);

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Resume not found",
        });
      }

      const row = rows[0];

      res.json({
        success: true,
        data: {
          id: row.id,
          ...parseData(row.data),
        },
      });
    }
  );
});

// ─────────────────────────────────────────────
// PUT → แก้ไข
// ─────────────────────────────────────────────
router.put("/:id", verifyToken, (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid id",
    });
  }

  db.query(
    "SELECT data FROM resumes WHERE id = ? AND user_id = ?",
    [id, req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json(err);

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Not found",
        });
      }

      const prev = parseData(rows[0].data);
      const dataJson = buildDataJson(req.body, prev);

      db.query(
        "UPDATE resumes SET data = ? WHERE id = ?",
        [dataJson, id],
        (err2) => {
          if (err2) return res.status(500).json(err2);

          res.json({
            success: true,
            message: "Updated",
          });
        }
      );
    }
  );
});

// ─────────────────────────────────────────────
// DELETE → ลบ
// ─────────────────────────────────────────────
router.delete("/:id", verifyToken, (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid id",
    });
  }

  db.query(
    "DELETE FROM resumes WHERE id = ? AND user_id = ?",
    [id, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json(err);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Not found",
        });
      }

      res.json({
        success: true,
        message: "Deleted",
      });
    }
  );
});

module.exports = router;
