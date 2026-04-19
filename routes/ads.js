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

const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "ads",
    transformation: [{ quality: "auto", fetch_format: "auto" }],
  },
});

const upload = multer({ storage });

// =======================
// ✅ GET ADS
// =======================
router.get("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const sql = "SELECT * FROM ads ORDER BY date DESC";
    const [result] = await db.query(sql);

    res.json({ adsList: result });
  } catch (err) {
    console.error("GET ADS ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// =======================
// PUBLIC ADS (for feed)
// =======================
router.get("/public", async (req, res) => {
  try {
    const sql = "SELECT * FROM ads WHERE active = 1 ORDER BY date DESC";
    const [result] = await db.query(sql);

    res.json({ adsList: result });
  } catch (err) {
    console.error("GET PUBLIC ADS ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

  // =======================
// GET AD BY ID
// =======================
router.get("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const [rows] = await db.query("SELECT * FROM ads WHERE id = ?", [id]);

    if (!rows[0]) {
      return res.status(404).json({ message: "Ad not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("GET AD BY ID ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// =======================
// CREATE AD
// =======================
router.post(
  "/",
  verifyToken,
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const { name, description, active } = req.body;

      const image = req.file ? req.file.path || req.file.secure_url : null;

      const ad = {
        name: name || "New Ad",
        description: description || "",
        image,
        position: "feed",
        sizePreset: "medium",
        date: new Date().toISOString().split("T")[0],
        active: active ?? 1,
      };

      const [result] = await db.query("INSERT INTO ads SET ?", ad);

      res.json({
        success: true,
        id: result.insertId,
        ...ad,
      });
    } catch (err) {
      console.error("CREATE AD ERROR:", err);
      res.status(500).json({ error: "Insert failed" });
    }
  },
);

// =======================
// UPDATE AD
// =======================
router.put(
  "/:id",
  verifyToken,
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const id = req.params.id;
      const { name, description, active } = req.body;

      const [rows] = await db.query("SELECT image FROM ads WHERE id = ?", [id]);

      if (!rows[0]) {
        return res.status(404).json({ message: "Ad not found" });
      }

      const oldImage = rows[0].image;
      let newImage;

      if (req.file) {
        console.log("FILE:", req.file);
        newImage = req.file.path || req.file.secure_url;
      } else if (req.body.image === "") {
        // 🔥 กด Delete Image
        newImage = null;
      } else {
        // 🔥 ไม่ได้แก้รูป
        newImage = oldImage;
      }

      const sql = `
      UPDATE ads 
      SET name=?, description=?, image=?, active=?
      WHERE id=?
    `;

      await db.query(sql, [name, description, newImage, active ?? 1, id]);

      res.json({
        success: true,
        image: newImage,
      });
    } catch (err) {
      console.error("UPDATE ERROR:", err);
      res.status(500).json({ error: "Update failed" });
    }
  },
);

// =======================
// DELETE AD
// =======================
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    console.log("DELETE ID:", id);

    if (!id) {
      return res.status(400).json({ error: "No ID" });
    }

    const sql = "DELETE FROM ads WHERE id = ?";
    await db.query(sql, [id]);

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ error: "Delete failed" });
  }
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
 *     summary: ดึงโฆษณาทั้งหมด (admin )
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
 *     tags:
 *       - Ads
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

