const express = require("express");
const router = express.Router();
const db = require("../db");

// get all users for admin panel (real users)
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: ดึงรายชื่อผู้ใช้ทั้งหมด
 *     tags: [Users]
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
 *                   id:
 *                     type: integer
 *                   username:
 *                     type: string
 *                   email:
 *                     type: string
 *                   role:
 *                     type: string
 *                   isBanned:
 *                     type: integer
 */
router.get("/", (req, res) => {
  const sql = "SELECT id, name AS username, email, role, IFNULL(isBanned, 0) AS isBanned FROM users";

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});

// get user profile by id
/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: ดึงข้อมูลผู้ใช้ตาม ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: สำเร็จ
 *       404:
 *         description: ไม่พบผู้ใช้
 *   patch:
 *     summary: แก้ไขข้อมูลผู้ใช้
 *     tags: [Users]
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
 *               role:
 *                 type: string
 *                 enum: [seeker, employer, admin]
 *               isBanned:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 *       404:
 *         description: ไม่พบผู้ใช้
 */
router.get("/:id", (req, res) => {
  const sql = "SELECT id, name AS username, email, role, IFNULL(isBanned, 0) AS isBanned FROM users WHERE id = ?";

  db.query(sql, [req.params.id], (err, result) => {
    if (err) return res.status(500).json(err);
    if (!result[0]) return res.status(404).json({ message: "User not found" });
    res.json(result[0]);
  });
});

// patch user (ban/unban, role etc.)
router.patch("/:id", (req, res) => {
  const { name, username, email, role, isBanned } = req.body;
  const fields = [];
  const values = [];

  if (name !== undefined) {
    fields.push("name = ?");
    values.push(name);
  }
  if (email !== undefined) {
    fields.push("email = ?");
    values.push(email);
  }
  if (role !== undefined) {
    fields.push("role = ?");
    values.push(role);
  }
  if (isBanned !== undefined) {
    fields.push("isBanned = ?");
    values.push(isBanned ? 1 : 0);
  }

  if (!fields.length) {
    return res.status(400).json({ message: "No valid fields to update" });
  }

  values.push(req.params.id);
  const sql = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`;

  db.query(sql, values, (err, result) => {
    if (err) return res.status(500).json(err);
    if (result.affectedRows === 0) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User updated" });
  });
});

module.exports = router;
