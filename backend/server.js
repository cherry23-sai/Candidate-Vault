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

          error:
            'Invalid username, password or role.'

        });

    }


    const token =
      createToken(user);


    res.json({

      success:
        true,

      token,

      role:
        user.role,

      username:
        user.username

    });

  }
);


// ============================================================
// LOGOUT
// ============================================================

app.post(
  '/api/logout',
  requireAuth,
  (req, res) => {

    activeTokens.delete(
      req.token
    );


    res.json({
      success:
        true
    });

  }
);


// ============================================================
// CURRENT USER
// ============================================================

app.get(
  '/api/me',
  requireAuth,
  (req, res) => {

    res.json({

      username:
        req.user.username,

      role:
        req.user.role

    });

  }
);


// ============================================================
// UPLOAD CANDIDATE
// ADMIN ONLY
// ============================================================

app.post(
  '/api/upload',

  requireAuth,

  requireAdmin,

  upload.single(
    'resume'
  ),

  async (
    req,
    res
  ) => {

    let tempPath =
      req.file?.path;


    try {

      // ------------------------------------------------------
      // PARSE CANDIDATE
      // ------------------------------------------------------

      const fields =
        parseCandidateText(
          req.body.text || ''
        );


      // ------------------------------------------------------
      // JOB DETAILS
      // ------------------------------------------------------

      const companyName =
        String(
          req.body.companyName ||
          ''
        ).trim();


      /*
       * IMPORTANT:
       *
       * Accept both:
       *
       * jobRole
       *
       * role
       *
       */

      const jobRole =
        String(
          req.body.jobRole ??
          req.body.role ??
          ''
        ).trim();


      const hrDetails =
        String(
          req.body.hrDetails ||
          ''
        ).trim();


      const jobDescription =
        String(
          req.body.jobDescription ||
          ''
        ).trim();


      // ------------------------------------------------------
      // VALIDATION
      // ------------------------------------------------------

      if (!fields.name) {

        return res
          .status(400)
          .json({

            error:
              'Could not detect a Name field in the pasted text.'

          });

      }


      if (!req.file) {

        return res
          .status(400)
          .json({

            error:
              'No PDF file was uploaded.'

          });

      }


      if (!companyName) {

        return res
          .status(400)
          .json({

            error:
              'Company Name is required.'

          });

      }


      if (!jobRole) {

        return res
          .status(400)
          .json({

            error:
              'Role is required.'

          });

      }


      if (!hrDetails) {

        return res
          .status(400)
          .json({

            error:
              'HR Details are required.'

          });

      }


      if (!jobDescription) {

        return res
          .status(400)
          .json({

            error:
              'Job Description is required.'

          });

      }


      // ------------------------------------------------------
      // FIND / CREATE JOB
      // ------------------------------------------------------

      const job =
        await db.findOrCreateJob({

          companyName,

          jobRole,

          hrDetails,

          jobDescription

        });


      // ------------------------------------------------------
      // CREATE SAFE FILE NAME
      // ------------------------------------------------------

      const safeName =
        fields.name

          .replace(
            /[^\w\s-]/g,
            ''
          )

          .replace(
            /\s+/g,
            '_'
          );


      const fileName =
        `${safeName}_resume.pdf`;


      // ------------------------------------------------------
      // SAVE RESUME
      // ------------------------------------------------------

      const record =
        await db.uploadResume({

          filePath:
            req.file.path,

          fileName,

          fields,

          jobId:
            job.id

        });


      // ------------------------------------------------------
      // DELETE TEMP FILE
      // ------------------------------------------------------

      fs.unlink(
        req.file.path,
        () => {}
      );


      tempPath =
        null;


      // ------------------------------------------------------
      // RESPONSE
      // ------------------------------------------------------

      res.json({

        success:
          true,

        fileId:
          record.id,

        fields:
          record.fields,

        job: {

          id:
            job.id,

          companyName:
            job.company_name,

          // IMPORTANT
          // MySQL job_role -> API role

          role:
            job.job_role || '',

          hrDetails:
            job.hr_details,

          jobDescription:
            job.job_description

        }

      });

    }

    catch (err) {

      console.error(
        'Upload error:',
        err
      );


      res
        .status(500)
        .json({

          error:
            err.message

        });

    }

    finally {

      if (tempPath) {

        fs.unlink(
          tempPath,
          () => {}
        );

      }

    }

  }
);


