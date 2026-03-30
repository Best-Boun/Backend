const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require('../middleware/authMiddleware');

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
  "dateOfBirth", "openToWork", "email", "linkedin", "github", "privacy",
];

// ================================================
// HELPER: fetch all sub-tables for a userId
// ================================================
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

// ================================================
// HELPER: merge profile row + sub-table rows → response object
// ================================================
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

  (experience || []).forEach((exp) => {
    inserts.push({
      table: "profile_experience",
      row: {
        userId,
        company: exp.company || null,
        role: exp.role || exp.title || null,
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
        institution: edu.institution || edu.school || null,
        degree: edu.degree || null,
        field: edu.field || null,
        startDate: edu.startDate || edu.year || null,
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
        language: lang.language || lang.name || (typeof lang === "string" ? lang : null),
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
        image: proj.image || null,
        description: proj.description || null,
        url: proj.url || proj.link || null,
        techStack: proj.techStack || proj.category || null,
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
// HELPER: upsert skills → master table → profile_skills
// ================================================
function upsertSkills(userId, skills, callback) {
  if (!skills || skills.length === 0) return callback(null);

  let done = 0;
  let errored = false;

  skills.forEach((skill) => {
    const skillName = typeof skill === 'string' ? skill : skill.name || skill.skill || '';
    const yearsExp = typeof skill === 'object' ? skill.yearsExp || 0 : 0;

    if (!skillName) { done++; if (done === skills.length) callback(null); return; }

    // หา skillId จาก master table
    db.query('SELECT id FROM skills WHERE name = ?', [skillName], (err, rows) => {
      if (errored) return;
      if (err) { errored = true; return callback(err); }

      const skillId = rows[0]?.id;
      if (!skillId) {
        // ไม่มีใน master → ข้ามไป
        done++;
        if (done === skills.length) callback(null);
        return;
      }

      // INSERT profile_skills ด้วย skillId
      db.query(
        'INSERT INTO profile_skills (userId, skillId, skill, yearsExp) VALUES (?, ?, ?, ?)',
        [userId, skillId, skillName, yearsExp],
        (err2) => {
          if (errored) return;
          if (err2) { errored = true; return callback(err2); }
          done++;
          if (done === skills.length) callback(null);
        }
      );
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
router.post("/", verifyToken, (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const mainRow = { userId };
  PROFILE_FIELDS.forEach((f) => {
    if (req.body[f] !== undefined) {
      mainRow[f] = f === 'privacy' && typeof req.body[f] === 'object'
        ? JSON.stringify(req.body[f])
        : req.body[f];
    }
  });
  mainRow.createdAt = new Date();
  mainRow.updatedAt = new Date();

  db.query("INSERT INTO profiles SET ?", mainRow, (err) => {
    if (err) {
      console.error("CREATE PROFILE ERROR:", err);
      return res.status(500).json({ error: "Insert failed" });
    }

    upsertSkills(userId, req.body.skills || [], (skillErr) => {
      if (skillErr) return res.status(500).json({ error: "Skills insert failed" });
      insertSubTables(userId, { ...req.body, skills: [] }, (subErr) => {
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
// PUT /api/profiles/:userId
// ================================================
router.put("/:userId", verifyToken, (req, res) => {
  const userId = parseInt(req.params.userId);

  const updates = {};
  PROFILE_FIELDS.forEach((f) => {
    if (req.body[f] !== undefined) {
      updates[f] = f === 'privacy' && typeof req.body[f] === 'object'
        ? JSON.stringify(req.body[f])
        : req.body[f];
    }
  });
  updates.updatedAt = new Date();

  db.query("SELECT id FROM profiles WHERE userId = ?", [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });

    if (rows.length === 0) {
      // ไม่มี profile → INSERT ใหม่
      const newRow = { userId, ...updates, createdAt: new Date() };
      db.query("INSERT INTO profiles SET ?", newRow, (err2) => {
        if (err2) return res.status(500).json({ error: "Insert failed" });
        deleteSubTables(userId, () => {
          upsertSkills(userId, req.body.skills || [], (skillErr) => {
            if (skillErr) return res.status(500).json({ error: "Skills insert failed" });
            insertSubTables(userId, { ...req.body, skills: [] }, (subErr) => {
              if (subErr) return res.status(500).json({ error: "Sub-table insert failed" });
              res.json({ success: true, userId });
            });
          });
        });
      });
    } else {
      // มีอยู่แล้ว → UPDATE ปกติ
      db.query("UPDATE profiles SET ? WHERE userId = ?", [updates, userId], (err2) => {
        if (err2) return res.status(500).json({ error: "Update failed" });

        // backup ข้อมูลเก่าก่อน
        fetchSubTables(userId, (backup) => {
          // ลบเก่า
          deleteSubTables(userId, () => {
            // insert ใหม่
            upsertSkills(userId, req.body.skills || [], (skillErr) => {
              if (skillErr) {
                return res.status(500).json({ error: "Skills insert failed" });
              }
              insertSubTables(userId, { ...req.body, skills: [] }, (subErr) => {
                if (subErr) {
                  console.error("Insert failed, restoring backup...", subErr);

                  // restore — ลบที่เพิ่งใส่ผิดออก แล้ว insert backup กลับ
                  deleteSubTables(userId, () => {
                    const backupSkills = (backup['profile_skills'] || []).map(r => ({
                      skillId: r.skillId,
                      name: r.skillName || r.skill,
                      yearsExp: r.yearsExp || 0,
                    }));
                    upsertSkills(userId, backupSkills, () => {
                      insertSubTables(userId, {
                        experience: backup['profile_experience'] || [],
                        education: backup['profile_education'] || [],
                        languages: backup['profile_languages'] || [],
                        certifications: backup['profile_certifications'] || [],
                        projects: backup['profile_projects'] || [],
                      }, (restoreErr) => {
                        if (restoreErr) console.error("Restore also failed:", restoreErr);
                        return res.status(500).json({ error: "Update failed, data restored" });
                      });
                    });
                  });
                  return;
                }
                res.json({ success: true, userId });
              });
            });
          });
        });
      });
    }
  });
});

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Profiles
 *   description: จัดการข้อมูล Profile
 */

/**
 * @swagger
 * /api/profiles:
 *   get:
 *     summary: ดึง Profile ตาม userId
 *     tags: [Profiles]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: สำเร็จ
 *       400:
 *         description: ไม่ได้ส่ง userId
 *   post:
 *     summary: สร้าง Profile ใหม่
 *     tags: [Profiles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: integer
 *               name:
 *                 type: string
 *               title:
 *                 type: string
 *               bio:
 *                 type: string
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *               experience:
 *                 type: array
 *               education:
 *                 type: array
 *     responses:
 *       200:
 *         description: สร้างสำเร็จ
 */

/**
 * @swagger
 * /api/profiles/{userId}:
 *   put:
 *     summary: อัปเดต Profile
 *     tags: [Profiles]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               title:
 *                 type: string
 *               bio:
 *                 type: string
 *               phone:
 *                 type: string
 *               location:
 *                 type: string
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 */
