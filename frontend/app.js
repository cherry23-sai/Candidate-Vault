const API = '';

let auth = {
  token: localStorage.getItem('hire_path_token'),
  role: localStorage.getItem('hire_path_role'),
  username: localStorage.getItem('hire_path_user')
};

const $ = id => document.getElementById(id);

const escapeHtml = value =>
  String(value ?? '-').replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[c])
  );

const initials = name =>
  String(name || 'C')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(x => x[0])
    .join('')
    .toUpperCase() || 'C';

function setStatus(el, message, type = '') {
  el.textContent = message;
  el.className = `form-status ${type}`;
}

function isAdmin() {
  return auth.role === 'admin';
}


// ============================================================
// API
// ============================================================

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});

  if (auth.token) {
    headers.set('Authorization', `Bearer ${auth.token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

  if (res.status === 401 || res.status === 403) {
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      logout(false);
    }

    throw new Error(
      data.error || 'You are not authorized to perform this action.'
    );
  }

  return res;
}


// ============================================================
// LOGIN / APP
// ============================================================

function showApp() {
  $('loginScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');

  $('sidebarUser').textContent = auth.username || auth.role;

  $('headerRole').textContent =
    auth.role === 'admin'
      ? 'Administrator'
      : 'Employee';

  $('userAvatar').textContent =
    initials(auth.username || auth.role);

  document
    .querySelectorAll('.admin-only')
    .forEach(el => {
      el.classList.toggle('hidden', !isAdmin());
    });

  if (!isAdmin()) {
    switchTab('watch');
  } else {
    switchTab('upload');
  }

  loadStats();
}


function logout(clear = true) {
  if (clear) {
    localStorage.removeItem('hire_path_token');
    localStorage.removeItem('hire_path_role');
    localStorage.removeItem('hire_path_user');
  }

  auth = {
    token: null,
    role: null,
    username: null
  };

  $('appShell').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');

  $('password').value = '';
}


// ============================================================
// NAVIGATION
// ============================================================

function switchTab(tab) {

  if (!tab) return;

  // Employees cannot access upload
  if (tab === 'upload' && !isAdmin()) {
    tab = 'watch';
  }

  const titles = {
    upload: [
      'UPLOAD CANDIDATE',
      'Add a candidate'
    ],

    watch: [
      'CANDIDATE SEARCH',
      'Search candidates'
    ],

    companies: [
      'COMPANY DIRECTORY',
      'Companies'
    ],

    roles: [
      'ROLE DIRECTORY',
      'Roles'
    ],

    view: [
      'PROFILE VIEW',
      'Candidate overview'
    ]
  };

  if (!titles[tab]) return;

  document
    .querySelectorAll('.nav-item')
    .forEach(btn => {
      btn.classList.toggle(
        'active',
        btn.dataset.tab === tab
      );
    });

  document
    .querySelectorAll('.panel')
    .forEach(panel => {
      panel.classList.toggle(
        'active',
        panel.id === tab
      );
    });

  $('pageSection').textContent = titles[tab][0];
  $('pageTitle').textContent = titles[tab][1];

  document
    .querySelector('.content-area')
    ?.scrollTo({
      top: 0,
      behavior: 'smooth'
    });

  if (
    tab === 'watch' &&
    !$('searchResults').children.length
  ) {
    runSearch();
  }

  if (tab === 'companies') {
    loadCompanies();
  }

  if (tab === 'roles') {
    loadRoles();
  }
}


// ============================================================
// LOGIN ROLE SELECTION
// ============================================================

document
  .querySelectorAll('.role-option')
  .forEach(btn => {

    btn.addEventListener('click', () => {

      document
        .querySelectorAll('.role-option')
        .forEach(b =>
          b.classList.remove('active')
        );

      btn.classList.add('active');

      $('loginRole').value =
        btn.dataset.role;
    });

  });


// ============================================================
// PASSWORD TOGGLE
// ============================================================

$('togglePassword').addEventListener(
  'click',
  () => {

    const p = $('password');

    p.type =
      p.type === 'password'
        ? 'text'
        : 'password';

    $('togglePassword').textContent =
      p.type === 'password'
        ? 'Show'
        : 'Hide';
  }
);


// ============================================================
// LOGIN
// ============================================================

$('loginForm').addEventListener(
  'submit',
  async e => {

    e.preventDefault();

    const status =
      $('loginStatus');

    setStatus(
      status,
      'Signing in...'
    );

    try {

      const res = await fetch(
        `${API}/api/login`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            role:
              $('loginRole').value,

            username:
              $('username')
                .value
                .trim(),

            password:
              $('password').value
          })
        }
      );

      const data =
        await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ||
          'Invalid login details.'
        );
      }

      auth = {
        token: data.token,
        role: data.role,
        username: data.username
      };

      localStorage.setItem(
        'hire_path_token',
        auth.token
      );

      localStorage.setItem(
        'hire_path_role',
        auth.role
      );

      localStorage.setItem(
        'hire_path_user',
        auth.username
      );

      setStatus(
        status,
        ''
      );

      showApp();

    } catch (err) {

      setStatus(
        status,
        err.message,
        'error'
      );
    }
  }
);


// ============================================================
// NAV BUTTONS
// ============================================================

document
  .querySelectorAll('.nav-item')
  .forEach(btn => {

    btn.addEventListener(
      'click',
      () => {
        switchTab(
          btn.dataset.tab
        );
      }
    );

  });


document.addEventListener(
  'click',
  e => {

    const target =
      e.target.closest(
        '[data-tab-target]'
      );

    if (!target) return;

    e.preventDefault();
    e.stopPropagation();

    const tab =
      target.dataset.tabTarget;

    if (tab) {
      switchTab(tab);
    }
  }
);


$('backToSearch').addEventListener(
  'click',
  () => switchTab('watch')
);


$('logoutBtn').addEventListener(
  'click',
  () => logout(true)
);


// ============================================================
// CANDIDATE TEXT
// ============================================================

$('candidateText').addEventListener(
  'input',
  () => {

    $('candidateChars').textContent =
      `${$('candidateText').value.length} characters`;

  }
);


// ============================================================
// RESUME FILE
// ============================================================

$('resumeFile').addEventListener(
  'change',
  () => {

    const file =
      $('resumeFile').files[0];

    $('fileLabel').textContent =
      file
        ? file.name
        : 'Choose a PDF resume';
  }
);


// ============================================================
// DRAG & DROP RESUME
// ============================================================

const dropzone =
  $('dropzone');

[
  'dragenter',
  'dragover'
].forEach(ev => {

  dropzone.addEventListener(
    ev,
    e => {

      e.preventDefault();

      dropzone.classList.add(
        'dragover'
      );
    }
  );

});


[
  'dragleave',
  'drop'
].forEach(ev => {

  dropzone.addEventListener(
    ev,
    e => {

      e.preventDefault();

      dropzone.classList.remove(
        'dragover'
      );
    }
  );

});


dropzone.addEventListener(
  'drop',
  e => {

    const file =
      e.dataTransfer.files[0];

    if (
      file &&
      file.type ===
        'application/pdf'
    ) {

      const dt =
        new DataTransfer();

      dt.items.add(file);

      $('resumeFile').files =
        dt.files;

      $('fileLabel').textContent =
        file.name;
    }
  }
);


// ============================================================
// UPLOAD CANDIDATE
// ============================================================

$('candidateForm').addEventListener(
  'submit',
  async e => {

    e.preventDefault();

    const text =
      $('candidateText')
        .value
        .trim();

    const file =
      $('resumeFile')
        .files[0];

    const status =
      $('uploadStatus');

    // --------------------------------------------------------
    // JOB DETAILS
    // --------------------------------------------------------

    const companyName =
      $('companyName')
        .value
        .trim();

    const role =
      $('jobRole')
        .value
        .trim();

    const hrDetails =
      $('hrDetails')
        .value
        .trim();

    const jobDescription =
      $('jobDescription')
        .value
        .trim();


    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (!text || !file) {

      setStatus(
        status,
        'Add candidate details and attach a PDF resume.',
        'error'
      );

      return;
    }


    if (
      !companyName ||
      !role ||
      !jobDescription
    ) {

      setStatus(
        status,
        'Please enter Company Name, Role, and Job Description.',
        'error'
      );

      return;
    }


    if (
      file.type !==
      'application/pdf'
    ) {

      setStatus(
        status,
        'Only PDF resumes are supported.',
        'error'
      );

      return;
    }


    // --------------------------------------------------------
    // FORM DATA
    // --------------------------------------------------------

    const form =
      new FormData();

    form.append(
      'text',
      text
    );

    form.append(
      'resume',
      file
    );

    form.append(
      'companyName',
      companyName
    );

    // IMPORTANT:
    // Role is sent to backend as "role"
    form.append(
      'role',
      role
    );

    form.append(
      'hrDetails',
      hrDetails
    );

    form.append(
      'jobDescription',
      jobDescription
    );


    setStatus(
      status,
      'Saving candidate...'
    );


    try {

      const res =
        await apiFetch(
          `${API}/api/upload`,
          {
            method: 'POST',
            body: form
          }
        );

      const data =
        await res.json();

      if (!res.ok) {

        throw new Error(
          data.error ||
          'Upload failed.'
        );
      }


      setStatus(
        status,
        `Candidate saved — ${data.fields.name} added to ${data.job.companyName}.`,
        'success'
      );


      $('candidateForm').reset();

      $('candidateChars').textContent =
        '0 characters';

      $('fileLabel').textContent =
        'Choose a PDF resume';


      loadStats();

    } catch (err) {

      setStatus(
        status,
        err.message,
        'error'
      );
    }
  }
);


// ============================================================
// SEARCH
// ============================================================

$('searchBtn').addEventListener(
  'click',
  runSearch
);


$('searchInput').addEventListener(
  'keydown',
  e => {

    if (e.key === 'Enter') {
      runSearch();
    }
  }
);


$('clearSearch').addEventListener(
  'click',
  () => {

    $('searchInput').value = '';

    runSearch();
  }
);


// ============================================================
// RUN SEARCH
// ============================================================

async function runSearch() {

  const q =
    $('searchInput')
      .value
      .trim();

  const grid =
    $('searchResults');


  grid.innerHTML =
    '<div class="loading">Searching candidate directory…</div>';


  try {

    const res =
      await apiFetch(
        `${API}/api/search?q=${encodeURIComponent(q)}`
      );

    const data =
      await res.json();


    if (!res.ok) {

      throw new Error(
        data.error ||
        'Search failed.'
      );
    }


    $('resultCount').textContent =
      `${data.results.length} candidate${
        data.results.length === 1
          ? ''
          : 's'
      } found`;


    if (!data.results.length) {

      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⌕</div>

          <h3>No matching candidates</h3>

          <p>
            Try a skill, company,
            location or experience keyword.
          </p>
        </div>
      `;

      return;
    }


    grid.innerHTML = '';


    data.results.forEach(
      r => {

        const row =
          document.createElement(
            'article'
          );

        row.className =
          'candidate-row';


        const skills =
          String(
            r.skills || ''
          )
            .split(',')
            .map(
              s => s.trim()
            )
            .filter(Boolean)
            .slice(0, 3);


        row.innerHTML = `
          <div class="candidate-avatar">
            ${escapeHtml(initials(r.name))}
          </div>

          <div>
            <h3 class="candidate-name">
              ${escapeHtml(r.name || 'Unknown')}
            </h3>

            <div class="candidate-sub">
              ${escapeHtml(
                r.email ||
                r.current_location ||
                'Candidate profile'
              )}
            </div>
          </div>

          <div>
            <span class="row-label">
              Skills
            </span>

            <div class="skill-tags">

              ${
                skills.length
                  ? skills
                      .map(
                        s =>
                          `<span class="skill-tag">
                            ${escapeHtml(s)}
                          </span>`
                      )
                      .join('')
                  : '<span class="row-value">Not specified</span>'
              }

            </div>
          </div>

          <div>
            <span class="row-label">
              Application
            </span>

            <span class="row-value">
              ${escapeHtml(
                r.jobCompany ||
                'Unassigned'
              )}
            </span>
          </div>

          <button
            class="view-btn"
            data-id="${escapeHtml(r.fileId)}"
          >
            View profile →
          </button>
        `;


        row
          .querySelector('.view-btn')
          .addEventListener(
            'click',
            () => openProfile(r.fileId)
          );


        grid.appendChild(row);
      }
    );

  } catch (err) {

    grid.innerHTML = `
      <div class="empty-state">
        <h3>
          Could not load candidates
        </h3>

        <p>
          ${escapeHtml(err.message)}
        </p>
      </div>
    `;
  }
}