// ============================================================
// SEARCH CANDIDATES
// BOTH ADMIN AND EMPLOYEE
// ============================================================

app.get(
  '/api/search',

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const q =
        String(
          req.query.q || ''
        ).trim();


      const results =
        await db.listResumes(q);


      res.json({

        results:

          results.map(
            r => ({

              fileId:
                r.id,

              ...r.fields,

              jobId:
                r.jobId,

              jobRole:
                r.job?.job_role ||
                '',

              jobCompany:
                r.job?.company_name ||
                '',

              hrDetails:
                r.job?.hr_details ||
                '',

              jobDescription:
                r.job?.job_description ||
                '',

              applicantCount:
                r.job?.applicant_count ||
                0

            })
          )

      });

    }

    catch (err) {

      console.error(
        'Search error:',
        err
      );


      res
        .status(500)
        .json({

          error:
            err.message

        });

    }

  }
);


// ============================================================
// VIEW PROFILE
// BOTH ADMIN AND EMPLOYEE
// ============================================================

app.get(
  '/api/profile/:fileId',

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const record =
        await db.getResume(
          req.params.fileId
        );


      res.json({

        fields:
          record.fields,

        fileName:
          record.fileName,

        job:

          record.job

            ? {

                id:
                  record.job.id,

                // IMPORTANT
                // Database job_role -> API role

                role:
                  record.job.job_role ||
                  '',

                companyName:
                  record.job.company_name,

                hrDetails:
                  record.job.hr_details,

                jobDescription:
                  record.job.job_description,

                applicantCount:
                  record.job.applicant_count

              }

            : null,


        resumeViewLink:
          `/api/resume/${record.id}/file`,

        resumeEmbedLink:
          `/api/resume/${record.id}/file`

      });

    }

    catch (err) {

      console.error(
        'Profile error:',
        err
      );


      res
        .status(
          err.status || 500
        )
        .json({

          error:
            err.message

        });

    }

  }
);


// ============================================================
// RESUME PDF
// ============================================================

app.get(
  '/api/resume/:fileId/file',

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const record =
        await db.getResume(
          req.params.fileId
        );


      res.setHeader(
        'Content-Type',
        'application/pdf'
      );


      res.setHeader(
        'Content-Disposition',
        `inline; filename="${record.fileName}"`
      );


      fs.createReadStream(
        record.filePath
      ).pipe(res);

    }

    catch (err) {

      console.error(
        'Resume error:',
        err
      );


      res
        .status(
          err.status || 500
        )
        .json({

          error:
            err.message

        });

    }

  }
);


// ============================================================
// COMPANIES
// BOTH ADMIN AND EMPLOYEE
// ============================================================

app.get(
  '/api/companies',

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const companies =
        await db.listCompanies();


      res.json({

        companies

      });

    }

    catch (err) {

      console.error(
        'Companies error:',
        err
      );


      res
        .status(500)
        .json({

          error:
            err.message

        });

    }

  }
);


// ============================================================
// ROLES
// BOTH ADMIN AND EMPLOYEE
// ============================================================

app.get(
  '/api/roles',

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const roles =
        await db.listRoles();


      res.json({

        roles

      });

    }

    catch (err) {

      console.error(
        'Roles error:',
        err
      );


      res
        .status(500)
        .json({

          error:
            err.message

        });

    }

  }
);


// ============================================================
// DASHBOARD STATS
// ADMIN ONLY
// ============================================================

app.get(
  '/api/stats',

  requireAuth,

  requireAdmin,

  async (
    req,
    res
  ) => {

    try {

      const stats =
        await db.getStats();


      res.json(
        stats
      );

    }

    catch (err) {

      console.error(
        'Stats error:',
        err
      );


      res
        .status(500)
        .json({

          error:
            err.message

        });

    }

  }
);


// ============================================================
// START SERVER
// ============================================================

const PORT =
  process.env.PORT ||
  3000;


db.init()

  .then(() => {

    app.listen(
      PORT,

      () => {

        console.log(
          `Hire Path running at http://localhost:${PORT}`
        );

      }

    );

  })

  .catch(
    err => {

      console.error(
        'Failed to initialize database:',
        err
      );


      process.exit(1);

    }
  );