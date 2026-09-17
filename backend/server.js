// server.js

require('dotenv').config();

const express =
  require('express');

const multer =
  require('multer');

const cors =
  require('cors');

const fs =
  require('fs');

const path =
  require('path');

const crypto =
  require('crypto');


const {
  parseCandidateText
} = require('./parser');


const db =
  require('./dbService');


const app =
  express();


// ============================================================
// UPLOAD TEMP DIRECTORY
// ============================================================

const UPLOAD_TMP =
  path.join(
    __dirname,
    'uploads_tmp'
  );


fs.mkdirSync(
  UPLOAD_TMP,
  {
    recursive: true
  }
);


// ============================================================
// MULTER
// ============================================================

const upload =
  multer({

    dest:
      UPLOAD_TMP,

    limits: {
      fileSize:
        10 * 1024 * 1024
    },

    fileFilter:
      (req, file, cb) => {

        cb(
          null,

          file.mimetype ===
            'application/pdf'
        );

      }

  });


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
  cors()
);

app.use(
  express.json()
);


// Serve frontend.

app.use(
  express.static(
    path.join(
      __dirname,
      '..',
      'frontend'
    )
  )
);


// ============================================================
// USERS
// ============================================================

const USERS = {

  admin: {

    username:
      process.env.ADMIN_USERNAME ||
      'admin',

    password:
      process.env.ADMIN_PASSWORD ||
      'Admin@123',

    role:
      'admin'

  },


  employee: {

    username:
      process.env.EMPLOYEE_USERNAME ||
      'employee',

    password:
      process.env.EMPLOYEE_PASSWORD ||
      'Employee@123',

    role:
      'employee'

  }

};


// ============================================================
// ACTIVE LOGIN TOKENS
// ============================================================

const activeTokens =
  new Map();


// ============================================================
// AUTHENTICATE USER
// ============================================================

function authenticateUser(
  role,
  username,
  password
) {

  const user =
    USERS[role];


  return (

    user &&

    user.username === username &&

    user.password === password

  )

    ? user

    : null;

}


// ============================================================
// CREATE LOGIN TOKEN
// ============================================================

function createToken(user) {

  const token =
    crypto.randomBytes(
      32
    ).toString('hex');


  activeTokens.set(
    token,
    {

      role:
        user.role,

      username:
        user.username,

      createdAt:
        Date.now()

    }
  );


  return token;

}


// ============================================================
// AUTH MIDDLEWARE
// ============================================================

function requireAuth(
  req,
  res,
  next
) {

  const header =
    req.get(
      'Authorization'
    ) || '';


  const token =
    header.startsWith(
      'Bearer '
    )

      ? header.slice(7)

      : '';


  const session =
    activeTokens.get(
      token
    );


  if (!session) {

    return res
      .status(401)
      .json({

        error:
          'Please sign in to continue.'

      });

  }


  req.user =
    session;


  req.token =
    token;


  next();

}


// ============================================================
// ADMIN MIDDLEWARE
// ============================================================

function requireAdmin(
  req,
  res,
  next
) {

  if (
    req.user?.role !==
    'admin'
  ) {

    return res
      .status(403)
      .json({

        error:
          'Administrator access is required for this action.'

      });

  }


  next();

}


// ============================================================
// LOGIN
// ============================================================

app.post(
  '/api/login',
  (req, res) => {

    const role =
      String(
        req.body.role || ''
      ).toLowerCase();


    const username =
      String(
        req.body.username || ''
      );


    const password =
      String(
        req.body.password || ''
      );


    if (
      ![
        'admin',
        'employee'
      ].includes(role)
    ) {

      return res
        .status(400)
        .json({

          error:
            'Select a valid role.'

        });

    }

    const user =
      authenticateUser(
        role,
        username,
        password
      );

    if (!user) {
      return res
        .status(401)
        .json({
          error: 'Invalid username or password.'
        });
    }

    const token =
      createToken(user);

    res.json({
      success: true,
      token,
      user: {
        role: user.role,
        username: user.username
      }
    });
  }
);

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
