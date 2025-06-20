const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 4029;

/* ───────────────── CONFIG ───────────────── */
const IMAGE_ROOT = path.join(__dirname, "images");
const ALBUMS = ["me", "parents", "brother", "family"];

/* Ensure root & sub-dirs exist */
if (!fs.existsSync(IMAGE_ROOT)) fs.mkdirSync(IMAGE_ROOT);
ALBUMS.forEach((dir) => {
  const p = path.join(IMAGE_ROOT, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p);
});

/* ───────────────── MIDDLEWARE ───────────────── */
app.use(cors());
app.use(express.json());
app.use("/images", express.static(IMAGE_ROOT)); // serves nested dirs

/* Multer storage that honours :category */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { category } = req.params;
    const albumDir = path.join(IMAGE_ROOT, category);
    cb(null, albumDir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

/* ───────────────── ROUTES ───────────────── */

/** Helper: validate category param */
const validateCategory = (req, res, next) => {
  const { category } = req.params;
  if (!ALBUMS.includes(category)) {
    return res.status(400).json({ error: "Invalid album category" });
  }
  next();
};

/* GET /images/:category  — list images for one album */
app.get("/images/:category", validateCategory, (req, res) => {
  const { category } = req.params;
  const dir = path.join(IMAGE_ROOT, category);

  fs.readdir(dir, (err, files) => {
    if (err) {
      console.error("dir read error:", err);
      return res.status(500).json({ error: "Unable to list files" });
    }
    const urls = files.map((f) => `/images/${category}/${f}`);
    res.json({ images: urls });
  });
});

/* POST /upload/:category  — upload into album */
app.post(
  "/upload/:category",
  validateCategory,
  upload.single("image"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { category } = req.params;
    res.json({ url: `/images/${category}/${req.file.filename}` });
  }
);

/* DELETE /images/:category/:filename  — delete one file */
app.delete("/images/:category/:filename", validateCategory, (req, res) => {
  const { category, filename } = req.params;

  // ‼️ Hard-stop any path-traversal attempts
  const safeName = path.basename(filename);
  const filePath = path.join(IMAGE_ROOT, category, safeName);

  fs.unlink(filePath, (err) => {
    if (err) {
      if (err.code === "ENOENT")
        return res.status(404).json({ error: "File not found" });
      console.error("unlink error:", err);
      return res.status(500).json({ error: "Unable to delete file" });
    }
    res.json({ deleted: `/images/${category}/${safeName}` });
  });
});

/* DELETE /images/:category  — delete every image in the album */
app.delete("/images/:category", validateCategory, (req, res) => {
  const { category } = req.params;
  const dir = path.join(IMAGE_ROOT, category);

  fs.readdir(dir, (err, files) => {
    if (err) {
      console.error("dir read error:", err);
      return res.status(500).json({ error: "Unable to list files" });
    }

    /* Remove each file serially to keep it simple */
    let failed = [];
    files.forEach((f) => {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch (e) {
        failed.push(f);
      }
    });

    if (failed.length)
      return res
        .status(500)
        .json({ error: "Some files could not be deleted", failed });

    res.json({ deletedAll: true, album: category });
  });
});

/* ───────────────── START ───────────────── */
app.listen(PORT, () =>
  console.log(`Gallery backend running at http://localhost:${PORT}`)
);
