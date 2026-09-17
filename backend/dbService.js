// dbService.js
// Candidate metadata + resume storage in MySQL/local disk.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const RESUME_STORE_DIR =
  process.env.RESUME_STORE_DIR ||
  path.join(__dirname, 'resumes');

fs.mkdirSync(RESUME_STORE_DIR, {
  recursive: true
});


// ============================================================
// MYSQL CONNECTION
// ============================================================

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'candidate_vault',

  waitForConnections: true,
  connectionLimit: 10
});


// ============================================================
// DATABASE INITIALIZATION
// ============================================================

async function init() {

  // ----------------------------------------------------------
  // JOBS TABLE
  // ----------------------------------------------------------

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (

      id              VARCHAR(36) NOT NULL PRIMARY KEY,

      company_name    VARCHAR(255) NOT NULL,

      job_role        VARCHAR(255) NULL,

      hr_details      TEXT NOT NULL,

      job_description TEXT NOT NULL,

      created_at      DATETIME NOT NULL
                      DEFAULT CURRENT_TIMESTAMP,

      INDEX idx_company (company_name(100)),

      INDEX idx_job_role (job_role(100))

    )
    ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
  `);


  // ----------------------------------------------------------
  // MIGRATION:
  // Add job_role if database was created before Role
  // was introduced.
  // ----------------------------------------------------------

  const [jobRoleColumns] =
    await pool.query(
      `SHOW COLUMNS FROM jobs LIKE 'job_role'`
    );


  if (!jobRoleColumns.length) {

    console.log(
      'Adding missing jobs.job_role column...'
    );

    await pool.query(`
      ALTER TABLE jobs
      ADD COLUMN job_role VARCHAR(255) NULL
      AFTER company_name
    `);

  }


  // ----------------------------------------------------------
  // CANDIDATES TABLE
  // ----------------------------------------------------------

  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidates (

      id            VARCHAR(36) NOT NULL PRIMARY KEY,

      file_name     VARCHAR(255) NOT NULL,

      file_path     VARCHAR(500) NOT NULL,

      fields_json   JSON NOT NULL,

      search_text   TEXT NOT NULL,

      job_id        VARCHAR(36) NULL,

      created_at    DATETIME NOT NULL
                    DEFAULT CURRENT_TIMESTAMP,

      FULLTEXT KEY ft_search (search_text),

      INDEX idx_job_id (job_id)

    )
    ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
  `);


  // ----------------------------------------------------------
  // MIGRATION:
  // Add job_id if missing.
  // ----------------------------------------------------------

  const [candidateJobColumns] =
    await pool.query(
      `SHOW COLUMNS FROM candidates LIKE 'job_id'`
    );


  if (!candidateJobColumns.length) {

    console.log(
      'Adding missing candidates.job_id column...'
    );

    await pool.query(`
      ALTER TABLE candidates
      ADD COLUMN job_id VARCHAR(36) NULL,

      ADD INDEX idx_job_id (job_id)
    `);

  }


  console.log(
    'Database initialized successfully.'
  );
}


// ============================================================
// COMPANY LIST
// ============================================================

async function listCompanies() {

  const [rows] = await pool.query(`
    SELECT
      j.company_name,

      COUNT(c.id) AS applicant_count,

      COUNT(DISTINCT j.id) AS role_count

    FROM jobs j

    LEFT JOIN candidates c
      ON c.job_id = j.id

    GROUP BY
      j.company_name

    ORDER BY
      j.company_name ASC
  `);


  return rows.map(r => ({

    name:
      r.company_name,

    applicantCount:
      Number(r.applicant_count || 0),

    roleCount:
      Number(r.role_count || 0)

  }));
}


// ============================================================
// ROLE LIST
// ============================================================

