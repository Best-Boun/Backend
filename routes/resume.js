const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require("../middleware/authMiddleware");

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
    fullName:     fullName     !== undefined ? String(fullName).trim() : f.fullName     || "",
    jobTitle:     jobTitle     !== undefined ? jobTitle                : f.jobTitle     || "",
    summary:      summary      !== undefined ? summary                 : f.summary      || "",
    skills:       Array.isArray(skills)     ? skills                  : f.skills       || [],
    education:    Array.isArray(education)  ? education               : f.education    || [],
    experience:   Array.isArray(experience) ? experience              : f.experience   || [],
    languages:    Array.isArray(languages)  ? languages               : f.languages    || [],
    profileImage: profileImage !== undefined ? profileImage           : f.profileImage || "",
    template:     ["modern", "minimal", "bold"].includes(template)
      ? template
      : f.template || "modern",
  });
}

// POST → UPSERT
router.post("/", verifyToken, async (req, res) => {
  if (!req.body.fullName) {
    return res.status(400).json({ success: false, message: "fullName is required" });
  }

  try {
    const dataJson = buildDataJson(req.body);
    await db.query(
      `INSERT INTO resumes (user_id, data)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data)`,
      [req.user.id, dataJson]
    );
    res.json({ success: true, message: "Saved (insert/update)" });
  } catch (err) {
    console.error("SAVE RESUME ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;