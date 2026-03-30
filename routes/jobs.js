const express = require("express");
const router = express.Router();
const db = require("../db");
const verifyToken = require('../middleware/authMiddleware');

// ==========================
// GET ALL JOBS (with filters)
// ==========================
router.get("/", (req, res) => {
  const { search, location, type, level, active } = req.query;

  let sql = "SELECT * FROM jobs WHERE active = 1";
  const params = [];

  // Search by title or company
  if (search) {
    sql += " AND (title LIKE ? OR company LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  // Filter by location
  if (location) {
    sql += " AND location = ?";
    params.push(location);
  }

  // Filter by type
  if (type) {
    sql += " AND type = ?";
    params.push(type);
  }

  // Filter by level
  if (level) {
    sql += " AND level = ?";
    params.push(level);
  }

  sql += " ORDER BY postedDate DESC";

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("GET JOBS ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    // Parse JSON fields
    const jobs = result.map((job) => ({
      ...job,
      requirements: parseJSON(job.requirements),
      benefits: parseJSON(job.benefits),
    }));

    // fetch jobSkills สำหรับทุก job พร้อมกัน
    if (jobs.length === 0) return res.json([]);

    const jobIds = jobs.map(j => j.id);

    db.query(
      `SELECT js.jobId, js.skillId, js.requiredLevel, s.name AS skill
       FROM job_skills js
       JOIN skills s ON js.skillId = s.id
       WHERE js.jobId IN (?)`,
      [jobIds],
      (err2, skillRows) => {
        if (err2) return res.json(jobs); // fallback ถ้า error

        // group skillRows by jobId
        const skillMap = {};
        skillRows.forEach(row => {
          if (!skillMap[row.jobId]) skillMap[row.jobId] = [];
          skillMap[row.jobId].push({
            skillId: row.skillId,
            skill: row.skill,
            requiredLevel: row.requiredLevel,
          });
        });

        const jobsWithSkills = jobs.map(job => ({
          ...job,
          jobSkills: skillMap[job.id] || [],
        }));

        res.json(jobsWithSkills);
      }
    );
  });
});

// ==========================
// GET FILTER OPTIONS (distinct values)
// ==========================
router.get("/filters/options", (req, res) => {
  const queries = {
    locations: "SELECT DISTINCT location FROM jobs WHERE active=1 ORDER BY location",
    types: "SELECT DISTINCT type FROM jobs WHERE active=1 ORDER BY type",
    levels: "SELECT DISTINCT level FROM jobs WHERE active=1 ORDER BY level",
  };

  const results = {};
  const keys = Object.keys(queries);
  let done = 0;

  keys.forEach((key) => {
    db.query(queries[key], (err, rows) => {
      if (err) {
        console.error(`FILTER ${key} ERROR:`, err);
        results[key] = [];
      } else {
        results[key] = rows.map((r) => Object.values(r)[0]);
      }

      done++;
      if (done === keys.length) {
        res.json(results);
      }
    });
  });
});

// ==========================
// GET USER'S APPLICATIONS
// ==========================
router.get("/applications/:userId", (req, res) => {
  const sql = `
    SELECT ja.*, j.title, j.company, j.logo, j.location, j.salary
    FROM job_applications ja
    JOIN jobs j ON ja.jobId = j.id
    WHERE ja.userId = ?
    ORDER BY ja.appliedAt DESC
  `;

  db.query(sql, [req.params.userId], (err, result) => {
    if (err) {
      console.error("GET APPLICATIONS ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(result);
  });
});

// ==========================
// UPDATE APPLICATION STATUS
// ==========================
router.patch("/applications/:appId/status", (req, res) => {
  const { status } = req.body;
  const VALID_STATUSES = ["Applied", "Interview", "Offer", "Rejected"];

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: "status must be one of: Applied, Interview, Offer, Rejected" });
  }

  db.query(
    "UPDATE job_applications SET status = ? WHERE id = ?",
    [status, req.params.appId],
    (err) => {
      if (err) {
        console.error("UPDATE STATUS ERROR:", err);
        return res.status(500).json({ error: "Update failed" });
      }
      res.json({ success: true, id: req.params.appId, status });
    }
  );
});

