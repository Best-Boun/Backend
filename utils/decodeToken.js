const jwt = require("jsonwebtoken");

/**
 * 🔒 Decode JWT token from request headers
 * 
 * Usage:
 *   const decoded = decodeToken(req);
 *   if (!decoded) return res.status(401).json({ message: "Unauthorized" });
 *   const userId = decoded.id || decoded.userId;
 */
const decodeToken = (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const token = authHeader.split(" ")[1]; // Extract "Bearer <token>"
    if (!token) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    return decoded;
  } catch (err) {
    return null;
  }
};

module.exports = decodeToken;