// ============================================================
// VIEW PROFILE
// ============================================================

async function openProfile(fileId) {

  switchTab('view');

  const el =
    $('viewContent');

  el.innerHTML =
    '<div class="loading">Loading candidate profile…</div>';


  try {

    const res =
      await apiFetch(
        `${API}/api/profile/${encodeURIComponent(fileId)}`
      );


    const data =
      await res.json();


    if (!res.ok) {

      throw new Error(
        data.error ||
        'Profile not found.'
      );
    }


    const f =
      data.fields || {};

    const j =
      data.job || {};


    const pdfRes =
      await apiFetch(
        `${API}${data.resumeEmbedLink}`
      );


    if (!pdfRes.ok) {

      throw new Error(
        'Unable to load the resume PDF.'
      );
    }


    const pdfBlob =
      await pdfRes.blob();


    const resumeUrl =
      URL.createObjectURL(
        pdfBlob
      );


    el.innerHTML = `

      <div class="profile-layout">

        <div class="resume-panel">

          <div class="resume-toolbar">

            <span>
              ${escapeHtml(
                data.fileName ||
                'Resume.pdf'
              )}
            </span>

            <a
              href="${resumeUrl}"
              download
              class="download-btn"
            >
              Download PDF ↓
            </a>

          </div>


          <div class="resume-frame">

            <iframe
              src="${resumeUrl}"
              title="Candidate resume"
            ></iframe>

          </div>

        </div>


        <aside class="profile-panel">

          <div class="profile-hero">

            <div class="profile-avatar">
              ${escapeHtml(
                initials(f.name)
              )}
            </div>

            <div>

              <h3>
                ${escapeHtml(
                  f.name ||
                  'Unknown'
                )}
              </h3>

              <p>
                ${escapeHtml(
                  f.current_company ||
                  'Candidate'
                )}
                ·
                ${escapeHtml(
                  f.total_exp ||
                  'Experience not specified'
                )}
              </p>

            </div>

          </div>


          <div class="profile-section">

            <div class="profile-section-title">
              Contact & location
            </div>

            <div class="profile-grid">

              ${field(
                'Email',
                f.email
              )}

              ${field(
                'Mobile',
                f.mobile
              )}

              ${field(
                'Current location',
                f.current_location
              )}

              ${field(
                'Preferred location',
                f.preferred_location
              )}

            </div>

          </div>


          <div class="profile-section">

            <div class="profile-section-title">
              Professional details
            </div>

            <div class="profile-grid">

              ${field(
                'Skills',
                f.skills
              )}

              ${field(
                'Current company',
                f.current_company
              )}

              ${field(
                'Total experience',
                f.total_exp
              )}

              ${field(
                'Relevant experience',
                f.rel_exp
              )}

              ${field(
                'Notice period',
                f.notice_period
              )}

              ${field(
                'Current CTC',
                f.current_ctc
              )}

              ${field(
                'Expected CTC',
                f.exp_ctc
              )}

            </div>

          </div>


          <div class="profile-section">

            <div class="profile-section-title">
              Application
            </div>

            ${field(
              'Company',
              j.companyName ||
              'Not assigned'
            )}

            ${field(
              'Role',
              j.role ||
              'Not assigned'
            )}

            ${field(
              'HR details',
              j.hrDetails ||
              'Not available'
            )}


            <div
              class="profile-field"
              style="margin-top:13px"
            >

              <b>
                Job description
              </b>

              <span>
                ${escapeHtml(
                  j.jobDescription ||
                  'Not available'
                )}
              </span>

            </div>


            <div class="ref-box">

              Referred by:
              ${escapeHtml(
                f.referred_by ||
                'Not specified'
              )}

              <br>

              Reference phone:
              ${escapeHtml(
                f.reference_Phoneno ||
                'Not specified'
              )}

            </div>

          </div>

        </aside>

      </div>
    `;

  } catch (err) {

    el.innerHTML = `
      <div class="empty-state">

        <h3>
          Unable to open profile
        </h3>

        <p>
          ${escapeHtml(err.message)}
        </p>

      </div>
    `;
  }
}