// ==========================
// DELETE APPLICATION
// ==========================
router.delete("/applications/:id", (req, res) => {
  db.query("DELETE FROM job_applications WHERE id = ?", [req.params.id], (err) => {
    if (err) {
      console.error("DELETE APPLICATION ERROR:", err);
      return res.status(500).json({ error: "Delete failed" });
    }
    res.json({ success: true });
  });
});

// ==========================
// GET APPLICANTS FOR A JOB
// ==========================
router.get("/:jobId/applicants", (req, res) => {
  // Step 1: ดึง job_skills
  db.query(
    'SELECT js.skillId, js.requiredLevel, js.weight, js.required FROM job_skills js WHERE js.jobId = ?',
    [req.params.jobId],
    (err, jobSkillRows) => {
      if (err) return res.status(500).json({ error: "Database error" });

      // Step 2: ดึง applicants พร้อม skillData จาก profile_skills
      const sql = `
        SELECT
          ja.id, ja.userId, ja.jobId, ja.status, ja.appliedAt,
          u.name AS username,
          p.name AS profileName,
          p.title, p.profileImage,
          j.title AS jobTitle,
          GROUP_CONCAT(DISTINCT CONCAT(ps.skillId, ':', ps.yearsExp, ':', s.name) ORDER BY ps.skillId) AS skillData
        FROM job_applications ja
        JOIN users u ON ja.userId = u.id
        JOIN jobs j ON ja.jobId = j.id
        LEFT JOIN profiles p ON ja.userId = p.userId
        LEFT JOIN profile_skills ps ON ja.userId = ps.userId
        LEFT JOIN skills s ON ps.skillId = s.id
        WHERE ja.jobId = ?
        GROUP BY ja.id
      `;

      db.query(sql, [req.params.jobId], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });

        const jobTitle = rows.length > 0 ? rows[0].jobTitle : "";

        const applicants = rows.map((row) => {
          const skillData = row.skillData
            ? Object.fromEntries(row.skillData.split(',').map(entry => {
                const [id, exp, ...nameParts] = entry.split(':');
                return [id, { yearsExp: parseInt(exp) || 0, name: nameParts.join(':') }];
              }))
            : {};

          const levelMap = { Beginner: 1, Intermediate: 2, Advanced: 3 };
          const getUserLevel = (yearsExp) => {
            if (yearsExp >= 3) return 'Advanced';
            if (yearsExp >= 1) return 'Intermediate';
            return 'Beginner';
          };

          let weightedScore = 0;
          let totalWeight = 0;

          jobSkillRows.forEach(({ skillId, requiredLevel, weight = 2, required = true }) => {
            const w = weight || 2;
            totalWeight += w;

            const entry = skillData[String(skillId)];

            if (!entry) {
              const penalty = required ? -0.5 : 0;
              weightedScore += penalty * w;
              return;
            }

            const userLevel = entry.yearsExp >= 3 ? 3 : entry.yearsExp >= 1 ? 2 : 1;
            const reqLevel = levelMap[requiredLevel] || 2;
            const gap = reqLevel - userLevel;

            let score;
            if (gap <= 0)       score = 1.0;
            else if (gap === 1) score = 0.6;
            else if (gap === 2) score = 0.3;
            else                score = 0;

            weightedScore += score * w;
          });

          const matchScore = totalWeight > 0
            ? Math.max(0, Math.round((weightedScore / totalWeight) * 100))
            : 0;

          // สร้าง skills array — name อยู่ใน entry แล้ว ไม่ต้อง zip กับ skillNames
          const skills = Object.entries(skillData).map(([skillId, entry]) => {
            const jobSkill = jobSkillRows.find(js => String(js.skillId) === String(skillId));
            return {
              skillId: parseInt(skillId),
              skillName: entry.name || skillId,
              yearsExp: entry.yearsExp,
              level: getUserLevel(entry.yearsExp),
              required: !!jobSkill,
              requiredLevel: jobSkill?.requiredLevel || null,
            };
          });

          return {
            id: row.id,
            userId: row.userId,
            jobId: row.jobId,
            name: row.profileName || row.username,
            title: row.title || null,
            profileImage: row.profileImage || null,
            status: row.status || 'Applied',
            appliedAt: row.appliedAt,
            matchScore,
            skills,
          };
        });

        applicants.sort((a, b) => b.matchScore - a.matchScore);
        res.json({ jobTitle, applicants });
      });
    }
  );
});

