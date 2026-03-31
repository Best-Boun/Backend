const express = require("express");
const router = express.Router();
const db = require("../db");

const verifyToken = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");

// ==========================
// GET ALL USERS
// ==========================
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: ดึงรายชื่อผู้ใช้ทั้งหมด
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: success
 */
router.get("/", verifyToken, isAdmin, (req, res) => {
  const sql =
    "SELECT id, name AS username, email, role, IFNULL(isBanned, 0) AS isBanned FROM users";

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});

// ==========================
// GET CURRENT USER
// ==========================
/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: ดึงข้อมูลผู้ใช้ที่ login อยู่
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: success
 */
router.get("/me", verifyToken, (req, res) => {
  const sql = `
    SELECT id, name AS username, email, role, profileImage
    FROM users
    WHERE id = ?
  `;

  db.query(sql, [req.user.id], (err, result) => {
    if (err) return res.status(500).json(err);
    if (!result[0]) return res.status(404).json({ message: "User not found" });

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

// ==========================
// PUT /api/users/:id  (admin update role/ban)
// ==========================
/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: อัปเดต role หรือสถานะ ban ของผู้ใช้ (Admin เท่านั้น)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID ของผู้ใช้
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, employer, admin]
 *                 example: employer
 *               isBanned:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Updated
 *       400:
 *         description: ไม่มี field ที่จะอัปเดต
 *       404:
 *         description: ไม่พบผู้ใช้
 *       403:
 *         description: Admin เท่านั้น
 */
router.put('/:id', verifyToken, isAdmin, (req, res) => {
  const { id } = req.params;
  const { role, isBanned } = req.body;
  const fields = [];
  const values = [];
  if (role !== undefined) { fields.push('role = ?'); values.push(role); }
  if (isBanned !== undefined) { fields.push('isBanned = ?'); values.push(isBanned ? 1 : 0); }
  if (fields.length === 0) return res.status(400).json({ message: 'No fields to update' });
  values.push(id);
  db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values, (err, result) => {
    if (err) return res.status(500).json(err);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Updated' });
  });
});

// ==========================
// DELETE /api/users/:id  (admin delete)
// ==========================
/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: ลบผู้ใช้ (Admin เท่านั้น)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID ของผู้ใช้
 *     responses:
 *       200:
 *         description: ลบสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Deleted
 *       404:
 *         description: ไม่พบผู้ใช้
 *       403:
 *         description: Admin เท่านั้น
 */
router.delete('/:id', verifyToken, isAdmin, (req, res) => {
  const { id } = req.params;

  const dependentTables = [
    'profile_skills', 'profile_experience', 'profile_education',
    'profile_languages', 'profile_certifications', 'profile_projects',
    'profiles', 'likes', 'job_applications', 'posts', 'jobs', 'company_profiles'
  ];

  // ลบ dependent records ทีละตาราง แล้วค่อยลบ user
  let idx = 0;
  const deleteNext = () => {
    if (idx >= dependentTables.length) {
      db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ message: 'Delete user failed', error: err.message });
        if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });
        return res.json({ message: 'Deleted' });
      });
      return;
    }
    const table = dependentTables[idx++];
    db.query(`DELETE FROM ${table} WHERE userId = ?`, [id], (err) => {
      if (err) return res.status(500).json({ message: `Delete from ${table} failed`, error: err.message });
      deleteNext();
    });
  };

  deleteNext();
});

/**
 * @swagger
 * /api/users/{userId}/profile:
 *   get:
 *     summary: ดึงข้อมูล profile สาธารณะของผู้ใช้
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID ของผู้ใช้
 *     responses:
 *       200:
 *         description: ข้อมูล profile ของผู้ใช้
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: integer
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 title:
 *                   type: string
 *                 bio:
 *                   type: string
 *                 skills:
 *                   type: array
 *                   items:
 *                     type: object
 *                 experience:
 *                   type: array
 *                   items:
 *                     type: object
 *                 education:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Database error
 */
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
