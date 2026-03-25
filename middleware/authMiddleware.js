const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "No token provided",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Token missing",
    });
  }

  jwt.verify(token, "mysecretkey", (err, decoded) => {
    if (err) {
      return res.status(403).json({
        message: "Invalid token",
      });
    }

    req.user = decoded;
    next();
  });
}

module.exports = verifyToken;