// ==========================
// EMPLOYER — ALL JOBS (manage)
// ==========================
router.get("/manage", (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  db.query(
    "SELECT * FROM jobs WHERE userId = ? ORDER BY postedDate DESC",
    [userId],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(result.map(job => ({
        ...job,
        requirements: parseJSON(job.requirements),
        benefits: parseJSON(job.benefits),
      })));
    }
  );
});

// ==========================
// GET SINGLE JOB BY ID
// ==========================
router.get("/:id", (req, res) => {
  const sql = "SELECT * FROM jobs WHERE id = ?";

  db.query(sql, [req.params.id], (err, result) => {
    if (err) {
      console.error("GET JOB ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    const job = result[0];
    job.requirements = parseJSON(job.requirements);
    job.benefits = parseJSON(job.benefits);

    // fetch jobSkills
    db.query(
      `SELECT js.skillId, js.requiredLevel, js.weight, js.required, s.name AS skill
       FROM job_skills js
       JOIN skills s ON js.skillId = s.id
       WHERE js.jobId = ?`,
      [job.id],
      (err2, skillRows) => {
        if (err2) {
          job.jobSkills = [];
          return res.json(job);
        }
        job.jobSkills = skillRows.map(r => ({
          skillId: r.skillId,
          skill: r.skill,
          requiredLevel: r.requiredLevel,
          weight: r.weight || 2,
          required: Boolean(r.required),
        }));
        res.json(job);
      }
    );
  });
});

// ==========================
// CREATE JOB
// ==========================
router.post("/", verifyToken, (req, res) => {
  const {
    title,
    company,
    logo,
    location,
    type,
    level,
    salary,
    description,
    requirements,
    benefits,
    companyDescription,
    postedDate,
    userId,
    active,
    requirementText,
  } = req.body;

  if (!title || !company || !location || !salary) {
    return res.status(400).json({ error: "title, company, location, salary are required" });
  }

  db.query(
    "SELECT id FROM company_profiles WHERE userId = ?",
    [userId],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (result.length === 0) {
        return res.status(403).json({ error: "Please create a Company Profile before posting jobs" });
      }

      const job = {
        userId: userId || null,
        title,
        company,
        logo: logo || "",
        location,
        type: type || "Full-time",
        level: level || "Mid-level",
        salary,
        description: description || "",
        requirements: JSON.stringify(requirements || []),
        benefits: JSON.stringify(benefits || []),
        companyDescription: companyDescription || "",
        postedDate: postedDate || new Date().toISOString().split("T")[0],
        active: active !== undefined ? Number(active) : 1,
        applicants: 0,
      };

      db.query("INSERT INTO jobs SET ?", job, (err2, result2) => {
        if (err2) {
          console.error("CREATE JOB ERROR:", err2);
          return res.status(500).json({ error: "Insert failed" });
        }

        const newJobId = result2.insertId;
        const jobSkills = req.body.jobSkills || [];

        upsertJobSkills(newJobId, jobSkills, (skillErr) => {
          if (skillErr) console.error("JOB SKILLS INSERT ERROR:", skillErr);
          res.json({
            success: true,
            id: newJobId,
            ...job,
            requirements: parseJSON(job.requirements),
            benefits: parseJSON(job.benefits),
          });
        });
      });
    }
  );
});

// ==========================
// UPDATE JOB
// ==========================
router.put("/:id", verifyToken, (req, res) => {
  const id = req.params.id;
  const {
    title,
    company,
    logo,
    location,
    type,
    level,
    salary,
    description,
    requirements,
    benefits,
    companyDescription,
    postedDate,
    active,
    requirementText,
  } = req.body;

  const sql = `
    UPDATE jobs SET
      title=?, company=?, logo=?, location=?, type=?, level=?,
      salary=?, description=?, requirements=?, benefits=?,
      companyDescription=?, postedDate=?, active=?
    WHERE id=?
  `;

  const params = [
    title,
    company,
    logo,
    location,
    type,
    level,
    salary,
    description,
    JSON.stringify(requirements || []),
    JSON.stringify(benefits || []),
    companyDescription,
    postedDate || new Date().toISOString().split("T")[0],
    active ?? 1,
    id,
  ];

  db.query(sql, params, (err) => {
    if (err) {
      console.error("UPDATE JOB ERROR:", err);
      return res.status(500).json({ error: "Update failed" });
    }

    const jobSkills = req.body.jobSkills || [];
    upsertJobSkills(id, jobSkills, (skillErr) => {
      if (skillErr) console.error("JOB SKILLS UPDATE ERROR:", skillErr);
      res.json({ success: true, id });
    });
  });
});

// ==========================
// DELETE JOB
// ==========================
router.delete("/:id", verifyToken, (req, res) => {
  db.query("DELETE FROM jobs WHERE id = ?", [req.params.id], (err) => {
    if (err) {
      console.error("DELETE JOB ERROR:", err);
      return res.status(500).json({ error: "Delete failed" });
    }

    res.json({ success: true, id: req.params.id });
  });
});

// ==========================
// APPLY FOR JOB
// ==========================
router.post("/:id/apply", (req, res) => {
  const jobId = req.params.id;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  // Check role from DB before allowing apply
  db.query("SELECT role FROM users WHERE id = ?", [userId], (err, result) => {
    if (err) {
      console.error("ROLE CHECK ERROR:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const user = result[0];
    if (!user || user.role !== 'seeker') {
      return res.status(403).json({ error: "Only seekers can apply for jobs" });
    }

    // Check if already applied
    db.query(
      "SELECT * FROM job_applications WHERE jobId=? AND userId=?",
      [jobId, userId],
      (err2, existing) => {
        if (err2) {
          console.error("CHECK APPLICATION ERROR:", err2);
          return res.status(500).json({ error: "Database error" });
        }

        if (existing.length > 0) {
          return res.status(409).json({ error: "Already applied" });
        }

        // Insert application
        db.query(
          "INSERT INTO job_applications (jobId, userId) VALUES (?, ?)",
          [jobId, userId],
          (err3) => {
            if (err3) {
              console.error("APPLY ERROR:", err3);
              return res.status(500).json({ error: "Apply failed" });
            }

            // Increment applicants count
            db.query("UPDATE jobs SET applicants = applicants + 1 WHERE id = ?", [jobId]);

            res.json({ success: true, message: "Applied successfully" });
          }
        );
      }
    );
  });
});

// ================================================
// HELPER: upsert job skills
// ================================================
function upsertJobSkills(jobId, jobSkills, callback) {
  if (!jobSkills || jobSkills.length === 0) return callback(null);

  db.query('DELETE FROM job_skills WHERE jobId = ?', [jobId], (err) => {
    if (err) return callback(err);

    let done = 0;
    let errored = false;

    jobSkills.forEach(({ skillId, skill, requiredLevel, weight, required }) => {
      const id = skillId || null;
      if (!id) { done++; if (done === jobSkills.length) callback(null); return; }

      db.query(
        'INSERT INTO job_skills (jobId, skillId, requiredLevel, weight, required) VALUES (?, ?, ?, ?, ?)',
        [jobId, id, requiredLevel || 'Intermediate', weight || 2, required !== undefined ? (required ? 1 : 0) : 1],
        (err2) => {
          if (errored) return;
          if (err2) { errored = true; return callback(err2); }
          done++;
          if (done === jobSkills.length) callback(null);
        }
      );
    });
  });
}

// ==========================
// HELPER: Parse JSON safely
// ==========================
function parseJSON(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

module.exports = router;