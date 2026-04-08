require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const commentRoutes = require("./routes/comments");
const app = express();
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const uploadRoutes = require("./routes/upload");

// 🔥 ใส่ตรงนี้เลย
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const allowedOrigins = [
  "http://localhost:5173",
  "https://your-frontend-domain.com",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "uploads",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage });

// routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/posts", require("./routes/posts"));
app.use("/api/comments", commentRoutes);
app.use("/api/ads", require("./routes/ads"));
app.use("/api/jobs", require("./routes/jobs"));
app.use("/api/favorites", require("./routes/favorites"));
app.use("/api/companies", require("./routes/companies"));
app.use("/api/skills", require("./routes/skills"));
app.use("/api/profiles", require("./routes/profiles"));
app.use("/api/resume", require("./routes/resume"));
app.use("/api/upload", uploadRoutes);
// app.use("/upload", express.static(path.join(__dirname, "upload")));
app.use("/api/likes", require("./routes/likes"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/chat", require("./routes/chat"));

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  }),
);

// File upload endpoint
app.post("/api/upload", upload.single("image"), (req, res) => {
  console.log("FILE:", req.file);

  if (!req.file) {
    console.log("❌ ไม่มีไฟล์");
    return res.status(400).json({ error: "No file uploaded" });
  }

  console.log("✅ upload success");

  res.json({
    imageUrl: req.file.path,
  });
});

app.use((err, req, res, next) => {
  console.error("🔥 ERROR:", err);

  return res.status(500).json({
    error: err.message || "Something went wrong",
  });
});

app.get("/", (req, res) => {
  res.send("Backend running");
});

const PORT = process.env.PORT || 3000;

const http = require("http");
const { Server } = require("socket.io");

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  // Join conversation room
  socket.on("join_conversation", (conversationId) => {
    socket.join(`conv_${conversationId}`);
  });

  // Send message
  socket.on("send_message", async ({ conversationId, senderId, message }) => {
    const db = require("./db");
    try {
      const [result] = await db.query(
        "INSERT INTO messages (conversationId, senderId, message) VALUES (?, ?, ?)",
        [conversationId, senderId, message],
      );
      const newMessage = {
        id: result.insertId,
        conversationId,
        senderId,
        message,
        isRead: 0,
        createdAt: new Date(),
      };
      io.to(`conv_${conversationId}`).emit("receive_message", newMessage);

      // สร้าง notification ให้ผู้รับ
      const [convRows] = await db.query(
        "SELECT employerId, seekerId FROM conversations WHERE id = ?",
        [conversationId],
      );
      if (convRows.length === 0) return;
      const conv = convRows[0];
      const receiverId =
        conv.employerId === senderId ? conv.seekerId : conv.employerId;

      // ดึงชื่อผู้ส่ง
      const [userRows] = await db.query("SELECT name FROM users WHERE id = ?", [
        senderId,
      ]);
      if (userRows.length === 0) return;
      const senderName = userRows[0].name;

      await db.query(
        "INSERT INTO notifications (userId, type, message) VALUES (?, ?, ?)",
        [receiverId, "new_message", `New message from ${senderName}`],
      );
    } catch (err) {
      console.error("send_message error:", err);
    }
  });

  // Typing indicator
  socket.on("typing", ({ conversationId, senderId }) => {
    socket.to(`conv_${conversationId}`).emit("typing", { senderId });
  });

  socket.on("stop_typing", ({ conversationId }) => {
    socket.to(`conv_${conversationId}`).emit("stop_typing");
  });

  // Mark messages as read
  socket.on("messages_read", ({ conversationId, userId }) => {
    const db = require("./db");
    db.query(
      "UPDATE messages SET isRead = 1 WHERE conversationId = ? AND senderId != ?",
      [conversationId, userId],
    );
    socket
      .to(`conv_${conversationId}`)
      .emit("messages_read", { conversationId });
  });

  socket.on("disconnect", () => {});
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
