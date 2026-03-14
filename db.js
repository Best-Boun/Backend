const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "crossover.proxy.rlwy.net",
  user: "root",
  password: "gemIHMHZTLKxUQjYIJfaDWTnuMSQPKoY",
  database: "railway",
  port: 49988,
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
  console.log("Connected to Railway MySQL");
});

module.exports = db;
