const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];

  // เช็คว่า user login ยัง มี token มั้ย
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // ยังไม่ได้ login
    return res.status(401).json({
      message: "No token provided",
    });
  }
  // เป็นตัวแยก token ออกมา จาก bearer
  const token = authHeader.split(" ")[1];
  //  ไม่มี token จริง
  if (!token) {
    return res.status(401).json({
      message: "Token missing",
    });
  }
  //  ตรวจ token + แกะข้อมูล user
  jwt.verify(token, "mysecretkey", (err, decoded) => {
    if (err) {
      // token ผิด
      return res.status(403).json({
        message: "Invalid token",
      });
    }
    //  เก็บข้อมูล user จาก token
    req.user = decoded;
    next();
  });
}

module.exports = verifyToken;
