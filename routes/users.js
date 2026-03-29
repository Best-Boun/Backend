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

// ==========================
// GET USER BY ID
// ==========================
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
 *     responses:
 *       200:
 *         description: success
 */
router.get("/:id", (req, res) => {
  const sql =
    "SELECT id, name AS username, email, role, IFNULL(isBanned, 0) AS isBanned FROM users WHERE id = ?";

  db.query(sql, [req.params.id], (err, result) => {
    if (err) return res.status(500).json(err);
    if (!result[0]) return res.status(404).json({ message: "User not found" });

    res.json(result[0]);
  });
});

// ==========================
// UPDATE USER (PUT)
// ==========================
/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: แก้ไขข้อมูลผู้ใช้ (username, email, role, isBanned)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID ของผู้ใช้ที่ต้องการแก้ไข
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: "newname"
 *               email:
 *                 type: string
 *                 example: "new@gmail.com"
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 example: "user"
 *               isBanned:
 *                 type: boolean
 *                 description: true = แบนผู้ใช้, false = ปลดแบน
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
 *                   example: User updated successfully
 *                 updatedFields:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["isBanned = ?"]
 *       400:
 *         description: ไม่มีข้อมูลที่ต้องการอัปเดต
 *       401:
 *         description: ไม่มี Token
 *       403:
 *         description: ไม่ใช่ Admin
 *       404:
 *         description: ไม่พบผู้ใช้
 */
router.put("/:id", verifyToken, isAdmin, (req, res) => {
  const { username, email, role, isBanned } = req.body;

  const fields = [];
  const values = [];

  if (username !== undefined) {
    fields.push("name = ?");
    values.push(username);
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
    return res.status(400).json({ message: "No data to update" });
  }

  values.push(req.params.id);

  const sql = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`;

  db.query(sql, values, (err, result) => {
    if (err) return res.status(500).json(err);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🔥 สำคัญ: ส่ง response กลับ
    res.json({
      message: "User updated successfully",
      updatedFields: fields,
    });
  });
});

// ==========================
// DELETE USER
// ==========================
/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: ลบผู้ใช้ตาม ID (Admin เท่านั้น)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID ของผู้ใช้ที่ต้องการลบ
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
 *                   example: User deleted successfully
 *       401:
 *         description: ไม่มี Token
 *       403:
 *         description: ไม่ใช่ Admin
 *       404:
 *         description: ไม่พบผู้ใช้
 */
router.delete("/:id", verifyToken, isAdmin, (req, res) => {
  const sql = "DELETE FROM users WHERE id = ?";

  db.query(sql, [req.params.id], (err, result) => {
    if (err) return res.status(500).json(err);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User deleted successfully" });
  });
});

module.exports = router;
