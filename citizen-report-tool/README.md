# Citizen Report Tool

A React app (Vite) deployed on Vercel that collects behavioral and acoustic
data from citizens witnessing bridge noise events, storing structured reports
in **Supabase** (Postgres + Storage).

## What this is

Citizens submit free-form report data (annoyance rating, activity
interrupted, perceived direction — shape owned by the form, not the backend)
plus an optional recorded media clip, via a web form. Each report is
validated server-side, assigned a UUID and schema version, then written to
Supabase: metadata to the `reports` table, media files to the `report-media`
storage bucket.

**Media uploads go directly from the browser to Supabase Storage**, not
through a Vercel function: the client requests a short-lived signed upload
URL from `POST /api/upload-url`, uploads the file straight to Supabase, then
only sends the resulting storage *path* (not the file bytes) to
`POST /api/report`. This sidesteps Vercel's request body size (~4.5MB) and
execution time limits, so it works the same way for a 10s audio clip as it
will for images or longer video later.

**Reports are tied to an identity via Supabase Anonymous Auth** — on first
visit the browser silently gets a persistent identity, no login screen, no
email required. Each report is stamped with that `user_id`, so "My reports"
(replay media, delete) persists across reloads and browser restarts on that
device. It does not follow the user to a different device/browser, and if
they clear site data they lose access to past reports with no self-serve
recovery — that's the deliberate cost of zero-friction first use.

**Optional backup email:** a banner in the UI (`BackupEmail.jsx`) lets a user
link an email to their anonymous identity (`supabase.auth.updateUser`), and
shows whether one is confirmed. This is opt-in, not a gate — the app works
fully without it. There's no self-serve "sign in on a new device" flow yet:
if `VITE_SUPPORT_EMAIL` is set, a user with a confirmed email is told to
email that address from it, and recovery is manual — you look them up by
email in the Supabase dashboard (Authentication → Users) and send them a
fresh sign-in link yourself.

**Supabase is the current source of truth**, queried directly by this repo's
aggregation scripts/dashboards later, or exported as needed.

**Box (dormant):** the app was originally built against Box as the storage
backend (`lib/box-client.js`, `api/*` calling it). That code is untouched and
still present — the app was switched to Supabase only because Box app
authorization (enterprise admin approval / CCG scopes) is still pending. Once
that's resolved, backends can be swapped back by changing the imports in
`api/report.js` and `api/health.js`.

## Setup

**Prerequisites:**
- Node.js 18+
- A Supabase project (free tier is fine)

**1. Create the database table and storage bucket**

In the Supabase SQL editor, run [`supabase/schema.sql`](./supabase/schema.sql).
It creates the `reports` table (with a `user_id` owner column + RLS policies)
and a private `report-media` storage bucket.

**2. Enable Anonymous sign-ins**

Supabase dashboard → Authentication → Sign In / Providers → enable
**"Allow anonymous sign-ins"** (off by default). The app works with just
this — no email provider, no SMTP, no redirect URLs required.

**Only if you want the optional backup-email feature to actually deliver
mail**, also add the app's origin(s) to Authentication → URL Configuration →
Redirect URLs (e.g. your deployed URL and a fixed local dev URL), and either
rely on Supabase's built-in email sender (low volume, rate-limited — fine
for testing) or configure custom SMTP under Auth → Settings for real usage.
Since linking an email is opt-in rather than gating every visit, volume is
much lower than the earlier mandatory-magic-link approach would have been.

**3. Environment variables**

Copy `.env.example` to `.env.local` and fill in, from Project Settings → API:

```bash
# Server-side only
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Exposed to the browser bundle (safe — see .env.example for why)
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>

# Optional — shown to users with a confirmed backup email as where to write
# for manual account recovery. Omit to hide that line.
VITE_SUPPORT_EMAIL=you@yourdomain.com
```

Never commit `.env.local`, and never put real secret values in `vercel.json`
— that file is committed to the repo and should only list env var *names*.
For deployment, add the real values in the Vercel project's dashboard under
Settings → Environment Variables (all four — the `VITE_*` ones must be
present at **build** time, not just runtime).

**4. Install & run locally**

```bash
cd citizen-report-tool
npm install
vercel dev
```

