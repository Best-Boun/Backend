const express = require("express");
const router = express.Router();
const db = require("../db");

// ==========================
// GET ALL JOBS (with filters)
// ==========================

router.get("/", (req, res) => {
  const { search, location, type, level, active } = req.query;

  let sql = "SELECT * FROM jobs WHERE 1=1";
  const params = [];

  // Search by title or company
  if (search) {
    sql += " AND (title LIKE ? OR company LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  // Filter by location
  if (location) {
    sql += " AND location = ?";
    params.push(location);
  }

  // Filter by type
  if (type) {
    sql += " AND type = ?";
    params.push(type);
  }

  // Filter by level
  if (level) {
    sql += " AND level = ?";
    params.push(level);
  }

  // Filter by active status
  if (active !== undefined) {
    sql += " AND active = ?";
    params.push(Number(active));
  }

  sql += " ORDER BY postedDate DESC";

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("GET JOBS ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    // Parse JSON fields
    const jobs = result.map((job) => ({
      ...job,
      requirements: parseJSON(job.requirements),
      benefits: parseJSON(job.benefits),
    }));

    res.json(jobs);
  });
});

// ==========================
// GET FILTER OPTIONS (distinct values)
// ==========================
router.get("/filters/options", (req, res) => {
  const queries = {
    locations: "SELECT DISTINCT location FROM jobs WHERE active=1 ORDER BY location",
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
router.get("/applications/:userId", (req, res) => {
  const sql = `
    SELECT ja.*, j.title, j.company, j.logo, j.location, j.salary
    FROM job_applications ja
    JOIN jobs j ON ja.jobId = j.id
    WHERE ja.userId = ?
    ORDER BY ja.appliedAt DESC
  `;

  db.query(sql, [req.params.userId], (err, result) => {
    if (err) {
      console.error("GET APPLICATIONS ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(result);
  });
});

// ==========================
// UPDATE APPLICATION STATUS
// ==========================
router.patch("/applications/:appId/status", (req, res) => {
  const { status } = req.body;
  const VALID_STATUSES = ["Applied", "Interview", "Offer", "Rejected"];

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: "status must be one of: Applied, Interview, Offer, Rejected" });
  }

  db.query(
    "UPDATE job_applications SET status = ? WHERE id = ?",
    [status, req.params.appId],
    (err) => {
      if (err) {
        console.error("UPDATE STATUS ERROR:", err);
        return res.status(500).json({ error: "Update failed" });
      }
      res.json({ success: true, id: req.params.appId, status });
    }
  );
});

// ==========================
// DELETE APPLICATION
// ==========================
router.delete("/applications/:id", (req, res) => {
  db.query("DELETE FROM job_applications WHERE id = ?", [req.params.id], (err) => {
    if (err) {
      console.error("DELETE APPLICATION ERROR:", err);
      return res.status(500).json({ error: "Delete failed" });
    }
    res.json({ success: true });
  });
});

// ==========================
// GET APPLICANTS FOR A JOB
// ==========================
router.get("/:jobId/applicants", (req, res) => {
  const sql = `
    SELECT
      ja.id, ja.userId, ja.jobId, ja.status, ja.appliedAt,
      u.name AS username,
      p.name AS profileName,
      p.title, p.profileImage,
      j.title AS jobTitle
    FROM job_applications ja
    JOIN users u ON ja.userId = u.id
    JOIN jobs j ON ja.jobId = j.id
    LEFT JOIN profiles p ON ja.userId = p.userId
    WHERE ja.jobId = ?
    ORDER BY ja.appliedAt DESC
  `;

  db.query(sql, [req.params.jobId], (err, rows) => {
    if (err) {
      console.error("GET APPLICANTS ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const jobTitle = rows.length > 0 ? rows[0].jobTitle : "";

    const applicants = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      jobId: row.jobId,
      name: row.profileName || row.username,
      title: row.title || null,
      profileImage: row.profileImage || null,
      status: row.status || "Applied",
      appliedAt: row.appliedAt,
    }));

    res.json({ jobTitle, applicants });
  });
});

// ==========================
// GET SINGLE JOB BY ID
// ==========================
router.get("/:id", (req, res) => {
  const sql = "SELECT * FROM jobs WHERE id = ?";

  db.query(sql, [req.params.id], (err, result) => {
    if (err) {
      console.error("GET JOB ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    const job = result[0];
    job.requirements = parseJSON(job.requirements);
    job.benefits = parseJSON(job.benefits);

    res.json(job);
  });
});

// ==========================
// CREATE JOB
// ==========================
router.post("/", (req, res) => {
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
  } = req.body;

  if (!title || !company || !location || !salary) {
    return res.status(400).json({ error: "title, company, location, salary are required" });
  }

  const job = {
    title,
    company,
    logo: logo || "💼",
    location,
    type: type || "Full-time",
    level: level || "Mid-level",
    salary,
    description: description || "",
    requirements: JSON.stringify(requirements || []),
    benefits: JSON.stringify(benefits || []),
    companyDescription: companyDescription || "",
    postedDate: postedDate || new Date().toISOString().split("T")[0],
    applicants: 0,
  };

  db.query("INSERT INTO jobs SET ?", job, (err, result) => {
    if (err) {
      console.error("CREATE JOB ERROR:", err);
      return res.status(500).json({ error: "Insert failed" });
    }

    res.json({
      success: true,
      id: result.insertId,
      ...job,
      requirements: parseJSON(job.requirements),
      benefits: parseJSON(job.benefits),
    });
  });
});

// ==========================
// UPDATE JOB
// ==========================
router.put("/:id", (req, res) => {
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

  const sql = `
    UPDATE jobs SET
      title=?, company=?, logo=?, location=?, type=?, level=?,
      salary=?, description=?, requirements=?, benefits=?,
      companyDescription=?, postedDate=?, active=?
    WHERE id=?
  `;

  const params = [
    title,
    company,
    logo,
    location,
    type,
    level,
    salary,
    description,
    JSON.stringify(requirements || []),
    JSON.stringify(benefits || []),
    companyDescription,
    postedDate,
    active ?? 1,
    id,
  ];

  db.query(sql, params, (err) => {
    if (err) {
      console.error("UPDATE JOB ERROR:", err);
      return res.status(500).json({ error: "Update failed" });
    }

    res.json({ success: true, id });
  });
});

// ==========================
// DELETE JOB
// ==========================
router.delete("/:id", (req, res) => {
  db.query("DELETE FROM jobs WHERE id = ?", [req.params.id], (err) => {
    if (err) {
      console.error("DELETE JOB ERROR:", err);
      return res.status(500).json({ error: "Delete failed" });
    }

    res.json({ success: true, id: req.params.id });
  });
});

// ==========================
// APPLY FOR JOB
// ==========================
router.post("/:id/apply", (req, res) => {
  const jobId = req.params.id;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  // Check if already applied
  db.query(
    "SELECT * FROM job_applications WHERE jobId=? AND userId=?",
    [jobId, userId],
    (err, existing) => {
      if (err) {
        console.error("CHECK APPLICATION ERROR:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (existing.length > 0) {
        return res.status(409).json({ error: "Already applied" });
      }

      // Insert application
      db.query(
        "INSERT INTO job_applications (jobId, userId) VALUES (?, ?)",
        [jobId, userId],
        (err2) => {
          if (err2) {
            console.error("APPLY ERROR:", err2);
            return res.status(500).json({ error: "Apply failed" });
          }

          // Increment applicants count
          db.query("UPDATE jobs SET applicants = applicants + 1 WHERE id = ?", [jobId]);

          res.json({ success: true, message: "Applied successfully" });
        }
      );
    }
  );
});

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