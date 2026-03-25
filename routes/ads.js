const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const verifyToken = require("../middleware/authMiddleware");

// =======================
// 🔐 ADMIN CHECK
// =======================
function isAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
}

// =======================
// UPLOAD FOLDER CHECK
// =======================
const uploadPath = path.join(__dirname, "../upload");

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath);
}

// =======================
// MULTER CONFIG
// =======================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// =======================
// ✅ GET ADS
// =======================
router.get("/", verifyToken, isAdmin, (req, res) => {
  const sql = "SELECT * FROM ads ORDER BY date DESC";

  db.query(sql, (err, result) => {
    if (err) {
      console.error("GET ADS ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ adsList: result });
  });
});

// =======================
// PUBLIC ADS (for feed)
// =======================
router.get("/public", (req, res) => {
  const sql = "SELECT * FROM ads WHERE active = 1 ORDER BY date DESC";

  db.query(sql, (err, result) => {
    if (err) {
      console.error("GET PUBLIC ADS ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ adsList: result });
  });
});

  // =======================
// GET AD BY ID
// =======================
router.get("/:id", verifyToken, isAdmin, (req, res) => {
  const id = req.params.id;

  const sql = "SELECT * FROM ads WHERE id = ?";

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("GET AD BY ID ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Ad not found" });
    }

    res.json(result[0]);
  });
});

// =======================
// CREATE AD
// =======================
router.post("/", verifyToken, isAdmin, upload.single("image"), (req, res) => {
  const { name, description, active } = req.body;

  const image = req.file ? req.file.filename : req.body.image || null;

  const ad = {
    name: name || "New Ad",
    description: description || "",
    image,
    position: "feed",
    sizePreset: "medium",
    customWidth: null,
    customHeight: null,
    date: new Date().toISOString().split("T")[0],
    active: active ?? 1,
  };

  db.query("INSERT INTO ads SET ?", ad, (err, result) => {
    if (err) {
      console.error("CREATE AD ERROR:", err);
      return res.status(500).json({ error: "Insert failed" });
    }

    res.json({
      success: true,
      id: result.insertId,
      ...ad,
    });
  });
});

// =======================
// UPDATE AD
// =======================
router.put("/:id", verifyToken, isAdmin, upload.single("image"), (req, res) => {
  const id = req.params.id;
  const { name, description, active } = req.body;

  let newImage = req.file ? req.file.filename : null;

  db.query("SELECT image FROM ads WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json(err);

    if (!result[0]) {
      return res.status(404).json({ message: "Ad not found" });
    }

    const oldImage = result[0].image;

    // 🔥 FIX path ลบรูป
    if (newImage && oldImage) {
      const fixedPath = oldImage.replace("/upload/", "upload/");
      const oldPath = path.join(__dirname, "..", fixedPath);

      fs.unlink(oldPath, (err) => {
        if (err) {
          console.log("❌ ลบรูปเก่าไม่สำเร็จ:", err.message);
        } else {
          console.log("✅ ลบรูปเก่าแล้ว");
        }
      });
    }

    const finalImage = newImage || oldImage;

    // 🔥 FIX active
    const finalActive = active ?? 1;

    const sql = `
      UPDATE ads 
      SET name=?, description=?, image=?, active=?
      WHERE id=?
    `;

    db.query(sql, [name, description, finalImage, finalActive, id], (err) => {
      if (err) {
        console.error("UPDATE ERROR:", err);
        return res.status(500).json({ error: "Update failed" });
      }

      res.json({
        success: true,
        image: finalImage,
      });
    });
  });
});

// =======================
// DELETE AD
// =======================
router.delete("/:id", verifyToken, isAdmin, (req, res) => {
  const id = req.params.id;

  db.query("DELETE FROM ads WHERE id = ?", [id], (err) => {
    if (err) {
      console.error("DELETE AD ERROR:", err);
      return res.status(500).json({ error: "Delete failed" });
    }

    res.json({ success: true });
  });
});

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Ads
 *   description: จัดการโฆษณา
 */

/**
 * @swagger
 * /api/ads:
 *   get:
 *     summary: ดึงโฆษณาทั้งหมด (admin เห็นทั้งหมด / user เห็นเฉพาะ active)
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: สำเร็จ
 */

/**
 * @swagger
 * /api/ads/{id}:
 *   get:
 *     summary: ดึงโฆษณาตาม ID
 *     tags: [Ads]
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
 *         description: ไม่พบข้อมูล
 */

/**
 * @swagger
 * /api/ads:
 *   post:
 *     summary: สร้างโฆษณา (upload + create ในตัวเดียว)
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *               active:
 *                 type: integer
 *     responses:
 *       200:
 *         description: สำเร็จ
 */

/**
 * @swagger
 * /api/ads/{id}:
 *   put:
 *     summary: แก้ไขโฆษณา (แก้รูปได้)
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *               active:
 *                 type: integer
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 */

/**
 * @swagger
 * /api/ads/{id}:
 *   delete:
 *     summary: ลบโฆษณา (Admin เท่านั้น)
 *     tags: [Ads]
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

