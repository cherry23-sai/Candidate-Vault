// server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const { parseCandidateText } = require('./parser');
const db = require('./dbService');

const app = express();
const UPLOAD_TMP = path.join(__dirname, 'uploads_tmp');
fs.mkdirSync(UPLOAD_TMP, { recursive: true });
const upload = multer({ dest: UPLOAD_TMP });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ---- Upload: pasted text + PDF -> parsed record saved to MySQL + local disk ----
app.post('/api/upload', upload.single('resume'), async (req, res) => {
  try {
    const fields = parseCandidateText(req.body.text || '');

    if (!fields.name) {
      return res.status(400).json({ error: 'Could not detect a Name field in the pasted text.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file was uploaded.' });
    }

    const fileName = `${fields.name.replace(/\s+/g, '_')}_resume.pdf`;
    const record = await db.uploadResume({
      filePath: req.file.path,
      fileName,
      fields
    });

    fs.unlink(req.file.path, () => {}); // clean up temp upload

    res.json({ success: true, fileId: record.id, fields: record.fields });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Watch: search across all fields (skills, location, company, ...) ----
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const results = await db.listResumes(q);
    res.json({ results: results.map(r => ({ fileId: r.id, ...r.fields })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- View: full profile + embeddable resume link ----
app.get('/api/profile/:fileId', async (req, res) => {
  try {
    const record = await db.getResume(req.params.fileId);
    res.json({
      fields: record.fields,
      resumeViewLink: `/api/resume/${record.id}/file`,
      resumeEmbedLink: `/api/resume/${record.id}/file`
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---- Serve the actual PDF bytes from local disk ----
app.get('/api/resume/:fileId/file', async (req, res) => {
  try {
    const record = await db.getResume(req.params.fileId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${record.fileName}"`);
    fs.createReadStream(record.filePath).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

db.init()
  .then(() => {
    app.listen(PORT, () => console.log(`Candidate Vault running at http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });