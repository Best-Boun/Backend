const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// =======================
// REGISTER
// =======================
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);

    const sql = "INSERT INTO users (name,email,password) VALUES (?,?,?)";

    db.query(sql, [name, email, hash], (err, result) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.json({
        message: "User registered",
      });
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// =======================
// LOGIN
// =======================
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

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({
        message: "Wrong password",
      });
    }

    // 🔑 สร้าง JWT Token
    const token = jwt.sign({ id: user.id }, "mysecretkey", { expiresIn: "1d" });

    res.json({
      message: "Login success",
      token: token,
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