function field(label, value) {

  return `
    <div class="profile-field">

      <b>
        ${escapeHtml(label)}
      </b>

      <span>
        ${escapeHtml(value || '-')}
      </span>

    </div>
  `;
}


// ============================================================
// COMPANY DIRECTORY
// ============================================================

async function loadCompanies() {

  const grid =
    $('companyGrid');

  grid.innerHTML =
    '<div class="loading">Loading company directory…</div>';


  try {

    const res =
      await apiFetch(
        `${API}/api/companies`
      );

    const data =
      await res.json();


    if (!res.ok) {

      throw new Error(
        data.error ||
        'Could not load companies.'
      );
    }


    $('companyResultCount').textContent =
      `${data.companies.length} compan${
        data.companies.length === 1
          ? 'y'
          : 'ies'
      }`;


    if (!data.companies.length) {

      grid.innerHTML = `

        <div class="empty-state">

          <div class="empty-icon">
            ▦
          </div>

          <h3>
            No companies yet
          </h3>

          <p>
            Companies will appear here
            when candidates are added
            with job details.
          </p>

        </div>

      `;

      return;
    }


    grid.innerHTML = '';


    data.companies.forEach(
      c => {

        const card =
          document.createElement(
            'button'
          );

        card.className =
          'company-card';


        card.innerHTML = `

          <div class="company-mark">
            ${escapeHtml(
              initials(c.name).slice(0, 2)
            )}
          </div>

          <div class="company-card-body">

            <div class="company-card-top">

              <h3>
                ${escapeHtml(c.name)}
              </h3>

              <span>
                →
              </span>

            </div>

            <p>
              ${c.roleCount}
              role${c.roleCount === 1 ? '' : 's'}
              tracked
            </p>

            <div class="company-card-bottom">

              <strong>
                ${c.applicantCount}
              </strong>

              <span>
                candidate${
                  c.applicantCount === 1
                    ? ''
                    : 's'
                }
              </span>

            </div>

          </div>
        `;


        card.addEventListener(
          'click',
          () => {

            $('searchInput').value =
              c.name;

            switchTab('watch');

            runSearch();
          }
        );


        grid.appendChild(card);
      }
    );

  } catch (err) {

    grid.innerHTML = `

      <div class="empty-state">

        <h3>
          Could not load companies
        </h3>

        <p>
          ${escapeHtml(
            err.message
          )}
        </p>

      </div>

    `;
  }
}


