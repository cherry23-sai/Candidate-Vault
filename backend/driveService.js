// driveService.js
// Uses Google Drive as the "database": every resume PDF is uploaded into a
// dedicated Drive folder, with the parsed candidate fields attached to that
// file as Drive "properties" (custom key/value metadata). Searching means
// listing the folder and filtering on those properties - no separate DB.

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const FOLDER_NAME = 'CandidateVault';

function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  const oAuth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
  );
  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
  }
  return oAuth2Client;
}

function getAuthUrl(oAuth2Client) {
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
}

async function saveToken(oAuth2Client, code) {
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
}

async function getOrCreateFolder(drive) {
  const existing = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)'
  });
  if (existing.data.files.length > 0) return existing.data.files[0].id;

  const folder = await drive.files.create({
    resource: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id'
  });
  return folder.data.id;
}

async function uploadResume(oAuth2Client, { filePath, fileName, fields }) {
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const folderId = await getOrCreateFolder(drive);

  // Drive property values are capped at 124 bytes each - trim defensively.
  const properties = {};
  for (const [key, value] of Object.entries(fields)) {
    properties[key] = String(value).slice(0, 120);
  }

  const file = await drive.files.create({
    resource: { name: fileName, parents: [folderId], properties },
    media: { mimeType: 'application/pdf', body: fs.createReadStream(filePath) },
    fields: 'id, name, webViewLink'
  });

  // Makes the file viewable via a shareable link so it can be embedded on
  // the View tab. Remove this call if you'd rather keep resumes fully
  // private and only ever open them while signed into the owning account.
  await drive.permissions.create({
    fileId: file.data.id,
    requestBody: { role: 'reader', type: 'anyone' }
  });

  return file.data;
}

async function listResumes(oAuth2Client) {
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const folderId = await getOrCreateFolder(drive);
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, properties, webViewLink)'
  });
  return res.data.files;
}

async function getResume(oAuth2Client, fileId) {
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const res = await drive.files.get({ fileId, fields: 'id, name, properties, webViewLink' });
  return res.data;
}

module.exports = { getOAuthClient, getAuthUrl, saveToken, uploadResume, listResumes, getResume };
