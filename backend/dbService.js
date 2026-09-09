// dbService.js
// Local storage replacement for driveService.js
// PDFs are stored on disk under RESUME_STORE_DIR; searchable metadata lives in MySQL.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const RESUME_STORE_DIR = process.env.RESUME_STORE_DIR || path.join(__dirname, 'resumes');
fs.mkdirSync(RESUME_STORE_DIR, { recursive: true });

console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASSWORD exists:", !!process.env.DB_PASSWORD);
console.log("DB_NAME:", process.env.DB_NAME);
console.log("DB_PORT:", process.env.DB_PORT);

// ---- Connection pool ----
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'candidate_vault',
  waitForConnections: true,
  connectionLimit: 10,
});

// ---- Schema bootstrap (safe to call on every boot) ----
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidates (
      id            VARCHAR(36)  NOT NULL PRIMARY KEY,
      file_name     VARCHAR(255) NOT NULL,
      file_path     VARCHAR(500) NOT NULL,
      fields_json   JSON         NOT NULL,
      search_text   TEXT         NOT NULL,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FULLTEXT KEY ft_search (search_text)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function flattenFieldsToSearchText(fields) {
  return Object.values(fields || {})
    .filter(v => v !== null && v !== undefined)
    .map(v => String(v))
    .join(' ');
}

// ---- uploadResume: save PDF to disk, insert row ----
// opts: { filePath (tmp upload path), fileName, fields }
async function uploadResume(opts) {
  const { filePath, fileName, fields } = opts;

  const id = crypto.randomUUID();
  const ext = path.extname(fileName) || '.pdf';
  const storedFileName = `${id}${ext}`;
  const destPath = path.join(RESUME_STORE_DIR, storedFileName);

  // Move (copy+unlink) the uploaded temp file into permanent storage
  await fs.promises.copyFile(filePath, destPath);

  const searchText = flattenFieldsToSearchText(fields);

  await pool.query(
    `INSERT INTO candidates (id, file_name, file_path, fields_json, search_text)
     VALUES (?, ?, ?, ?, ?)`,
    [id, fileName, destPath, JSON.stringify(fields), searchText]
  );

  return { id, fileName, fields };
}

// ---- listResumes: optionally filter with a search query ----
async function listResumes(query) {
  let rows;
  if (query && query.trim()) {
    const q = query.trim();
    [rows] = await pool.query(
      `SELECT id, file_name, fields_json, created_at
       FROM candidates
       WHERE MATCH(search_text) AGAINST (? IN NATURAL LANGUAGE MODE)
          OR search_text LIKE ?
       ORDER BY created_at DESC`,
      [q, `%${q}%`]
    );
  } else {
    [rows] = await pool.query(
      `SELECT id, file_name, fields_json, created_at
       FROM candidates
       ORDER BY created_at DESC`
    );
  }

  return rows.map(r => ({
    id: r.id,
    fileName: r.file_name,
    fields: typeof r.fields_json === 'string' ? JSON.parse(r.fields_json) : r.fields_json,
    createdAt: r.created_at
  }));
}

// ---- getResume: fetch one record + a local view/embed path ----
async function getResume(id) {
  const [rows] = await pool.query(
    `SELECT id, file_name, file_path, fields_json, created_at
     FROM candidates WHERE id = ?`,
    [id]
  );
  if (!rows.length) {
    const err = new Error('Resume not found');
    err.status = 404;
    throw err;
  }
  const r = rows[0];
  return {
    id: r.id,
    fileName: r.file_name,
    filePath: r.file_path,
    fields: typeof r.fields_json === 'string' ? JSON.parse(r.fields_json) : r.fields_json,
    createdAt: r.created_at
  };
}

module.exports = {
  init,
  uploadResume,
  listResumes,
  getResume,
  RESUME_STORE_DIR,
};