// ============================================================
// ROLE DIRECTORY
// ============================================================

async function loadRoles() {

  const grid =
    $('roleGrid');

  grid.innerHTML =
    '<div class="loading">Loading role directory…</div>';


  try {

    const res =
      await apiFetch(
        `${API}/api/roles`
      );

    const data =
      await res.json();


    if (!res.ok) {

      throw new Error(
        data.error ||
        'Could not load roles.'
      );
    }


    $('roleResultCount').textContent =
      `${data.roles.length} tracked role${
        data.roles.length === 1
          ? ''
          : 's'
      }`;


    if (!data.roles.length) {

      grid.innerHTML = `

        <div class="empty-state">

          <div class="empty-icon">
            ◈
          </div>

          <h3>
            No roles yet
          </h3>

          <p>
            Roles will appear here
            when a job description is
            attached to a candidate.
          </p>

        </div>

      `;

      return;
    }


    grid.innerHTML = '';


    data.roles.forEach(
      r => {

        /*
         * IMPORTANT:
         *
         * The heading is now taken directly
         * from the Role field stored in the database.
         *
         * Previously it was generated from the
         * Job Description.
         */

        const title =
          String(
            r.role ||
            'Role not specified'
          )
            .trim() ||
          'Role not specified';


        const card =
          document.createElement(
            'button'
          );

        card.className =
          'role-card';


        card.innerHTML = `

          <div class="role-card-top">

            <span class="role-badge">
              ROLE
            </span>

            <span class="role-count">
              ${r.applicantCount}
              applicant${
                r.applicantCount === 1
                  ? ''
                  : 's'
              }
            </span>

          </div>


          <!-- ROLE FIELD IS THE MAIN HEADING -->

          <h3>
            ${escapeHtml(title)}
          </h3>


          <p class="role-company">

            ${escapeHtml(
              r.companyName ||
              'Company not specified'
            )}

          </p>


          <p class="role-description">

            ${escapeHtml(
              r.jobDescription ||
              'No job description available'
            )}

          </p>


          <div class="role-footer">

            <span>

              HR:
              ${escapeHtml(
                r.hrDetails ||
                'Not specified'
              )}

            </span>

            <span>
              View candidates →
            </span>

          </div>

        `;


        /*
         * Clicking a role opens the candidate
         * search for that company.
         */

        card.addEventListener(
          'click',
          () => {

            $('searchInput').value =
              r.companyName || '';

            switchTab('watch');

            runSearch();
          }
        );


        grid.appendChild(card);
      }
    );

  } catch (err) {

    grid.innerHTML = `

      <div class="empty-state">

        <h3>
          Could not load roles
        </h3>

        <p>
          ${escapeHtml(
            err.message
          )}
        </p>

      </div>

    `;
  }
}


// ============================================================
// DASHBOARD STATISTICS
// ============================================================

async function loadStats() {

  if (!isAdmin()) return;


  try {

    const res =
      await apiFetch(
        `${API}/api/stats`
      );

    const d =
      await res.json();


    if (res.ok) {

      $('candidateCount').textContent =
        d.candidates;

      $('jobCount').textContent =
        d.jobs;

      $('companyCount').textContent =
        d.companies;
    }

  } catch (_) {

    // Ignore dashboard statistic errors
  }
}


// ============================================================
// INITIALIZE
// ============================================================

if (
  auth.token &&
  auth.role &&
  auth.username
) {

  showApp();

} else {

  $('loginScreen')
    .classList
    .remove('hidden');
}