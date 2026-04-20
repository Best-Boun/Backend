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
  "style",
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
      console.error(`Failed to fetch ${table}:`, err.message);
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
    style:
      typeof profile.style === "string"
        ? JSON.parse(profile.style)
        : profile.style || null,
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
      expiryDate: r.expiryDate,
      issueDate: r.date,
      url: r.url,
    })),
    projects: (subs["profile_projects"] || []).map((r) => ({
      id: r.id,
      image: r.image,
      category: r.techStack || r.category || null,
      link: r.url,
      url: r.url,
      description: r.description,
    })),
  };
}


function formatDate(d) {
  if (!d || d === "Invalid Date") return null;

  if (typeof d !== "string") return null;

  if (d.includes("-")) return d;

  const parts = d.split("/");
  if (parts.length === 3) {
    let [day, month, year] = parts;

    if (!day || !month || !year) return null;

    if (day.length === 1) day = "0" + day;
    if (month.length === 1) month = "0" + month;

    return `${year}-${month}-${day}`;
  }

  return null;
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

  // 🔥 ADD THIS BLOCK
  education.forEach((edu) => {
    inserts.push({
      table: "profile_education",
      row: {
        userId,
        institution: edu.institution || edu.school || null,
        degree: edu.degree || null,
        field: edu.field || null,
        startDate: edu.startDate || null,
        endDate: edu.endDate || null,
        grade: edu.grade || null,
      },
    });
  });

  // 🔥 ADD THIS
  languages.forEach((lang) => {
    inserts.push({
      table: "profile_languages",
      row: {
        userId,
        language: lang.language || null,
        level: lang.level || null,
      },
    });
  });

 certifications.forEach((cert) => {
   inserts.push({
     table: "profile_certifications",
     row: {
       userId,
       name: cert.name || "",
       issuer: cert.issuer || "",
       date: cert.issueDate || cert.date || null,
       expiryDate: cert.expiryDate || null,
       url: cert.url || null,
     },
   });
 });

projects.forEach((proj) => {
  inserts.push({
    table: "profile_projects",
    row: {
      userId,
      description: proj.description || "",
      url: proj.url || proj.link || "",
      image: proj.image || "",
      techStack: proj.techStack || proj.category || "",
    },
  });
});

  // (copy ส่วนอื่นเหมือนเดิม)

  for (const { table, row } of inserts) {
    try {
      await db.query(`INSERT INTO ${table} SET ?`, [row]);
    } catch (err) {
      console.error(`INSERT ERROR in ${table}:`, {
        table,
        row,
        message: err.message
      });
      throw err;
    }
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
// HELPER: upsert skills using a connection (for transactions)
// ================================================
async function upsertSkillsWithConn(conn, userId, skills) {
  if (!skills || skills.length === 0) return;
  for (const skill of skills) {
    const skillName = typeof skill === "string" ? skill : skill.name || skill.skill || "";
    const yearsExp = skill.yearsExp || 0;
    if (!skillName) continue;

    const [rows] = await conn.query("SELECT id FROM skills WHERE name = ?", [skillName]);
    let skillId = rows[0]?.id;
    if (!skillId) {
      const [result] = await conn.query("INSERT INTO skills (name) VALUES (?)", [skillName]);
      skillId = result.insertId;
    }
    await conn.query(
      "INSERT INTO profile_skills (userId, skillId, skill, yearsExp) VALUES (?, ?, ?, ?)",
      [userId, skillId, skillName, yearsExp]
    );
  }
}

// ================================================
// HELPER: insert all sub-tables using a connection (for transactions)
// ================================================
async function insertSubTablesWithConn(conn, userId, body) {
  const { experience = [], education = [], languages = [], certifications = [], projects = [] } = body;

  for (const exp of experience) {
    await conn.query("INSERT INTO profile_experience SET ?", [{
      userId, company: exp.company || null,
      role: exp.role || exp.title || null,
      startDate: exp.startDate || null,
      endDate: exp.endDate || null,
      description: exp.description || null,
    }]);
  }
  for (const edu of education) {
    await conn.query("INSERT INTO profile_education SET ?", [{
      userId, institution: edu.institution || edu.school || null,
      degree: edu.degree || null, field: edu.field || null,
      startDate: edu.startDate || null, endDate: edu.endDate || null,
      grade: edu.grade || null,
    }]);
  }
  for (const lang of languages) {
    await conn.query("INSERT INTO profile_languages SET ?", [{
      userId, language: lang.language || null, level: lang.level || null,
    }]);
  }
  for (const cert of certifications) {
    await conn.query("INSERT INTO profile_certifications SET ?", [{
      userId, name: cert.name || "", issuer: cert.issuer || "",
      date: cert.issueDate || cert.date || null,
      expiryDate: cert.expiryDate || null, url: cert.url || null,
    }]);
  }
  for (const proj of projects) {
    await conn.query("INSERT INTO profile_projects SET ?", [{
      userId, description: proj.description || "",
      url: proj.url || proj.link || "",
      image: proj.image || "", techStack: proj.techStack || proj.category || "",
    }]);
  }
}

// ================================================
// GET /api/profiles/search
// ================================================
router.get("/search", async (req, res) => {
  try {
    const { name, skill, location } = req.query;

    const conditions = [
      "u.role = 'seeker'",
      "p.name IS NOT NULL",
      "p.name != ''",
      "u.isBanned = 0",
    ];
    const params = [];

    if (name) {
      conditions.push("p.title LIKE ?");
      params.push(`%${name}%`);
    }
    if (skill) {
      conditions.push(
        "p.userId IN (SELECT ps2.userId FROM profile_skills ps2 JOIN skills s2 ON ps2.skillId = s2.id WHERE s2.name LIKE ?)"
      );
      params.push(`%${skill}%`);
    }
    if (location) {
      conditions.push("p.location LIKE ?");
      params.push(`%${location}%`);
    }

    const sql = `
      SELECT DISTINCT
        p.userId, p.name, p.title, p.location,
        p.profileImage, p.openToWork,
        GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') AS skillNames
      FROM profiles p
      JOIN users u ON p.userId = u.id
      LEFT JOIN profile_skills ps ON p.userId = ps.userId
      LEFT JOIN skills s ON ps.skillId = s.id
      WHERE ${conditions.join(" AND ")}
      GROUP BY p.userId
      ORDER BY p.name ASC
      LIMIT 50
    `;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

// ================================================
// GET /api/profiles?userId=:userId
// ================================================
/**
 * @swagger
 * /api/profiles:
 *   get:
 *     summary: ดึงข้อมูลโปรไฟล์ผู้ใช้
 *     description: Fetch user profile including style customization settings
 *     tags: [Profiles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID to fetch profile for
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: integer
 *                   example: 1
 *                 name:
 *                   type: string
 *                   example: "สมชาย ใจดี"
 *                 title:
 *                   type: string
 *                   example: "Senior Frontend Developer"
 *                 summary:
 *                   type: string
 *                 profileImage:
 *                   type: string
 *                 skills:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["React", "TypeScript", "Node.js"]
 *                 style:
 *                   type: object
 *                   properties:
 *                     themeIdx:
 *                       type: integer
 *                       example: 0
 *                     accent:
 *                       type: string
 *                       example: "#4f46e5"
 *                     fontId:
 *                       type: string
 *                       example: "geist"
 *                     layout:
 *                       type: string
 *                       example: "sidebar"
 *       400:
 *         description: Bad request - userId required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/", async (req, res) => {
  try {
    const { userId: userIdStr } = req.query;

    if (!userIdStr) {
      return res.status(400).json({ error: "userId is required" });
    }

    const userId = Number(userIdStr);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid userId" });
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
      return res.status(404).json({ error: "Profile not found" });
    }

    const profile = result[0];
    const subs = await fetchSubTables(userId);

    return res.json(buildProfileObject(profile, subs, null));
  } catch (err) {
    console.error("GET PROFILE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================================================
// POST /api/profiles
// ================================================
/**
 * @swagger
 * /api/profiles:
 *   post:
 *     summary: สร้างโปรไฟล์ใหม่
 *     description: Create a new user profile with personal information, skills, experience, education, etc. Requires authentication.
 *     tags: [Profiles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: integer
 *                 example: 42
 *                 description: User ID (must match authenticated user)
 *               name:
 *                 type: string
 *                 example: "สมชาย ใจดี"
 *                 description: Full name
 *               title:
 *                 type: string
 *                 example: "Senior Frontend Developer"
 *                 description: Job title
 *               bio:
 *                 type: string
 *                 example: "Passionate about web development"
 *                 description: Short bio
 *               summary:
 *                 type: string
 *                 example: "10+ years of experience in full stack development"
 *                 description: Detailed professional summary
 *               phone:
 *                 type: string
 *                 example: "+66812345678"
 *               location:
 *                 type: string
 *                 example: "Bangkok, Thailand"
 *               website:
 *                 type: string
 *                 example: "https://portfolio.example.com"
 *               profileImage:
 *                 type: string
 *                 example: "https://avatars.example.com/user.jpg"
 *               availability:
 *                 type: string
 *                 enum: ["immediately", "2weeks", "4weeks"]
 *                 example: "immediately"
 *               salaryRange:
 *                 type: string
 *                 example: "60000-80000"
 *               gender:
 *                 type: string
 *                 enum: ["male", "female", "other"]
 *               nationality:
 *                 type: string
 *                 example: "Thai"
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: "1990-01-15"
 *               openToWork:
 *                 type: boolean
 *                 example: true
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               linkedin:
 *                 type: string
 *                 example: "https://linkedin.com/in/user"
 *               github:
 *                 type: string
 *                 example: "https://github.com/user"
 *               privacy:
 *                 type: object
 *                 properties:
 *                   phone:
 *                     type: boolean
 *                   email:
 *                     type: boolean
 *                   dateOfBirth:
 *                     type: boolean
 *                   salary:
 *                     type: boolean
 *               style:
 *                 type: object
 *                 description: Profile styling preferences
 *                 properties:
 *                   themeIdx:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 7
 *                     example: 0
 *                   accent:
 *                     type: string
 *                     example: "#0066cc"
 *                   fontId:
 *                     type: string
 *                     enum: ["geist", "lora", "mono", "fraunces", "syne"]
 *                     example: "geist"
 *                   cover:
 *                     type: string
 *                     example: "https://example.com/cover.jpg"
 *                   coverBlur:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 16
 *                     example: 0
 *                   showCover:
 *                     type: boolean
 *                     example: true
 *                   fontSize:
 *                     type: integer
 *                     minimum: 12
 *                     maximum: 20
 *                     example: 16
 *                   lineSpacing:
 *                     type: integer
 *                     minimum: 16
 *                     maximum: 48
 *                     example: 24
 *                   cardRadius:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 32
 *                     example: 8
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["JavaScript", "React", "Node.js"]
 *                 description: Array of skill names
 *               experience:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     company:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     description:
 *                       type: string
 *               education:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     school:
 *                       type: string
 *                     degree:
 *                       type: string
 *                     field:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *               languages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     language:
 *                       type: string
 *                     proficiency:
 *                       type: string
 *                       enum: ["elementary", "limited", "professional", "fluent", "native"]
 *               certifications:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     issuer:
 *                       type: string
 *                     issueDate:
 *                       type: string
 *                       format: date
 *                     expirationDate:
 *                       type: string
 *                       format: date
 *               projects:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     link:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *     responses:
 *       201:
 *         description: Profile created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 userId:
 *                   type: integer
 *                   example: 42
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "userId is required"
 *       401:
 *         description: Unauthorized - missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "No token provided"
 *       403:
 *         description: Forbidden - userId doesn't match authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Forbidden"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Insert failed"
 */
router.post("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, title, style } = req.body;

    // Validate required fields
    if (!name || !title) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Prepare insert data
    const profileData = {
      userId,
      name,
      title,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add optional fields
    if (req.body.phone) profileData.phone = req.body.phone;
    if (req.body.bio) profileData.bio = req.body.bio;
    if (req.body.summary) profileData.summary = req.body.summary;
    if (req.body.location) profileData.location = req.body.location;
    if (req.body.website) profileData.website = req.body.website;
    if (req.body.profileImage) profileData.profileImage = req.body.profileImage;
    if (req.body.availability) profileData.availability = req.body.availability;
    if (req.body.salaryRange) profileData.salaryRange = req.body.salaryRange;
    if (req.body.gender) profileData.gender = req.body.gender;
    if (req.body.nationality) profileData.nationality = req.body.nationality;
    if (req.body.dateOfBirth) profileData.dateOfBirth = req.body.dateOfBirth;
    if (req.body.openToWork !== undefined) profileData.openToWork = req.body.openToWork;
    if (req.body.email) profileData.email = req.body.email;
    if (req.body.linkedin) profileData.linkedin = req.body.linkedin;
    if (req.body.github) profileData.github = req.body.github;
    if (req.body.privacy) {
      profileData.privacy = typeof req.body.privacy === "object" ? JSON.stringify(req.body.privacy) : req.body.privacy;
    }
    if (style) {
      profileData.style = typeof style === "object" ? JSON.stringify(style) : style;
    }

    // Insert profile
    await db.query("INSERT INTO profiles SET ?", [profileData]);

    // Insert skills and sub-tables
    await upsertSkillsAsync(userId, req.body.skills || []);
    await insertSubTablesAsync(userId, { ...req.body, skills: [] });

    res.status(201).json({ success: true, userId });

  } catch (err) {
    // Handle duplicate profile
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Profile already exists" });
    }

    console.error("CREATE PROFILE ERROR:", err);
    res.status(500).json({ error: "Insert failed" });
  }
});

// ================================================
// PUT /api/profiles/:userId
// ================================================
/**
 * @swagger
 * /api/profiles/{userId}:
 *   put:
 *     summary: อัปเดตโปรไฟล์และการตั้งค่ารูปแบบ
 *     description: Update user profile data and save profile styling (layout, theme, font, etc)
 *     tags: [Profiles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID to update profile for
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "สมชาย ใจดี"
 *               title:
 *                 type: string
 *                 example: "Senior Frontend Developer"
 *               summary:
 *                 type: string
 *               profileImage:
 *                 type: string
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *               style:
 *                 type: object
 *                 properties:
 *                   themeIdx:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 7
 *                   accent:
 *                     type: string
 *                   fontId:
 *                     type: string
 *                     enum: ["geist", "lora", "mono", "fraunces", "syne"]
 *                   cover:
 *                     type: string
 *                   coverBlur:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 16
 *                   showCover:
 *                     type: boolean
 *                   fontSize:
 *                     type: integer
 *                     minimum: 12
 *                     maximum: 20
 *                   lineSpacing:
 *                     type: integer
 *                     minimum: 16
 *                     maximum: 48
 *                   cardRadius:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 24
 *                   shadowPx:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 48
 *                   layout:
 *                     type: string
 *                     enum: ["sidebar", "minimal", "grid", "split", "card"]
 *                   darkMode:
 *                     type: boolean
 *                   sectionOrder:
 *                     type: array
 *                     items:
 *                       type: string
 *                   alignment:
 *                     type: string
 *                     enum: ["left", "center"]
 *                   containerWidth:
 *                     type: string
 *                     enum: ["sm", "md", "lg", "full"]
 *                   animation:
 *                     type: string
 *                     enum: ["none", "fade", "slide"]
 *                   headerStyle:
 *                     type: string
 *                     enum: ["classic", "banner", "compact"]
 *                   skillStyle:
 *                     type: string
 *                     enum: ["pill", "badge", "bar", "dot"]
 *                   timelineStyle:
 *                     type: string
 *                     enum: ["line", "compact", "card"]
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 userId:
 *                   type: integer
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       403:
 *         description: Forbidden - cannot update other user's profile
 *       500:
 *         description: Server error
 */
router.put("/:userId", verifyToken, async (req, res) => {
  let conn;
  try {
    const { userId: userIdStr } = req.params;

    if (!userIdStr) {
      return res.status(400).json({ error: "userId is required" });
    }

    const userId = Number(userIdStr);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    // Check if profile exists
    const [existingProfile] = await conn.query(
      "SELECT id FROM profiles WHERE userId = ?",
      [userId]
    );

    if (existingProfile.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Prepare updates
    const updates = {};
    PROFILE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] =
          (field === "privacy" || field === "style") && typeof req.body[field] === "object"
            ? JSON.stringify(req.body[field])
            : req.body[field];
      }
    });
    updates.updatedAt = new Date();

    // Update profile
    await conn.query("UPDATE profiles SET ? WHERE userId = ?", [updates, userId]);

    // Update profile image in users table
    if (updates.profileImage) {
      await conn.query("UPDATE users SET profileImage = ? WHERE id = ?", [
        updates.profileImage,
        userId,
      ]);
    }

    // Delete old sub-table entries
    for (const table of SUB_TABLES) {
      await conn.query(`DELETE FROM ${table} WHERE userId = ?`, [userId]);
    }

    // Insert new skills
    await upsertSkillsWithConn(conn, userId, req.body.skills || []);

    // Insert new sub-tables
    await insertSubTablesWithConn(conn, userId, { ...req.body, skills: [] });

    await conn.commit();
    res.json({ success: true, userId });

  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("ROLLBACK ERROR:", rollbackErr);
      }
    }
    console.error("UPDATE PROFILE ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  } finally {
    if (conn) {
      conn.release();
    }
  }
});
    
module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Profiles
 *   description: จัดการข้อมูล Profile
 */


