require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const commentRoutes = require("./routes/comments");
const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://your-frontend-domain.com",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

// Multer setup
const storage = multer.diskStorage({
  destination: "./upload/",
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/posts", require("./routes/posts"));
app.use("/api/ads", require("./routes/ads"));
app.use("/api/jobs", require("./routes/jobs"));
app.use("/api/favorites", require("./routes/favorites"));
app.use("/api/companies", require("./routes/companies"));
app.use("/api/skills", require("./routes/skills"));
app.use("/api/profiles", require("./routes/profiles"));
app.use("/api/resume", require("./routes/resume"));
app.use("/upload", express.static(path.join(__dirname, "upload")));
app.use("/api/likes", require("./routes/likes"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/comments", commentRoutes);


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
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
 res.json({
   imageUrl: `/upload/${req.file.filename}`,
 });
});

app.use((err, req, res, next) => {
  if (
    err instanceof multer.MulterError ||
    err.message === "Only image files are allowed"
  )
    return res.status(400).json({ error: err.message });
  next(err);
});

app.get("/", (req, res) => {
  res.send("Backend running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
