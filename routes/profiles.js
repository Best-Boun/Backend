const express = require("express");
const router = express.Router();
const db = require("../db");

const SUB_TABLES = [
  "profile_skills",
  "profile_experience",
  "profile_education",
  "profile_languages",
  "profile_certifications",
  "profile_projects",
];

const PROFILE_FIELDS = [
  "name", "title", "bio", "summary", "phone", "location", "website",
  "profileImage", "availability", "salaryRange", "gender", "nationality",
  "dateOfBirth", "openToWork",
];

// ================================================
// HELPER: fetch all sub-tables for a userId
// ================================================
function fetchSubTables(userId, callback) {
  const results = {};
  let done = 0;

  SUB_TABLES.forEach((table) => {
    db.query(`SELECT * FROM ${table} WHERE userId = ?`, [userId], (err, rows) => {
      results[table] = err ? [] : rows;
      done++;
      if (done === SUB_TABLES.length) callback(results);
    });
  });
}

// ================================================
// HELPER: merge profile row + sub-table rows → response object
// ================================================
function buildProfileObject(profile, subs, email) {
  return {
    id: profile.id,
    userId: profile.userId,
    email: email || null,
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
    skills: (subs["profile_skills"] || []).map((r) => r.skill),
    experience: (subs["profile_experience"] || []).map((r) => ({
      company: r.company,
      role: r.role,
      startDate: r.startDate,
      endDate: r.endDate,
      description: r.description,
    })),
    education: (subs["profile_education"] || []).map((r) => ({
      institution: r.institution,
      degree: r.degree,
      field: r.field,
      startDate: r.startDate,
      endDate: r.endDate,
      grade: r.grade,
    })),
    languages: (subs["profile_languages"] || []).map((r) => ({
      language: r.language,
      level: r.level,
    })),
    certifications: (subs["profile_certifications"] || []).map((r) => ({
      name: r.name,
      issuer: r.issuer,
      date: r.date,
      url: r.url,
    })),
    projects: (subs["profile_projects"] || []).map((r) => ({
      name: r.name,
      image: r.image,
      description: r.description,
      url: r.url,
      techStack: r.techStack,
    })),
  };
}

// ================================================
// HELPER: insert all sub-tables for a userId
// ================================================
function insertSubTables(userId, body, callback) {
  const {
    skills = [],
    experience = [],
    education = [],
    languages = [],
    certifications = [],
    projects = [],
  } = body;

  const inserts = [];

  (skills || []).forEach((skill) => {
    const skillName = typeof skill === "string" ? skill : skill.skill || String(skill);
    inserts.push({ table: "profile_skills", row: { userId, skill: skillName } });
  });

  (experience || []).forEach((exp) => {
    inserts.push({
      table: "profile_experience",
      row: {
        userId,
        company: exp.company || null,
        role: exp.role || null,
        startDate: exp.startDate || null,
        endDate: exp.endDate || null,
        description: exp.description || null,
      },
    });
  });

  (education || []).forEach((edu) => {
    inserts.push({
      table: "profile_education",
      row: {
        userId,
        institution: edu.institution || null,
        degree: edu.degree || null,
        field: edu.field || null,
        startDate: edu.startDate || null,
        endDate: edu.endDate || null,
        grade: edu.grade || null,
      },
    });
  });

  (languages || []).forEach((lang) => {
    inserts.push({
      table: "profile_languages",
      row: {
        userId,
        language: lang.language || (typeof lang === "string" ? lang : null),
        level: lang.level || null,
      },
    });
  });

  (certifications || []).forEach((cert) => {
    inserts.push({
      table: "profile_certifications",
      row: {
        userId,
        name: cert.name || null,
        issuer: cert.issuer || null,
        date: cert.date || null,
        url: cert.url || null,
      },
    });
  });

  (projects || []).forEach((proj) => {
    inserts.push({
      table: "profile_projects",
      row: {
        userId,
        name: proj.name || null,
        image: proj.image || null,
        description: proj.description || null,
        url: proj.url || null,
        techStack: proj.techStack || null,
      },
    });
  });

  if (inserts.length === 0) return callback(null);

  let done = 0;
  let errored = false;

  inserts.forEach(({ table, row }) => {
    db.query(`INSERT INTO ${table} SET ?`, row, (err) => {
      if (errored) return;
      if (err) {
        errored = true;
        return callback(err);
      }
      done++;
      if (done === inserts.length) callback(null);
    });
  });
}

// ================================================
// HELPER: delete all sub-tables for a userId
// ================================================
function deleteSubTables(userId, callback) {
  let done = 0;
  SUB_TABLES.forEach((table) => {
    db.query(`DELETE FROM ${table} WHERE userId = ?`, [userId], () => {
      done++;
      if (done === SUB_TABLES.length) callback();
    });
  });
}

// ================================================
// GET /api/profiles?userId=:userId
// ================================================
router.get("/", (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  db.query("SELECT * FROM profiles WHERE userId = ?", [userId], (err, result) => {
    if (err) {
      console.error("GET PROFILE ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.length === 0) {
      return res.json([]);
    }

    const profile = result[0];

    fetchSubTables(userId, (subs) => {
      res.json([buildProfileObject(profile, subs, null)]);
    });
  });
});

// ================================================
// POST /api/profiles
// ================================================
router.post("/", (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const mainRow = { userId };
  PROFILE_FIELDS.forEach((f) => {
    if (req.body[f] !== undefined) mainRow[f] = req.body[f];
  });
  mainRow.createdAt = new Date();
  mainRow.updatedAt = new Date();

  db.query("INSERT INTO profiles SET ?", mainRow, (err) => {
    if (err) {
      console.error("CREATE PROFILE ERROR:", err);
      return res.status(500).json({ error: "Insert failed" });
    }

    insertSubTables(userId, req.body, (subErr) => {
      if (subErr) {
        console.error("INSERT SUB-TABLES ERROR:", subErr);
        return res.status(500).json({ error: "Sub-table insert failed" });
      }
      res.json({ success: true, userId });
    });
  });
});

// ================================================
// PUT /api/profiles/:userId
// ================================================
router.put("/:userId", (req, res) => {
  const userId = req.params.userId;

  const updates = {};
  PROFILE_FIELDS.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });
  updates.updatedAt = new Date();

  db.query("UPDATE profiles SET ? WHERE userId = ?", [updates, userId], (err) => {
    if (err) {
      console.error("UPDATE PROFILE ERROR:", err);
      return res.status(500).json({ error: "Update failed" });
    }

    deleteSubTables(userId, () => {
      insertSubTables(userId, req.body, (subErr) => {
        if (subErr) {
          console.error("INSERT SUB-TABLES ERROR:", subErr);
          return res.status(500).json({ error: "Sub-table insert failed" });
        }
        res.json({ success: true, userId });
      });
    });
  });
});

// ================================================
// GET /api/users/:userId/profile   (for employer viewing applicant)
// ================================================
router.get("/users/:userId/profile", (req, res) => {
  const { userId } = req.params;

  db.query("SELECT * FROM users WHERE id = ?", [userId], (err, userResult) => {
    if (err) {
      console.error("GET USER ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const user = userResult[0] || null;
    const email = user ? user.email : null;
    const userName = user ? user.name : null;

    db.query("SELECT * FROM profiles WHERE userId = ?", [userId], (err2, profResult) => {
      if (err2) {
        console.error("GET PROFILE ERROR:", err2);
        return res.status(500).json({ error: "Database error" });
      }

      // No profile found — return basic user info
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
