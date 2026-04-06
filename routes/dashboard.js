const express = require("express");
const router = express.Router();
const db = require("../db");



// Users by month (profile creation date) — exclude admins
router.get("/users/monthly", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DATE_FORMAT(p.createdAt, '%Y-%m') AS month, COUNT(*) AS count
       FROM profiles p
       JOIN users u ON p.userId = u.id
       WHERE u.role != 'admin'
       GROUP BY DATE_FORMAT(p.createdAt, '%Y-%m')
       ORDER BY DATE_FORMAT(p.createdAt, '%Y-%m')`,
    );

    const labels = rows.map((r) => r.month);
    const data = rows.map((r) => r.count);

    res.json({ labels, data });
  } catch (err) {
    console.error("DASHBOARD MONTHLY USERS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch monthly users" });
  }
});

// Total/new/returning user stats — exclude admins
router.get("/users/total", async (req, res) => {
  try {
    const [totalRow] = await db.query(
      "SELECT COUNT(*) AS total FROM users WHERE role != 'admin'",
    );
    const [newRow] = await db.query(
      `SELECT COUNT(*) AS newUsers FROM profiles p JOIN users u ON p.userId = u.id WHERE u.role != 'admin' AND p.createdAt >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    );
    const [activeRow] = await db.query(
      "SELECT COUNT(DISTINCT ja.userId) AS activeUsers FROM job_applications ja JOIN users u ON ja.userId = u.id WHERE u.role != 'admin' AND ja.appliedAt >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)",
    );

    const total = totalRow[0]?.total || 0;
    const newly = newRow[0]?.newUsers || 0;
    const returning = activeRow[0]?.activeUsers || 0;

    res.json({ current: total, new: newly, returning });
  } catch (err) {
    console.error("DASHBOARD TOTAL USERS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch total users" });
  }
});

// Users grouped by role — exclude admins
router.get("/users/by-role", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT role, COUNT(*) AS count FROM users WHERE role != 'admin' GROUP BY role ORDER BY role",
    );
    res.json(rows);
  } catch (err) {
    console.error("DASHBOARD USERS BY ROLE ERROR:", err);
    res.status(500).json({ error: "Failed to fetch users by role" });
  }
});

// Active users today (distinct applicants)
router.get("/users/active-today", async (req, res) => {
  try {
  const [rows] = await db.query(
    "SELECT COUNT(DISTINCT userId) AS activeToday FROM job_applications WHERE DATE(appliedAt) = CURDATE()",
  );
    res.json({ activeToday: rows[0]?.activeToday || 0 });
  } catch (err) {
    console.error("DASHBOARD ACTIVE TODAY ERROR:", err);
    res.status(500).json({ error: "Failed to fetch active users today" });
  }
});

// Top 5 jobs by applications
router.get("/jobs/top", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT j.id, j.title, j.company, COUNT(ja.id) AS applications
       FROM job_applications ja
       JOIN jobs j ON ja.jobId = j.id
       GROUP BY ja.jobId
       ORDER BY applications DESC
       LIMIT 5`,
    );
    res.json(rows);
  } catch (err) {
    console.error("DASHBOARD TOP JOBS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch top jobs" });
  }
});

// Recent activities (job applications)
router.get("/activities/recent", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ja.id, ja.userId, ja.jobId, ja.status, ja.appliedAt, j.title AS jobTitle, p.name AS profileName
       FROM job_applications ja
       JOIN jobs j ON ja.jobId = j.id
       LEFT JOIN profiles p ON ja.userId = p.userId
       ORDER BY ja.appliedAt DESC
       LIMIT 7`,
    );
    res.json(rows);
  } catch (err) {
    console.error("DASHBOARD RECENT ACTIVITIES ERROR:", err);
    res.status(500).json({ error: "Failed to fetch recent activities" });
  }
});

// Summary for cards — exclude admins
router.get("/summary", async (req, res) => {
  try {
    const [totalRow] = await db.query(
      "SELECT COUNT(*) AS total FROM users WHERE role != 'admin'",
    );
   const [todayRow] = await db.query(
     "SELECT COUNT(*) AS today FROM users WHERE role != 'admin' AND DATE(lastLoginAt) = CURDATE()",
   );
    const [newMonthRow] = await db.query(
      "SELECT COUNT(*) AS newMonth FROM users WHERE role != 'admin' AND MONTH(createdAt) = MONTH(CURDATE()) AND YEAR(createdAt) = YEAR(CURDATE())",
    );

    const total = totalRow[0]?.total || 0;
    const today = todayRow[0]?.today || 0;
    const newMonth = newMonthRow[0]?.newMonth || 0;

    res.json({ totalUsers: total, todayUsers: today, newUsersMonth: newMonth });
  } catch (err) {
    console.error("DASHBOARD SUMMARY ERROR:", err);
    res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
});

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: ข้อมูล Dashboard สำหรับ Admin
 */

/**
 * @swagger
 * /api/dashboard/summary:
 *   get:
 *     summary: ดึงข้อมูลสรุป Dashboard
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: สำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: integer
 *                   example: 14
 *                 todayUsers:
 *                   type: integer
 *                   example: 2
 *                 newUsersMonth:
 *                   type: integer
 *                   example: 5
 */

/**
 * @swagger
 * /api/dashboard/users/monthly:
 *   get:
 *     summary: ดึงข้อมูล Users รายเดือน
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: สำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 labels:
 *                   type: array
 *                   example: ["2024-01", "2024-02"]
 *                 data:
 *                   type: array
 *                   example: [5, 8]
 */

/**
 * @swagger
 * /api/dashboard/users/total:
 *   get:
 *     summary: ดึงข้อมูล Users ทั้งหมด
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: สำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 current:
 *                   type: integer
 *                   example: 14
 *                 new:
 *                   type: integer
 *                   example: 12
 *                 thisMonth:
 *                   type: integer
 *                   example: 3
 */

/**
 * @swagger
 * /api/dashboard/users/active-today:
 *   get:
 *     summary: ดึงจำนวน Users ที่ active วันนี้
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: สำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activeToday:
 *                   type: integer
 *                   example: 3
 */

/**
 * @swagger
 * /api/dashboard/jobs/top:
 *   get:
 *     summary: ดึง Top 5 งานยอดนิยม
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: สำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   title:
 *                     type: string
 *                   company:
 *                     type: string
 *                   applications:
 *                     type: integer
 */

/**
 * @swagger
 * /api/dashboard/activities/recent:
 *   get:
 *     summary: ดึงกิจกรรมล่าสุด 7 รายการ
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: สำเร็จ
 */