async function listRoles() {

  const [rows] = await pool.query(`
    SELECT

      j.id,

      j.company_name,

      j.job_role,

      j.hr_details,

      j.job_description,

      j.created_at,

      COUNT(c.id) AS applicant_count,

      MAX(c.created_at) AS latest_application

    FROM jobs j

    LEFT JOIN candidates c
      ON c.job_id = j.id

    GROUP BY

      j.id,

      j.company_name,

      j.job_role,

      j.hr_details,

      j.job_description,

      j.created_at

    ORDER BY

      latest_application DESC,

      j.created_at DESC
  `);


  return rows.map(r => ({

    id:
      r.id,

    // IMPORTANT:
    // Database column = job_role
    // API property = role

    role:
      r.job_role || '',

    companyName:
      r.company_name,

    hrDetails:
      r.hr_details,

    jobDescription:
      r.job_description,

    applicantCount:
      Number(r.applicant_count || 0),

    latestApplication:
      r.latest_application

  }));
}


// ============================================================
// SEARCH TEXT
// ============================================================

function flattenFieldsToSearchText(fields) {

  return Object.values(fields || {})

    .filter(
      value =>
        value !== null &&
        value !== undefined
    )

    .map(value => String(value))

    .join(' ');
}


// ============================================================
// FIND OR CREATE JOB
// ============================================================

async function findOrCreateJob({

  companyName,

  jobRole,

  role,

  hrDetails,

  jobDescription

}) {

  /*
   * Support both:
   *
   * jobRole
   * role
   *
   * This prevents frontend compatibility problems.
   */

  const normalizedRole =
    String(
      jobRole ??
      role ??
      ''
    ).trim();


  // ----------------------------------------------------------
  // CHECK WHETHER SAME JOB ALREADY EXISTS
  // ----------------------------------------------------------

  const [rows] =
    await pool.query(

      `SELECT

         id,

         company_name,

         job_role,

         hr_details,

         job_description

       FROM jobs

       WHERE company_name = ?

         AND COALESCE(job_role, '') = ?

         AND hr_details = ?

         AND job_description = ?

       LIMIT 1`,

      [
        companyName,

        normalizedRole,

        hrDetails,

        jobDescription
      ]

    );


  if (rows.length) {

    return rows[0];

  }


  // ----------------------------------------------------------
  // CREATE NEW JOB
  // ----------------------------------------------------------

  const id =
    crypto.randomUUID();


  await pool.query(

    `INSERT INTO jobs

      (
        id,

        company_name,

        job_role,

        hr_details,

        job_description
      )

     VALUES (?, ?, ?, ?, ?)`,

    [

      id,

      companyName,

      normalizedRole || null,

      hrDetails,

      jobDescription

    ]

  );


  return {

    id,

    company_name:
      companyName,

    job_role:
      normalizedRole,

    hr_details:
      hrDetails,

    job_description:
      jobDescription

  };

}


// ============================================================
// UPLOAD RESUME
// ============================================================

async function uploadResume(opts) {

  const {
    filePath,
    fileName,
    fields,
    jobId
  } = opts;


  const id =
    crypto.randomUUID();


  const ext =
    path.extname(fileName) ||
    '.pdf';


  const storedFileName =
    `${id}${ext}`;


  const destPath =
    path.join(
      RESUME_STORE_DIR,
      storedFileName
    );


  // Copy PDF into permanent resume directory.

  await fs.promises.copyFile(
    filePath,
    destPath
  );


  const searchText =
    flattenFieldsToSearchText(
      fields
    );


  await pool.query(

    `INSERT INTO candidates

      (
        id,

        file_name,

        file_path,

        fields_json,

        search_text,

        job_id
      )

     VALUES (?, ?, ?, ?, ?, ?)`,

    [

      id,

      fileName,

      destPath,

      JSON.stringify(fields),

      searchText,

      jobId || null

    ]

  );


  return {

    id,

    fileName,

    fields

  };

}


// ============================================================
// LIST / SEARCH RESUMES
// ============================================================

