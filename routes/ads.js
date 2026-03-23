const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const verifyToken = require("../middleware/authMiddleware");

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
// GET ADS FOR FEED
// =======================

router.get("/", (req, res) => {
  db.query("SELECT * FROM ads ORDER BY date DESC", (err, result) => {
    if (err) {
      console.error("GET ADS ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({
      adsList: result,
    });
  });
});

// =======================
// GET ADS FOR ADMIN
// =======================

router.get("/admin", verifyToken, (req, res) => {
  db.query("SELECT * FROM ads ORDER BY date DESC", (err, result) => {
    if (err) {
      console.error("GET ADMIN ADS ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({
      adsList: result,
    });
  });
});

// =======================
// UPLOAD IMAGE
// =======================

router.post("/upload", verifyToken, upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    res.json({
      filename: req.file.filename,
      url: `/upload/${req.file.filename}`,
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// =======================
// CREATE AD
// =======================

router.post("/", verifyToken, (req, res) => {
  const ad = {
    name: req.body.name || "New Ad",
    description: req.body.description || "",
    image: req.body.image || "",
    position: req.body.position || "feed",
    sizePreset: req.body.sizePreset || "medium",
    customWidth: req.body.customWidth || null,
    customHeight: req.body.customHeight || null,
    date: req.body.date || new Date().toISOString().split("T")[0],
    active: req.body.active ?? 0,
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

router.put("/:id", verifyToken, (req, res) => {
  const id = req.params.id;

  const ad = {
    name: req.body.name,
    description: req.body.description,
    image: req.body.image,
    position: req.body.position,
    sizePreset: req.body.sizePreset,
    customWidth: req.body.customWidth,
    customHeight: req.body.customHeight,
    date: req.body.date,
    active: req.body.active,
  };

  db.query(
    "UPDATE ads SET name=?,description=?,image=?,position=?,sizePreset=?,customWidth=?,customHeight=?,date=?,active=? WHERE id=?",
    [
      ad.name,
      ad.description,
      ad.image,
      ad.position,
      ad.sizePreset,
      ad.customWidth,
      ad.customHeight,
      ad.date,
      ad.active,
      id,
    ],
    (err) => {
      if (err) {
        console.error("UPDATE AD ERROR:", err);
        return res.status(500).json({ error: "Update failed" });
      }

      res.json({
        success: true,
        id: id,
      });
    },
  );
});

// =======================
// DELETE AD
// =======================

router.delete("/:id", verifyToken, (req, res) => {
  const id = req.params.id;

  db.query("DELETE FROM ads WHERE id = ?", [id], (err) => {
    if (err) {
      console.error("DELETE AD ERROR:", err);
      return res.status(500).json({ error: "Delete failed" });
    }

    res.json({
      success: true,
      id: id,
    });
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
 *     summary: ดึงโฆษณาทั้งหมด
 *     tags: [Ads]
 *     responses:
 *       200:
 *         description: สำเร็จ
 *   post:
 *     summary: สร้างโฆษณาใหม่
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: New Ad
 *               description:
 *                 type: string
 *               active:
 *                 type: integer
 *                 enum: [0, 1]
 *     responses:
 *       200:
 *         description: สร้างสำเร็จ
 */

/**
 * @swagger
 * /api/ads/{id}:
 *   put:
 *     summary: แก้ไขโฆษณา
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               active:
 *                 type: integer
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 *   delete:
 *     summary: ลบโฆษณา
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

/**
 * @swagger
 * /api/ads/upload:
 *   post:
 *     summary: อัปโหลดรูปภาพโฆษณา
 *     tags: [Ads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: อัปโหลดสำเร็จ
 */