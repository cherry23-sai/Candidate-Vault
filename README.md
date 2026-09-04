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

## 1. Google Cloud setup (one-time)

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a project (or use an existing one).
2. Enable the **Google Drive API** for that project (APIs & Services → Library).
3. Go to **APIs & Services → OAuth consent screen**, set it to "External" (or
   "Internal" if you have a Workspace org), and add yourself as a test user.
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/oauth2callback`
5. Copy the generated **Client ID** and **Client Secret**.

## 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` and paste in your Client ID / Client Secret:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
PORT=3000
```

## 3. Install and run

```bash
cd backend
npm install
npm start
```

## 4. Connect your Google account (one-time)

Open **http://localhost:3000/auth** in your browser, sign in, and approve access.
You'll see "Google Drive connected." — that's it, a `token.json` is saved locally
so you won't need to sign in again.

## 5. Use the app

Open **http://localhost:3000** — you'll see the Upload / Watch / View buttons.

A folder called **CandidateVault** will appear in your Google Drive; every resume
you upload lands there with its parsed fields attached.

---

## Notes

- **Fields are matched flexibly**: labels like `Mobile no`, `Email  I'd`, and
  `Reffered by` are recognized even with the typos/spacing shown in your sample —
  see `backend/parser.js` if you want to add more label variants.
- **Resume preview**: uploaded PDFs are set to "anyone with the link can view" so
  they can be embedded on the View tab. If you'd rather keep them fully private,
  remove the `drive.permissions.create(...)` call in `backend/driveService.js` —
  you'll then only be able to open resumes while signed into the connected
  Google account.
- **Reusing this for Flutter**: the backend exposes three plain REST endpoints —
  `POST /api/upload`, `GET /api/search?q=...`, `GET /api/profile/:fileId` — so a
  Flutter app can call the same server instead of talking to Drive directly. Once
  you're happy with the web version, say the word and I'll build the Flutter
  client on top of this same API.