(Plain `vite`/`npm run dev` only serves the frontend — the `/api/*` routes
need Vercel's dev server or a deployed instance to run.)

## API endpoints

All endpoints except `GET /api/health` require `Authorization: Bearer <supabase-access-token>`
(the signed-in user's session token, obtained client-side via `useAuth()`).

### `POST /api/upload-url`

Requests a short-lived signed URL for a direct browser → Supabase Storage
upload.

**Request body:** `{ "content_type": "audio/webm", "kind": "audio" }`
(`kind` is one of `audio`, `image`, `video`)

**Response (200 OK):**
```json
{ "path": "2026-09-14/audio/<uuid>.webm", "token": "...", "bucket": "report-media", "signedUrl": "..." }
```

The client then uploads directly to Supabase using this `path`/`token` (see
`src/lib/uploadMedia.js`), and passes only the `path` along in the report.

### `POST /api/report`

Submit a new citizen report.

**Request body:**
```json
{
  "timestamp": "2026-09-14T15:30:00Z",
  "location": { "lat": 40.706, "lon": -73.977 },
  "report_data": {
    "annoyance": 7,
    "activity_interrupted": "work",
    "perceived_direction": "north",
    "sound_character": ["screech_squeal", "clatter_bang"],
    "duration_pattern": "few_seconds",
    "recurring": "frequent_daily",
    "felt_vibration": true,
    "windows_open": true,
    "behavioral_response": ["covered_ears"],
    "notes": null
  },
  "media": [
    { "path": "2026-09-14/audio/<uuid>.webm", "mime_type": "audio/webm", "kind": "audio", "duration_sec": 8.2 }
  ],
  "spectral": null,
  "device": "Mozilla/5.0 ..."
}
```

- `timestamp`: ISO 8601 UTC. Required.
- `location.lat`, `location.lon`: WGS84 coords. Required.
- `report_data`: free-form JSON object. Required, shape not enforced server-side
  — see the current field set below, but it can evolve without a schema migration.
- `media`: array of `{ path, mime_type, kind, duration_sec? }`, `kind` ∈ `audio`/`image`/`video`,
  referencing files already uploaded via `/api/upload-url`. Optional.
- `spectral`: object with `thirds` array (Phase 3). Optional.
- `device`: string. Optional.

**`report_data` field reference** (shape owned by the form, not enforced by the
schema — grounded in a gap this repo identified: NYC 311 and the NYC Noise
Code have no category for rail/subway noise at all, so residents can't file
a complaint that names what they're hearing):

| Field | Values | Why |
|---|---|---|
| `annoyance` | 0–10 | Standard community-noise annoyance scale (WHO/ICBEN-aligned) |
| `activity_interrupted` | sleep / work / conversation / relaxation / other / none | What the noise cost the person, not just its loudness |
| `perceived_direction` | north / south / east / west / unknown | Rough source localization |
| `sound_character` | screech_squeal / rumble_hum / clatter_bang / horn_whistle / brakes / other (multi-select) | Fills the missing rail-noise taxonomy — spectral "shape" official channels don't capture |
| `duration_pattern` | sudden_burst / few_seconds / sustained / continuous | Event envelope — never published by MTA |
| `recurring` | first_time / occasional / frequent_daily / constant | Perceived frequency/headway, since perceived and measured headway diverge 2–3x |
| `felt_vibration` | boolean | Bridge structure re-radiates noise as vibration — a channel no audio recording captures |
| `windows_open` | boolean | Context for sleep-disruption reports, esp. summer |
| `behavioral_response` | covered_ears / left_area / closed_windows (multi-select) | Distress proxy independent of self-reported annoyance |
| `notes` | free text | Open-ended context (track, train appearance, anything unusual) |

**Response (201 Created):**
```json
{ "id": "<uuid>", "schema_v": 1, "timestamp": "2026-09-14T15:30:00Z" }
```

### `DELETE /api/report?id=<uuid>`

Deletes a report and its associated media files, after confirming it belongs
to the authenticated user. Returns `404` if the report doesn't exist or isn't
owned by the caller (same response either way, to avoid leaking existence).

**Response (200 OK):** `{ "id": "<uuid>", "deleted": true }`

### `GET /api/reports`

Lists the authenticated user's own reports, newest first. Each `media` item
is enriched with a short-lived signed `url` for playback (the bucket is
private, so URLs expire after an hour).

**Response (200 OK):**
```json
{ "reports": [ { "id": "...", "report_data": {...}, "media": [{ "path": "...", "kind": "audio", "url": "https://..." }], ... } ] }
```

### `GET /api/health`

Confirms the Supabase connection. No side effects, no auth required.

## Verification

```bash
node verify_api.js
```

Always checks `GET /api/health`. The authenticated tests (create/validate/delete
a report) only run if `ACCESS_TOKEN` is set — sign in once via the browser and
copy the access token out of devtools (see the comment at the top of
`verify_api.js`). Requires `vercel dev` running (or `API_BASE_URL` pointed at
a deployed instance).

## Project structure

```
.
├── README.md
├── package.json
├── vercel.json                 # serverless function config (env var names only)
├── .env.example
├── .gitignore
├── supabase/
│   └── schema.sql              # run once in Supabase SQL editor
├── api/
│   ├── report.js                # POST create / DELETE — auth required
│   ├── reports.js                # GET — list caller's own reports + signed playback URLs
│   ├── upload-url.js            # POST — issues signed Storage upload URLs, auth required
│   └── health.js                # GET — Supabase connectivity check, no auth
├── lib/
│   ├── supabase-client.js      # active backend
│   ├── require-user.js         # verifies Authorization: Bearer <token> on API routes
│   ├── env.js                  # loads .env.local explicitly (vercel dev doesn't reliably inject it)
│   ├── box-client.js           # dormant — kept for later
│   └── report-schema.js        # payload validation (backend-agnostic)
├── src/
│   ├── App.jsx                 # tab shell: New report / My reports
│   ├── components/
│   │   ├── BackupEmail.jsx      # optional email-linking banner + status
│   │   ├── ReportForm.jsx
│   │   └── ReportsList.jsx      # fetches from /api/reports, media playback, delete
│   ├── hooks/
│   │   ├── useAuth.js           # anonymous sign-in on first visit, session state, linkEmail()
│   │   ├── useGeolocation.js
│   │   └── useAudioRecorder.js
│   ├── lib/
│   │   ├── supabaseClient.js   # browser Supabase client (anon key)
│   │   └── uploadMedia.js      # requests signed URL, uploads direct to Storage
│   ├── main.jsx
│   └── index.css
├── index.html
└── verify_api.js
```

## Phase roadmap

**Phase 1:** Backend auth + write/health endpoints (originally Box, now Supabase)
**Phase 2 (current):** React form UI — annoyance/activity/direction, geolocation, direct-to-Storage media upload (audio, photo, video), anonymous device-persistent auth, "My reports" backed by the database (replay media, delete)
**Phase 3:** On-device spectral decomposition (Web Audio API FFT → 1/3-octave bands), populating the `spectral` field
**Phase 4:** Read & aggregate endpoint, dashboards