async function listResumes(query) {

  let rows;


  const select = `

    SELECT

      c.id,

      c.file_name,

      c.fields_json,

      c.created_at,

      c.job_id,

      j.company_name,

      j.job_role,

      j.hr_details,

      j.job_description,

      (
        SELECT COUNT(*)

        FROM candidates c2

        WHERE c2.job_id = c.job_id

      ) AS applicant_count

    FROM candidates c

    LEFT JOIN jobs j

      ON j.id = c.job_id

  `;


  // ----------------------------------------------------------
  // SEARCH
  // ----------------------------------------------------------

  if (
    query &&
    query.trim()
  ) {

    const q =
      query.trim();


    [rows] =
      await pool.query(

        `${select}

         WHERE c.search_text LIKE ?

            OR j.company_name LIKE ?

            OR j.job_role LIKE ?

            OR j.hr_details LIKE ?

            OR j.job_description LIKE ?

         ORDER BY
           c.created_at DESC`,

        [

          `%${q}%`,

          `%${q}%`,

          `%${q}%`,

          `%${q}%`,

          `%${q}%`

        ]

      );

  }

  // ----------------------------------------------------------
  // ALL CANDIDATES
  // ----------------------------------------------------------

  else {

    [rows] =
      await pool.query(

        `${select}

         ORDER BY
           c.created_at DESC`

      );

  }


  return rows.map(r => ({

    id:
      r.id,

    fileName:
      r.file_name,

    fields:
      typeof r.fields_json === 'string'

        ? JSON.parse(r.fields_json)

        : r.fields_json,

    createdAt:
      r.created_at,

    jobId:
      r.job_id,

    job:

      r.company_name

        ? {

            id:
              r.job_id,

            company_name:
              r.company_name,

            job_role:
              r.job_role,

            hr_details:
              r.hr_details,

            job_description:
              r.job_description,

            applicant_count:
              Number(
                r.applicant_count || 0
              )

          }

        : null

  }));

}


// ============================================================
// GET SINGLE RESUME
// ============================================================

async function getResume(id) {

  const [rows] =
    await pool.query(

      `SELECT

         c.id,

         c.file_name,

         c.file_path,

         c.fields_json,

         c.created_at,

         c.job_id,

         j.company_name,

         j.job_role,

         j.hr_details,

         j.job_description,

         (
           SELECT COUNT(*)

           FROM candidates c2

           WHERE c2.job_id = c.job_id

         ) AS applicant_count

       FROM candidates c

       LEFT JOIN jobs j

         ON j.id = c.job_id

       WHERE c.id = ?`,

      [id]

    );


  if (!rows.length) {

    const err =
      new Error(
        'Resume not found'
      );

    err.status = 404;

    throw err;

  }


  const r =
    rows[0];


  return {

    id:
      r.id,

    fileName:
      r.file_name,

    filePath:
      r.file_path,

    fields:

      typeof r.fields_json === 'string'

        ? JSON.parse(r.fields_json)

        : r.fields_json,

    createdAt:
      r.created_at,

    job:

      r.company_name

        ? {

            id:
              r.job_id,

            company_name:
              r.company_name,

            job_role:
              r.job_role,

            hr_details:
              r.hr_details,

            job_description:
              r.job_description,

            applicant_count:
              Number(
                r.applicant_count || 0
              )

          }

        : null

  };

}


// ============================================================
// DASHBOARD STATS
// ============================================================

async function getStats() {

  const [
    [candidateRows],

    [jobRows],

    [companyRows]

  ] = await Promise.all([

    pool.query(
      `SELECT COUNT(*) AS count
       FROM candidates`
    ),

    pool.query(
      `SELECT COUNT(DISTINCT job_id) AS count
       FROM candidates
       WHERE job_id IS NOT NULL`
    ),

    pool.query(`
      SELECT
        COUNT(
          DISTINCT j.company_name
        ) AS count

      FROM jobs j

      INNER JOIN candidates c

        ON c.job_id = j.id
    `)

  ]);


  return {

    candidates:
      Number(
        candidateRows[0].count || 0
      ),

    jobs:
      Number(
        jobRows[0].count || 0
      ),

    companies:
      Number(
        companyRows[0].count || 0
      )

  };

}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {

  init,

  findOrCreateJob,

  uploadResume,

  listResumes,

  getResume,

  getStats,

  listCompanies,

  listRoles,

  RESUME_STORE_DIR

};