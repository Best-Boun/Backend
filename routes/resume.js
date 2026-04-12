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
    jobTitle:     jobTitle     !== undefined ? String(jobTitle).trim() : f.jobTitle     || "",
    summary:      summary      !== undefined ? String(summary).trim()  : f.summary      || "",
    skills:       Array.isArray(skills)     ? skills                  : f.skills       || [],
    education:    Array.isArray(education)  ? education               : f.education    || [],
    experience:   Array.isArray(experience) ? experience              : f.experience   || [],
    languages:    Array.isArray(languages)  ? languages               : f.languages    || [],
    profileImage: profileImage !== undefined ? String(profileImage)   : f.profileImage || "",
    template:     ["modern", "minimal", "bold", "forest", "dusk"].includes(template)
      ? template
      : f.template || "modern",
  });
}

function parseResumeData(dataJson) {
  try {
    return typeof dataJson === "string" ? JSON.parse(dataJson) : dataJson;
  } catch (err) {
    console.error("Failed to parse resume data:", err);
    return null;
  }
}

/* GET /api/resume/me - Get current user's resume */
/**
 * @swagger
 * /api/resume/me:
 *   get:
 *     summary: ดึงข้อมูลเรซูเม่ของผู้ใช้ปัจจุบัน
 *     description: Fetch the resume for the currently authenticated user
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resume retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     fullName:
 *                       type: string
 *                       example: "สมชาย ใจดี"
 *                     jobTitle:
 *                       type: string
 *                       example: "Senior Frontend Developer"
 *                     summary:
 *                       type: string
 *                     profileImage:
 *                       type: string
 *                     skills:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["React", "TypeScript"]
 *                     experience:
 *                       type: array
 *                       items:
 *                         type: object
 *                     education:
 *                       type: array
 *                       items:
 *                         type: object
 *                     languages:
 *                       type: array
 *                       items:
 *                         type: object
 *                     template:
 *                       type: string
 *                       enum: ["modern", "minimal", "bold", "forest", "dusk"]
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Server error
 */
router.get("/me", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, data, created_at, updated_at FROM resumes WHERE user_id = ? LIMIT 1",
      [req.user.id]
    );

    if (!rows || rows.length === 0) {
      return res.json({ success: true, data: null });
    }

    const resumeData = parseResumeData(rows[0].data);
    if (!resumeData) {
      return res.status(500).json({ 
        success: false, 
        message: "Failed to parse resume data" 
      });
    }

    res.json({
      success: true,
      data: {
        id: rows[0].id,
        ...resumeData,
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at,
      },
    });
  } catch (err) {
    console.error("GET /resume/me ERROR:", err);
    res.status(500).json({ success: false, message: "Failed to fetch resume" });
  }
});

/* POST /api/resume - Create or upsert resume */
/**
 * @swagger
 * /api/resume:
 *   post:
 *     summary: สร้างเรซูเม่ใหม่
 *     description: Create a new resume for the current user (upserts if one already exists)
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "สมชาย ใจดี"
 *               jobTitle:
 *                 type: string
 *               summary:
 *                 type: string
 *               profileImage:
 *                 type: string
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *               experience:
 *                 type: array
 *                 items:
 *                   type: object
 *               education:
 *                 type: array
 *                 items:
 *                   type: object
 *               languages:
 *                 type: array
 *                 items:
 *                   type: object
 *               template:
 *                 type: string
 *                 enum: ["modern", "minimal", "bold", "forest", "dusk"]
 *     responses:
 *       200:
 *         description: Resume created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request - fullName required
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Server error
 */
router.post("/", verifyToken, async (req, res) => {
  if (!req.body.fullName || !req.body.fullName.trim()) {
    return res.status(400).json({ 
      success: false, 
      message: "fullName is required" 
    });
  }

  try {
    const dataJson = buildDataJson(req.body);

    const [result] = await db.query(
      `INSERT INTO resumes (user_id, data) 
       VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
      [req.user.id, dataJson]
    );

    let resumeId = result.insertId;
    if (!resumeId) {
      const [existing] = await db.query(
        "SELECT id FROM resumes WHERE user_id = ? LIMIT 1",
        [req.user.id]
      );
      if (existing && existing.length > 0) {
        resumeId = existing[0].id;
      }
    }

    res.json({
      success: true,
      message: result.affectedRows ? "Resume updated" : "Resume created",
      data: {
        id: resumeId,
        ...JSON.parse(dataJson),
      },
    });
  } catch (err) {
    console.error("POST /resume ERROR:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to save resume" 
    });
  }
});

/**
 * @swagger
 * /api/resume/{id}:
 *   put:
 *     summary: อัปเดตเรซูเม่ตาม ID
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Resume ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "John Doe"
 *               currentPosition:
 *                 type: string
 *                 example: "Senior Developer"
 *               summary:
 *                 type: string
 *                 example: "Experienced software engineer..."
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john@example.com"
 *               phone:
 *                 type: string
 *                 example: "+66812345678"
 *               location:
 *                 type: string
 *                 example: "Bangkok, Thailand"
 *               experience:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     company:
 *                       type: string
 *                     position:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                     endDate:
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
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *               certifications:
 *                 type: array
 *                 items:
 *                   type: string
 *               languages:
 *                 type: array
 *                 items:
 *                   type: string
 *               portfolio:
 *                 type: string
 *               template:
 *                 type: string
 *                 enum: [modern, classic, creative]
 *     responses:
 *       200:
 *         description: Resume updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Resume updated"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     fullName:
 *                       type: string
 *                     currentPosition:
 *                       type: string
 *                     summary:
 *                       type: string
 *                     email:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     location:
 *                       type: string
 *                     template:
 *                       type: string
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - invalid ID or missing fullName
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       403:
 *         description: Forbidden - cannot modify another user's resume
 *       500:
 *         description: Server error
 */
router.put("/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(id)) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid resume ID" 
    });
  }

  if (!req.body.fullName || !req.body.fullName.trim()) {
    return res.status(400).json({ 
      success: false, 
      message: "fullName is required" 
    });
  }

  try {
    // Check ownership
    const [ownership] = await db.query(
      "SELECT id FROM resumes WHERE id = ? AND user_id = ? LIMIT 1",
      [id, req.user.id]
    );

    if (!ownership || ownership.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: "Resume not found or access denied" 
      });
    }

    const dataJson = buildDataJson(req.body);
    await db.query(
      "UPDATE resumes SET data = ?, updated_at = NOW() WHERE id = ? AND user_id = ?",
      [dataJson, id, req.user.id]
    );

    res.json({
      success: true,
      message: "Resume updated successfully",
      data: {
        id: parseInt(id),
        ...JSON.parse(dataJson),
      },
    });
  } catch (err) {
    console.error("PUT /resume/:id ERROR:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to update resume" 
    });
  }
});

module.exports = router;