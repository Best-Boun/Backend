const express = require("express");
//  Express สร้าง APi
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// =======================
// REGISTER
// =======================
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: สมัครสมาชิก
 *     security: []
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 example: john@gmail.com
 *               password:
 *                 type: string
 *                 example: "123456"
 *               role:
 *                 type: string
 *                 enum: [seeker, employer]
 *                 example: seeker
 *     responses:
 *       200:
 *         description: สมัครสมาชิกสำเร็จ
 *       500:
 *         description: Database error
 */
router.post("/register", async (req, res) => {
  console.log("🔥 REGISTER START");

  try {
    const { name, email, password, role } = req.body;

    const VALID_ROLES = ["seeker", "employer"];
    const userRole = role || "seeker";

    if (!VALID_ROLES.includes(userRole)) {
      return res
        .status(400)
        .json({ message: "role must be 'seeker' or 'employer'" });
    }

    // 🔥 ใช้ await แบบเดียวกับ login
    const [result] = await db.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (result.length > 0) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    const hash = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      [name, email, hash, userRole],
    );

    console.log("✅ REGISTER SUCCESS");

    res.json({ message: "User registered" });
  } catch (err) {
    console.log("❌ REGISTER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// LOGIN
// =======================
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login
 *     security: []
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@gmail.com
 *               password:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login สำเร็จ ได้รับ JWT Token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Login success
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 userId:
 *                   type: integer
 *                   example: 1
 *                 role:
 *                   type: string
 *                   example: admin
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *       400:
 *         description: User not found หรือ Wrong password
 *       403:
 *         description: บัญชีถูกแบน
 *
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Your account has been banned. Please contact the administrator.
 *                 banned:
 *                   type: boolean
 *                   example: true
 */
router.post("/login", async (req, res) => {
  console.log("🔥 LOGIN START");

  try {
    const { email, password } = req.body;

    const sql = "SELECT * FROM users WHERE email = ?";
    const [result] = await db.query(sql, [email]); // ✅ FIX ตรงนี้

    console.log("RESULT:", result);

    if (result.length === 0) {
      return res.status(400).json({
        message: "Invalid email or password",
      });
    }

    const user = result[0];

    // 🚫 เช็คว่าถูกแบนหรือไม่
    if (user.isBanned) {
      return res.status(403).json({
        message:
          "Your account has been banned. Please contact the administrator.",
        banned: true,
      });
    }

    let match = false;

    if (user.password.startsWith("$2b$")) {
      match = await bcrypt.compare(password, user.password);
    } else {
      match = password === user.password;
    }

    if (!match) {
      return res.status(400).json({
        message: "Invalid email or password",
      });
    }
        // create Token           ข้อมูล ที่ใส่ไว้  encoded
    const token = jwt.sign({ id: user.id, role: user.role }, "mysecretkey", {
      expiresIn: "1d",
    });

    await db.query("UPDATE users SET lastLoginAt = NOW() WHERE id = ?", [
      user.id,
    ]);

    res.json({
      message: "Login success",
      token,
      userId: user.id,
      role: user.role,
      name: user.name,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
      },
    });
  } catch (err) {
    console.log("❌ LOGIN ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
