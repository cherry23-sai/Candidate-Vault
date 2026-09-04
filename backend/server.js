// server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const { parseCandidateText } = require('./parser');
const drive = require('./driveService');

const app = express();
const UPLOAD_TMP = path.join(__dirname, 'uploads_tmp');
fs.mkdirSync(UPLOAD_TMP, { recursive: true });
const upload = multer({ dest: UPLOAD_TMP });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const oAuth2Client = drive.getOAuthClient();

// ---- One-time Google sign-in ----
app.get('/auth', (req, res) => {
  res.redirect(drive.getAuthUrl(oAuth2Client));
});

app.get('/oauth2callback', async (req, res) => {
  try {
    await drive.saveToken(oAuth2Client, req.query.code);
    res.send('Google Drive connected. You can close this tab and use the app.');
  } catch (err) {
    res.status(500).send('Auth failed: ' + err.message);
  }
});

// ---- Upload: pasted text + PDF -> parsed record saved to Drive ----
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
    const driveFile = await drive.uploadResume(oAuth2Client, {
      filePath: req.file.path,
      fileName,
      fields
    });

    fs.unlink(req.file.path, () => {}); // clean up temp upload

    res.json({ success: true, fileId: driveFile.id, fields });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Watch: search across all fields (skills, location, company, ...) ----
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase().trim();
    const files = await drive.listResumes(oAuth2Client);

    const results = files
      .map(f => ({ fileId: f.id, ...f.properties }))
      .filter(r => !q || Object.values(r).some(v => String(v).toLowerCase().includes(q)));

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- View: full profile + embeddable resume link ----
app.get('/api/profile/:fileId', async (req, res) => {
  try {
    const file = await drive.getResume(oAuth2Client, req.params.fileId);
    res.json({
      fields: file.properties,
      resumeViewLink: file.webViewLink,
      resumeEmbedLink: `https://drive.google.com/file/d/${file.id}/preview`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Candidate Vault running at http://localhost:${PORT}`));
