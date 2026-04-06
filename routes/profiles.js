const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require("../middleware/authMiddleware");

const SUB_TABLES = [
  "profile_skills",
  "profile_experience",
  "profile_education",
  "profile_languages",
  "profile_certifications",
  "profile_projects",
];

const PROFILE_FIELDS = [
  "name",
  "title",
  "bio",
  "summary",
  "phone",
  "location",
  "website",
  "profileImage",
  "availability",
  "salaryRange",
  "gender",
  "nationality",
  "dateOfBirth",
  "openToWork",
  "email",
  "linkedin",
  "github",
  "privacy",
];

// ================================================
// HELPER: fetch all sub-tables for a userId
// ================================================
async function fetchSubTables(userId) {
  const results = {};

  for (const table of SUB_TABLES) {
    try {
      let query =
        table === "profile_skills"
          ? `SELECT ps.*, s.name AS skillName, s.category AS skillCategory
             FROM profile_skills ps
             LEFT JOIN skills s ON ps.skillId = s.id
             WHERE ps.userId = ?`
          : `SELECT * FROM ${table} WHERE userId = ?`;

      const [rows] = await db.query(query, [userId]);
      results[table] = rows;
    } catch (err) {
      console.log("fetch error:", table, err);
      results[table] = [];
    }
  }

  return results;
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
    profileImage: profile.profileImage || profile.userProfileImage || null,
    name: profile.name || profile.userName || null,
    availability: profile.availability || null,
    salaryRange: profile.salaryRange || null,
    gender: profile.gender || null,
    nationality: profile.nationality || null,
    dateOfBirth: profile.dateOfBirth || null,
    openToWork: !!profile.openToWork,
    privacy:
      typeof profile.privacy === "string"
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
async function insertSubTablesAsync(userId, body) {
  const {
    experience = [],
    education = [],
    languages = [],
    certifications = [],
    projects = [],
  } = body;

  const inserts = [];

  experience.forEach((exp) => {
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

  // (copy ส่วนอื่นเหมือนเดิม)

  for (const { table, row } of inserts) {
   await db.query(`INSERT INTO ${table} SET ?`, [row]);
  }
}

// ================================================
// HELPER: upsert skills → master table → profile_skills
// ================================================
function upsertSkills(userId, skills, callback) {
  if (!skills || skills.length === 0) return callback(null);

  let done = 0;
  let finished = false;

  skills.forEach((skill) => {
    const skillName =
      typeof skill === "string" ? skill : skill.name || skill.skill || "";
    const yearsExp = typeof skill === "object" ? skill.yearsExp || 0 : 0;

    if (!skillName) {
      done++;
      if (done === skills.length && !finished) {
        finished = true;
        callback(null);
      }
      return;
    }

    db.query(
      "SELECT id FROM skills WHERE name = ?",
      [skillName],
      (err, rows) => {
        if (finished) return;

        if (err) {
          finished = true;
          return callback(err);
        }

        const skillId = rows[0]?.id;

        if (!skillId) {
          // 🔥 insert skill ใหม่เข้า master table ก่อน
          db.query(
            "INSERT INTO skills (name) VALUES (?)",
            [skillName],
            (err3, result3) => {
              if (err3) return callback(err3);

              const newSkillId = result3.insertId;

              db.query(
                "INSERT INTO profile_skills (userId, skillId, skill, yearsExp) VALUES (?, ?, ?, ?)",
                [userId, newSkillId, skillName, yearsExp],
                (err4) => {
                  if (err4) return callback(err4);

                  done++;
                  if (done === skills.length && !finished) {
                    finished = true;
                    callback(null);
                  }
                },
              );
            },
          );
          return;
        }

        db.query(
          "INSERT INTO profile_skills (userId, skillId, skill, yearsExp) VALUES (?, ?, ?, ?)",
          [userId, skillId, skillName, yearsExp],
          (err2) => {
            if (finished) return;

            if (err2) {
              finished = true;
              return callback(err2);
            }

            done++;
            if (done === skills.length && !finished) {
              finished = true;
              callback(null);
            }
          },
        );
      },
    );
  });
}

// ================================================
// HELPER: delete all sub-tables for a userId
// ================================================
function deleteSubTables(userId, callback) {
  let done = 0;
  let finished = false;

  SUB_TABLES.forEach((table) => {
    db.query(`DELETE FROM ${table} WHERE userId = ?`, [userId], (err) => {
      if (finished) return;

      if (err) {
        finished = true;
        return callback(err);
      }

      done++;
      if (done === SUB_TABLES.length) {
        finished = true;
        callback(null);
      }
    });
  });
}

// ================================================
// HELPER: delete all sub-tables (ASYNC VERSION)
// ================================================
async function deleteSubTablesAsync(userId) {
  for (const table of SUB_TABLES) {
    await db.query(`DELETE FROM ${table} WHERE userId = ?`, [userId]);
  }
}

// ================================================
// HELPER: upsert skills (ASYNC)
// ================================================
async function upsertSkillsAsync(userId, skills) {
  if (!skills || skills.length === 0) return;

  for (const skill of skills) {
    const skillName =
      typeof skill === "string" ? skill : skill.name || skill.skill || "";
    const yearsExp = skill.yearsExp || 0;

    if (!skillName) continue;

    // 🔍 หา skill ก่อน
    const [rows] = await db.query(
      "SELECT id FROM skills WHERE name = ?",
      [skillName]
    );

    let skillId = rows[0]?.id;

    // 🔥 ถ้าไม่มี → insert ใหม่
    if (!skillId) {
      const [result] = await db.query(
        "INSERT INTO skills (name) VALUES (?)",
        [skillName]
      );
      skillId = result.insertId;
    }

    // 🔥 insert profile_skills
    await db.query(
      "INSERT INTO profile_skills (userId, skillId, skill, yearsExp) VALUES (?, ?, ?, ?)",
      [userId, skillId, skillName, yearsExp]
    );
  }
}



// ================================================
// GET /api/profiles?userId=:userId
// ================================================
router.get("/", async (req, res) => {
  const userId = parseInt(req.query.userId);

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

 const [result] = await db.query(
   `SELECT 
    p.*, 
    u.profileImage AS userProfileImage,
    u.name AS userName
   FROM profiles p
   LEFT JOIN users u ON p.userId = u.id
   WHERE p.userId = ?`,
   [userId],
 );

if (result.length === 0) {
  const [userRows] = await db.query(
    "SELECT profileImage, name FROM users WHERE id = ?",
    [userId],
  );

  if (!userRows.length) {
    return res.json({ profileImage: null, name: null });
  }

  return res.json({
    userId: userId, // ⭐ ใส่อันนี้เข้าไป
    profileImage: userRows[0].profileImage,
    name: userRows[0].name,
  });
}

const profile = result[0];

const subs = await fetchSubTables(userId);

return res.json(buildProfileObject(profile, subs, null));
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
      mainRow[f] =
        f === "privacy" && typeof req.body[f] === "object"
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
      if (skillErr)
        return res.status(500).json({ error: "Skills insert failed" });
      insertSubTables(userId, { ...req.body, skills: [] }, (subErr) => {
        if (subErr) {
          console.error("INSERT SUB-TABLES ERROR:", subErr);
          return res.status(500).json({ error: "Sub-table insert failed" });
        }
        return res.json({ success: true, userId });
      });
    });
  });
});

// ================================================
// PUT /api/profiles/:userId
// ================================================
router.put("/:userId", verifyToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    const updates = {};
    PROFILE_FIELDS.forEach((f) => {
      if (req.body[f] !== undefined) {
        updates[f] =
          f === "privacy" && typeof req.body[f] === "object"
            ? JSON.stringify(req.body[f])
            : req.body[f];
      }
    });
    updates.updatedAt = new Date();

   const [rows] = await db.query("SELECT id FROM profiles WHERE userId = ?", [
     userId,
   ]);

    // 🔥 INSERT
    if (rows.length === 0) {
      const newRow = { userId, ...updates, createdAt: new Date() };

      await db.query("INSERT INTO profiles SET ?", [newRow]);
    }
    // 🔥 UPDATE
    else {
      await db.query("UPDATE profiles SET ? WHERE userId = ?", [
        updates,
        userId,
      ]);
    }

    // 🔥 update profileImage ใน users
    if (updates.profileImage) {
      await db.query("UPDATE users SET profileImage = ? WHERE id = ?", [
        updates.profileImage,
        userId,
      ]);
    }

    // console.log("STEP 1");

    await deleteSubTablesAsync(userId);

    // console.log("STEP 2");

    await upsertSkillsAsync(userId, req.body.skills || []);

    // console.log("STEP 3");

    await insertSubTablesAsync(userId, {
      ...req.body,
      skills: [],
    });

    // console.log("STEP 4");

    return res.json({ success: true, userId });
  } catch (err) {
    console.log("ERROR:", err);
    return res.status(500).json({ error: "Update failed" });
  }
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
