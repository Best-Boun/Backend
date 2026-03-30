function isAdmin(req, res, next) {
  console.log("USER FROM TOKEN:", req.user);

  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin only",
    });
  }

  next();
}

module.exports = isAdmin;
