const express = require("express");
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
  const { name, email, password, role } = req.body;

  const VALID_ROLES = ["seeker", "employer"];
  const userRole = role || "seeker";

  if (!VALID_ROLES.includes(userRole)) {
    return res
      .status(400)
      .json({ message: "role must be 'seeker' or 'employer'" });
  }

  try {
    // ✅ 🔥 เช็ค email ซ้ำก่อน
    db.query(
      "SELECT * FROM users WHERE email = ?",
      [email],
      async (err, result) => {
        if (err) return res.status(500).json(err);

        if (result.length > 0) {
          return res.status(400).json({
            message: "Email already exists",
          });
        }

        // 👉 ค่อย hash หลังจากเช็คแล้ว
        const hash = await bcrypt.hash(password, 10);

        const sql =
          "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)";

       db.query(sql, [name, email, hash, userRole], (err) => {
         if (err) {
           // 🔥 handle email ซ้ำ
           if (err.code === "ER_DUP_ENTRY") {
             return res.status(409).json({
               message: "Email already exists",
             });
           }

           return res.status(500).json(err);
         }

         res.json({ message: "User registered" });
       });
      },
    );
  } catch (err) {
    res.status(500).json(err);
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Wrong password
 *       403:
 *         description: บัญชีถูกแบน ไม่สามารถเข้าสู่ระบบได้
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
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ?";

  db.query(sql, [email], async (err, result) => {
    if (err) return res.status(500).json(err);

    if (result.length === 0) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = result[0];

    // 🚫 เช็คว่าถูกแบนหรือไม่
    if (user.isBanned) {
      return res.status(403).json({
        message: "Your account has been banned. Please contact the administrator.",
        banned: true,
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({
        message: "Wrong password",
      });
    }

    // 🔑 สร้าง JWT Token
    const token = jwt.sign({ id: user.id, role: user.role }, "mysecretkey", {
      expiresIn: "1d",
    });

    // บันทึกเวลา login ล่าสุด
    db.query("UPDATE users SET lastLoginAt = NOW() WHERE id = ?", [user.id]);

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
      },
    });
  });
});

module.exports = router;
