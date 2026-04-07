const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require("../middleware/authMiddleware");


function parseJSON(data) {
  try {
    return JSON.parse(data || "[]");
  } catch (err) {
    console.error("JSON parse error:", err);
    return [];
  }
}

// ==========================
// GET ALL JOBS (with filters)
// ==========================

router.get("/", async (req, res) => {
  try {
    

    const { search, location, type, level } = req.query;

    let sql = "SELECT * FROM jobs WHERE active = 1";
    const params = [];

    if (search) {
      sql += " AND (title LIKE ? OR company LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    if (location) {
      sql += " AND location = ?";
      params.push(location);
    }

    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }

    if (level) {
      sql += " AND level = ?";
      params.push(level);
    }

    sql += " ORDER BY postedDate DESC";

    // 🔥 ตรงนี้สำคัญ
    const [result] = await db.query(sql, params);

    const jobs = (result || []).map((job) => ({
      ...job,
      requirements: parseJSON(job.requirements),
      benefits: parseJSON(job.benefits),
    }));

    const jobIds = jobs.map((j) => j.id);
    if (jobIds.length === 0) return res.json(jobs);

    const [skillRows] = await db.query(
      `SELECT js.jobId, js.skillId, js.requiredLevel, js.weight, js.required, s.name AS skill
       FROM job_skills js
       JOIN skills s ON js.skillId = s.id
       WHERE js.jobId IN (?)`,
      [jobIds]
    );

    const skillMap = {};
    skillRows.forEach((row) => {
      if (!skillMap[row.jobId]) skillMap[row.jobId] = [];
      skillMap[row.jobId].push({
        skillId: row.skillId,
        skill: row.skill,
        requiredLevel: row.requiredLevel,
        weight: row.weight || 2,
        required: Boolean(row.required),
      });
    });

    const jobsWithSkills = jobs.map((job) => ({
      ...job,
      jobSkills: skillMap[job.id] || [],
    }));

    return res.json(jobsWithSkills);
  } catch (err) {
    console.error("GET JOBS ERROR:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

// ==========================
// GET FILTER OPTIONS (distinct values)
// ==========================
router.get("/filters/options", (req, res) => {
  const queries = {
    locations:
      "SELECT DISTINCT location FROM jobs WHERE active=1 ORDER BY location",
    types: "SELECT DISTINCT type FROM jobs WHERE active=1 ORDER BY type",
    levels: "SELECT DISTINCT level FROM jobs WHERE active=1 ORDER BY level",
  };

  const results = {};
  const keys = Object.keys(queries);
  let done = 0;

  keys.forEach((key) => {
    db.query(queries[key], (err, rows) => {
      if (err) {
        console.error(`FILTER ${key} ERROR:`, err);
        results[key] = [];
      } else {
        results[key] = rows.map((r) => Object.values(r)[0]);
      }

      done++;
      if (done === keys.length) {
        res.json(results);
      }
    });
  });
});

// ==========================
// GET USER'S APPLICATIONS
// ==========================
router.get("/applications/:userId", async (req, res) => {
  try {
    const sql = `
      SELECT ja.*, j.title, j.company, j.logo, j.location, j.salary
      FROM job_applications ja
      JOIN jobs j ON ja.jobId = j.id
      WHERE ja.userId = ?
      ORDER BY ja.appliedAt DESC
    `;
    const [result] = await db.query(sql, [req.params.userId]);
    res.json(result);
  } catch (err) {
    console.error("GET APPLICATIONS ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ==========================
// UPDATE APPLICATION STATUS
// ==========================
router.patch("/applications/:appId/status", async (req, res) => {
  try {
    const { status } = req.body;
    const VALID_STATUSES = ["Applied", "Interview", "Offer", "Rejected"];

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: "status must be one of: Applied, Interview, Offer, Rejected",
      });
    }

    await db.query(
      "UPDATE job_applications SET status = ? WHERE id = ?",
      [status, req.params.appId]
    );
    res.json({ success: true, id: req.params.appId, status });

    try {
      const [rows] = await db.query(
        'SELECT ja.userId, j.title FROM job_applications ja JOIN jobs j ON ja.jobId = j.id WHERE ja.id = ?',
        [req.params.appId]
      );
      if (rows[0]) {
        const { userId: seekerId, title } = rows[0];
        await db.query(
          'INSERT INTO notifications (userId, type, message) VALUES (?, ?, ?)',
          [seekerId, 'status_changed', `Your application for "${title}" was updated to ${status}`]
        );
      }
    } catch (e) {
      console.error("NOTIFY ERROR:", e);
    }
  } catch (err) {
    console.error("UPDATE STATUS ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// ==========================
// DELETE APPLICATION
// ==========================
router.delete("/applications/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT jobId FROM job_applications WHERE id = ?",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });

    const jobId = rows[0].jobId;
    await db.query("DELETE FROM job_applications WHERE id = ?", [req.params.id]);
    await db.query(
      "UPDATE jobs SET applicants = GREATEST(applicants - 1, 0) WHERE id = ?",
      [jobId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// ==========================
// GET APPLICANTS FOR A JOB
// ==========================
router.get("/:jobId/applicants", (req, res) => {
  // Step 1: ดึง job_skills
  db.query(
    "DELETE FROM job_applications WHERE id = ?",
    [req.params.id],
    (err) => {
      if (err) {
        console.error("DELETE APPLICATION ERROR:", err);
        return res.status(500).json({ error: "Delete failed" });
      }
      res.json({ success: true });
    },
  );
});

// ==========================
// EMPLOYER — ALL JOBS (manage)
// ==========================
router.get("/manage", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const [result] = await db.query(
      "SELECT * FROM jobs WHERE userId = ? ORDER BY postedDate DESC",
      [userId]
    );

    res.json(
      result.map((job) => ({
        ...job,
        requirements: parseJSON(job.requirements),
        benefits: parseJSON(job.benefits),
      }))
    );
  } catch (err) {
    console.error("MANAGE JOB ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ==========================
// GET APPLICANTS FOR A JOB
// ==========================
router.get("/:jobId/applicants", async (req, res) => {
  try {
    const jobId = req.params.jobId;

    // 🔥 step 1: job skills
    const [skillRows] = await db.query(
      `SELECT js.jobId, js.skillId, js.requiredLevel, s.name AS skill
       FROM job_skills js
       JOIN skills s ON js.skillId = s.id
       WHERE js.jobId = ?`,
      [jobId],
    );

    // 🔥 step 2: applicants
    const [rows] = await db.query(
      `SELECT
        ja.id, ja.userId, ja.jobId, ja.status, ja.appliedAt,
        u.name AS username,
        p.name AS profileName,
        p.title, p.profileImage,
        j.title AS jobTitle,
        GROUP_CONCAT(DISTINCT CONCAT(ps.skillId, ':', ps.yearsExp, ':', s.name)) AS skillData
      FROM job_applications ja
      JOIN users u ON ja.userId = u.id
      JOIN jobs j ON ja.jobId = j.id
      LEFT JOIN profiles p ON ja.userId = p.userId
      LEFT JOIN profile_skills ps ON ja.userId = ps.userId
      LEFT JOIN skills s ON ps.skillId = s.id
      WHERE ja.jobId = ?
      GROUP BY ja.id`,
      [jobId],
    );

    const applicants = rows.map((row) => ({
      ...row,
      skillData: row.skillData || "",
    }));

    res.json({ applicants });
  } catch (err) {
    console.error("APPLICANTS ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});



// ==========================
// GET SIMILAR JOBS
// ==========================
router.get("/:id/similar", async (req, res) => {
  try {
    const jobId = req.params.id;

    const [skillRows] = await db.query(
      "SELECT skillId FROM job_skills WHERE jobId = ?",
      [jobId]
    );
    if (skillRows.length === 0) return res.json([]);

    const skillIds = skillRows.map((r) => r.skillId);

    const [rows] = await db.query(
      `SELECT j.*, COUNT(*) AS matchCount
       FROM jobs j
       JOIN job_skills js ON j.id = js.jobId
       WHERE js.skillId IN (?)
       AND j.id != ?
       AND j.active = 1
       GROUP BY j.id
       ORDER BY matchCount DESC
       LIMIT 3`,
      [skillIds, jobId]
    );

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

// ==========================
// GET SINGLE JOB BY ID
// ==========================
router.get("/:id", async (req, res) => {
  console.log("🔥 JOB DETAIL HIT:", req.params.id);

  try {
    const jobId = Number(req.params.id);

    if (!jobId) {
      return res.status(400).json({ error: "Invalid jobId" });
    }

    const [rows] = await db.query("SELECT * FROM jobs WHERE id = ?", [jobId]);

    if (!rows.length) {
      return res.status(404).json({ error: "Job not found" });
    }

    const job = rows[0];

    // 🔥 ดึง skills
    const [skillRows] = await db.query(
      `SELECT js.jobId, js.skillId, js.requiredLevel, s.name AS skill
       FROM job_skills js
       JOIN skills s ON js.skillId = s.id
       WHERE js.jobId = ?`,
      [jobId],
    );

    job.jobSkills = skillRows.map((r) => ({
      skillId: r.skillId,
      skill: r.skill,
      requiredLevel: r.requiredLevel,
      weight: r.weight || 2,
      required: Boolean(r.required),
    }));

    // 🔥 parse JSON
    job.requirements = parseJSON(job.requirements);
    job.benefits = parseJSON(job.benefits);

    res.json(job);
  } catch (err) {
    console.error("JOB DETAIL ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});


// ==========================
// CREATE JOB
// ==========================
router.post("/", verifyToken, async (req, res) => {
  try {
    const {
      title,
      company,
      logo,
      location,
      type,
      level,
      salary,
      description,
      requirements,
      benefits,
      companyDescription,
      postedDate,
      userId,
      active,
      requirementText,
    } = req.body;

    if (!title || !company || !location || !salary) {
      return res.status(400).json({ error: "title, company, location, salary are required" });
    }

    const [companyRows] = await db.query(
      "SELECT id FROM company_profiles WHERE userId = ?",
      [userId]
    );
    if (companyRows.length === 0) {
      return res.status(403).json({ error: "Please create a Company Profile before posting jobs" });
    }

    const job = {
      userId: userId || null,
      title,
      company,
      logo: logo || "",
      location,
      type: type || "Full-time",
      level: level || "Mid-level",
      salary,
      description: description || "",
      requirements: JSON.stringify(requirements || []),
      benefits: JSON.stringify(benefits || []),
      companyDescription: companyDescription || "",
      postedDate: postedDate || new Date().toISOString().split("T")[0],
      active: active !== undefined ? Number(active) : 1,
      applicants: 0,
    };

    const [result2] = await db.query("INSERT INTO jobs SET ?", job);
    const newJobId = result2.insertId;
    const jobSkills = req.body.jobSkills || [];

    await upsertJobSkills(newJobId, jobSkills);

    res.json({
      success: true,
      id: newJobId,
      ...job,
      requirements: parseJSON(job.requirements),
      benefits: parseJSON(job.benefits),
    });

    // หา seeker ที่ match ≥ 70% (fire-and-forget)
    try {
      const [seekers] = await db.query(
        `SELECT ps.userId, SUM(CASE WHEN ps.skillId IN (
           SELECT skillId FROM job_skills WHERE jobId = ?
         ) THEN 1 ELSE 0 END) AS matched,
         COUNT(js.skillId) AS total
         FROM profile_skills ps
         JOIN job_skills js ON js.jobId = ?
         GROUP BY ps.userId
         HAVING (matched / total) * 100 >= 70`,
        [newJobId, newJobId]
      );
      if (seekers?.length) {
        for (const { userId: seekerId } of seekers) {
          await db.query(
            'INSERT INTO notifications (userId, type, message) VALUES (?, ?, ?)',
            [seekerId, 'job_match', `New job "${job.title}" matches your skills!`]
          );
        }
      }
    } catch (e) {
      console.error("JOB MATCH NOTIFY ERROR:", e);
    }
  } catch (err) {
    console.error("CREATE JOB ERROR:", err);
    res.status(500).json({ error: "Insert failed" });
  }
});

// ==========================
// UPDATE JOB
// ==========================
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const {
      title,
      company,
      logo,
      location,
      type,
      level,
      salary,
      description,
      requirements,
      benefits,
      companyDescription,
      postedDate,
      active,
    } = req.body;

    const [rows] = await db.query("SELECT userId FROM jobs WHERE id = ?", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Job not found" });
    if (rows[0].userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    const sql = `
      UPDATE jobs SET
        title=?, company=?, logo=?, location=?, type=?, level=?,
        salary=?, description=?, requirements=?, benefits=?,
        companyDescription=?, postedDate=?, active=?
      WHERE id=?
    `;
    const params = [
      title, company, logo, location, type, level, salary, description,
      JSON.stringify(requirements || []),
      JSON.stringify(benefits || []),
      companyDescription,
      postedDate || new Date().toISOString().split("T")[0],
      active ?? 1,
      id,
    ];

    await db.query(sql, params);

    const jobSkills = req.body.jobSkills || [];
    await upsertJobSkills(id, jobSkills);
    res.json({ success: true, id });
  } catch (err) {
    console.error("UPDATE JOB ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// ==========================
// DELETE JOB
// ==========================
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT userId FROM jobs WHERE id = ?", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Job not found" });
    if (rows[0].userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    await db.query("DELETE FROM jobs WHERE id = ?", [req.params.id]);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error("DELETE JOB ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ==========================
// APPLY FOR JOB
// ==========================
router.post("/:id/apply", async (req, res) => {
  const jobId = req.params.id;
  const { userId } = req.body;

  try {
    // 🔥 เช็คก่อน
    const [exist] = await db.query(
      "SELECT * FROM job_applications WHERE jobId=? AND userId=?",
      [jobId, userId],
      (err2, existing) => {
        if (err2) {
          console.error("CHECK APPLICATION ERROR:", err2);
          return res.status(500).json({ error: "Database error" });
        }

        if (existing.length > 0) {
          return res.status(409).json({ error: "Already applied" });
        }

        // Insert application
        db.query(
          "INSERT INTO job_applications (jobId, userId) VALUES (?, ?)",
          [jobId, userId],
          (err3) => {
            if (err3) {
              console.error("APPLY ERROR:", err3);
              return res.status(500).json({ error: "Apply failed" });
            }

            // Increment applicants count
            db.query("UPDATE jobs SET applicants = applicants + 1 WHERE id = ?", [jobId]);

            // แจ้ง employer
            db.query('SELECT userId, title FROM jobs WHERE id = ?', [jobId], (e, jobs) => {
              if (e || !jobs[0]) return;
              const { userId: employerId, title } = jobs[0];
              db.query(
                'SELECT name FROM profiles WHERE userId = ?',
                [userId],
                (e2, profiles) => {
                  const applicantName = profiles?.[0]?.name || 'Someone';
                  db.query(
                    'INSERT INTO notifications (userId, type, message) VALUES (?, ?, ?)',
                    [employerId, 'new_applicant', `${applicantName} applied for "${title}"`]
                  );
                }
              );
            });

            res.json({ success: true, message: "Applied successfully" });
          }
        );
      }
    );

    if (exist.length > 0) {
      return res.status(409).json({ message: "Already applied" });
    }

    await db.query(
      "INSERT INTO job_applications (jobId, userId) VALUES (?, ?)",
      [jobId, userId],
    );

    await db.query("UPDATE jobs SET applicants = applicants + 1 WHERE id = ?", [
      jobId,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("APPLY ERROR:", err);
    res.status(500).json({ error: err.message }); // 🔥 เปลี่ยนตรงนี้
  }
});

// ================================================
// HELPER: upsert job skills
// ================================================
async function upsertJobSkills(jobId, jobSkills) {
  if (!jobSkills || jobSkills.length === 0) return;

  await db.query("DELETE FROM job_skills WHERE jobId = ?", [jobId]);

  for (const { skillId, requiredLevel, weight, required } of jobSkills) {
    const id = skillId || null;
    if (!id) continue;
    await db.query(
      "INSERT INTO job_skills (jobId, skillId, requiredLevel, weight, required) VALUES (?, ?, ?, ?, ?)",
      [
        jobId,
        id,
        requiredLevel || "Intermediate",
        weight || 2,
        required !== undefined ? (required ? 1 : 0) : 1,
      ]
    );
  }
}

// ==========================
// HELPER: Parse JSON safely
// ==========================
function parseJSON(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Jobs
 *   description: จัดการข้อมูลงาน
 */

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: ดึงงานทั้งหมด
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         example: Developer
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         example: Bangkok
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         example: Full-time
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *         example: Mid-level
 *       - in: query
 *         name: active
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: สำเร็จ
 *   post:
 *     summary: สร้างงานใหม่
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, company, location, salary]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Frontend Developer
 *               company:
 *                 type: string
 *                 example: Tech Co
 *               logo:
 *                 type: string
 *                 example: 💼
 *               location:
 *                 type: string
 *                 example: Bangkok
 *               type:
 *                 type: string
 *                 example: Full-time
 *               level:
 *                 type: string
 *                 example: Mid-level
 *               salary:
 *                 type: string
 *                 example: 50k-80k
 *               description:
 *                 type: string
 *               requirements:
 *                 type: array
 *                 items:
 *                   type: string
 *               benefits:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: สร้างงานสำเร็จ
 *       400:
 *         description: ข้อมูลไม่ครบ
 */

/**
 * @swagger
 * /api/jobs/{id}:
 *   get:
 *     summary: ดึงงานตาม ID
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: สำเร็จ
 *       404:
 *         description: ไม่พบงาน
 *   put:
 *     summary: แก้ไขงาน
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               active:
 *                 type: integer
 *                 enum: [0, 1]
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 *   delete:
 *     summary: ลบงาน
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: ลบสำเร็จ
 */

/**
 * @swagger
 * /api/jobs/{id}/apply:
 *   post:
 *     summary: สมัครงาน
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: สมัครสำเร็จ
 *       409:
 *         description: สมัครไปแล้ว
 */

/**
 * @swagger
 * /api/jobs/applications/{userId}:
 *   get:
 *     summary: ดึงงานที่ user สมัครทั้งหมด
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: สำเร็จ
 */

/**
 * @swagger
 * /api/jobs/applications/{appId}/status:
 *   patch:
 *     summary: อัปเดตสถานะการสมัคร
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: appId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Applied, Interview, Offer, Rejected]
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 *       400:
 *         description: status ไม่ถูกต้อง
 */

/**
 * @swagger
 * /api/jobs/{jobId}/applicants:
 *   get:
 *     summary: ดึงรายชื่อผู้สมัครของงาน
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: สำเร็จ
 */

