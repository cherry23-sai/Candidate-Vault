const API = ''; // frontend is served by the same backend, so relative paths work

// ---- Tab switching ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// ---- Upload ----
document.getElementById('uploadBtn').addEventListener('click', async () => {
  const text = document.getElementById('candidateText').value;
  const file = document.getElementById('resumeFile').files[0];
  const statusEl = document.getElementById('uploadStatus');

  if (!text.trim() || !file) {
    statusEl.textContent = 'Please paste the candidate details and attach a PDF.';
    statusEl.className = 'status error';
    return;
  }

  const formData = new FormData();
  formData.append('text', text);
  formData.append('resume', file);

  statusEl.textContent = 'Uploading...';
  statusEl.className = 'status';

  try {
    const res = await fetch(`${API}/api/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    statusEl.textContent = `Saved: ${data.fields.name}`;
    statusEl.className = 'status success';
    document.getElementById('candidateText').value = '';
    document.getElementById('resumeFile').value = '';
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'status error';
  }
});

// ---- Watch / search ----
document.getElementById('searchBtn').addEventListener('click', runSearch);
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') runSearch();
});

async function runSearch() {
  const q = document.getElementById('searchInput').value.trim();
  const grid = document.getElementById('searchResults');
  grid.innerHTML = 'Searching...';

  try {
    const res = await fetch(`${API}/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    grid.innerHTML = '';

    if (!data.results.length) {
      grid.innerHTML = '<p class="hint">No matching candidates.</p>';
      return;
    }

    data.results.forEach(r => {
      const card = document.createElement('div');
      card.className = 'candidate-card';
      card.innerHTML = `
        <h3>${r.name || 'Unknown'}</h3>
        <p><b>Skills:</b> ${r.skills || '-'}</p>
        <p><b>Location:</b> ${r.current_location || '-'}</p>
        <p><b>Total exp:</b> ${r.total_exp || '-'}</p>
        <button data-id="${r.fileId}">View profile</button>
      `;
      card.querySelector('button').addEventListener('click', () => openProfile(r.fileId));
      grid.appendChild(card);
    });
  } catch (err) {
    grid.innerHTML = `<p class="status error">${err.message}</p>`;
  }
}

// ---- View ----
async function openProfile(fileId) {
  document.querySelector('.tab-btn[data-tab="view"]').click();
  const el = document.getElementById('viewContent');
  el.innerHTML = 'Loading...';

  try {
    const res = await fetch(`${API}/api/profile/${fileId}`);
    const data = await res.json();
    const f = data.fields || {};

    el.innerHTML = `
      <div class="resume-frame">
        <a href="${data.resumeEmbedLink}" download="Resume.pdf" class="download-btn">
            📥 Download Resume
        </a>
        <iframe src="${data.resumeEmbedLink}"></iframe>
      </div>
      <div class="profile-side">
        <h3>${f.name || 'Unknown'}</h3>
        <div class="field"><b>Skills</b>${f.skills || '-'}</div>
        <div class="field"><b>Mobile</b>${f.mobile || '-'}</div>
        <div class="field"><b>Email</b>${f.email || '-'}</div>
        <div class="field"><b>Current location</b>${f.current_location || '-'}</div>
        <div class="field"><b>Preferred location</b>${f.preferred_location || '-'}</div>
        <div class="field"><b>Current company</b>${f.current_company || '-'}</div>
        <div class="field"><b>Total exp</b>${f.total_exp || '-'}</div>
        <div class="field"><b>Relevant exp</b>${f.rel_exp || '-'}</div>
        <div class="field"><b>Notice period</b>${f.notice_period || '-'}</div>
        <div class="field"><b>Current CTC</b>${f.current_ctc || '-'}</div>
        <div class="field"><b>Expected CTC</b>${f.exp_ctc || '-'}</div>
        <div class="referred-badge">Referred by: ${f.referred_by || 'Not specified'}</div>
        <div class="referred-badge"><b>Reference Phone No: </b>${f.reference_Phoneno || 'Not specified'}</div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="status error">${err.message}</p>`;
  }
}
