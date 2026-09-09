# Candidate Vault

A recruiter tool with three buttons — **Upload**, **Watch**, **View** — all on one page.

- **Upload**: paste candidate details as free text + attach their resume PDF. The
  backend auto-detects `Name`, `Skills`, `Mobile no`, `Email Id`, `Current location`,
  `Preferred location`, `Current company`, `Total exp`, `Rel exp`, `Notice period`,
  `Current ctc`, `Exp ctc`, and `Reffered by` from the pasted text — there is no manual
  form. The resume PDF is stored in your Google Drive, with the detected fields
  attached to it as metadata (this *is* the database — no separate DB server needed).
- **Watch**: search across all fields (skills, location, company, etc.) and see
  matching candidate cards.
- **View**: opens a candidate's resume inline, with all details and "Referred by"
  shown alongside it.

This is **private to you** — it only ever reads/writes the Google account you
connect it to.

---



## 2. Configure the backend

```bash
cd backend
cp .env.example .env
```



## 3. Install and run

```bash
cd backend
npm install
npm start
```

