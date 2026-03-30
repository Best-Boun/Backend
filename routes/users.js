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

// ── helpers (copied from profiles.js) ──
const SUB_TABLES = [
  "profile_skills",
  "profile_experience",
  "profile_education",
  "profile_languages",
  "profile_certifications",
  "profile_projects",
];

function fetchSubTables(userId, callback) {
  const results = {};
  let done = 0;

  SUB_TABLES.forEach((table) => {
    const query = table === 'profile_skills'
      ? `SELECT ps.*, s.name AS skillName, s.category AS skillCategory
         FROM profile_skills ps
         LEFT JOIN skills s ON ps.skillId = s.id
         WHERE ps.userId = ?`
      : `SELECT * FROM ${table} WHERE userId = ?`;

    db.query(query, [userId], (err, rows) => {
      results[table] = err ? [] : rows;
      done++;
      if (done === SUB_TABLES.length) callback(results);
    });
  });
}

function buildProfileObject(profile, subs, email) {
  return {
    id: profile.id,
    userId: profile.userId,
    email: profile.email || email || null,
    linkedin: profile.linkedin || null,
    github: profile.github || null,
    name: profile.name || null,
    title: profile.title || null,
    bio: profile.bio || null,
    summary: profile.summary || null,
    phone: profile.phone || null,
    location: profile.location || null,
    website: profile.website || null,
    profileImage: profile.profileImage || null,
    availability: profile.availability || null,
    salaryRange: profile.salaryRange || null,
    gender: profile.gender || null,
    nationality: profile.nationality || null,
    dateOfBirth: profile.dateOfBirth || null,
    openToWork: !!profile.openToWork,
    privacy: typeof profile.privacy === 'string'
      ? JSON.parse(profile.privacy)
      : profile.privacy || {},
    skills: (subs["profile_skills"] || []).map((r) => ({
      id: r.id,
      name: r.skillName || r.skill,
      skill: r.skillName || r.skill,
      category: r.skillCategory || null,
      yearsExp: r.yearsExp || 0,
      skillId: r.skillId || null,
    })),
    experience: (subs["profile_experience"] || []).map((r) => ({
      id: r.id,
      company: r.company,
      title: r.role,
      role: r.role,
      startDate: r.startDate,
      endDate: r.endDate,
      description: r.description,
    })),
    education: (subs["profile_education"] || []).map((r) => ({
      id: r.id,
      school: r.institution,
      institution: r.institution,
      degree: r.degree,
      field: r.field,
      startDate: r.startDate,
      endDate: r.endDate,
      grade: r.grade,
    })),
    languages: (subs["profile_languages"] || []).map((r) => ({
      id: r.id,
      name: r.language,
      language: r.language,
      level: r.level,
    })),
    certifications: (subs["profile_certifications"] || []).map((r) => ({
      id: r.id,
      name: r.name,
      issuer: r.issuer,
      date: r.date,
      url: r.url,
    })),
    projects: (subs["profile_projects"] || []).map((r) => ({
      id: r.id,
      title: r.name,
      image: r.image,
      category: r.techStack || r.category || null,
      link: r.url,
      url: r.url,
      description: r.description,
    })),
  };
}

// GET /api/users/:userId/profile
router.get('/:userId/profile', (req, res) => {
  const { userId } = req.params;

  db.query('SELECT * FROM users WHERE id = ?', [userId], (err, userResult) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    const user = userResult[0] || null;
    const email = user ? user.email : null;
    const userName = user ? user.name : null;

    db.query('SELECT * FROM profiles WHERE userId = ?', [userId], (err2, profResult) => {
      if (err2) return res.status(500).json({ error: 'Database error' });

      if (profResult.length === 0) {
        return res.json({ userId, name: userName, email });
      }

      const profile = profResult[0];
      fetchSubTables(userId, (subs) => {
        res.json(buildProfileObject(profile, subs, email));
      });
    });
  });
});

module.exports = router;
