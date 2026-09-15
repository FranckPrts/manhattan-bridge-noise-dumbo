# Implementation Notes

Design decisions and history. See `README.md` for setup/API reference.

## Current state (Phase 1 + 2 complete)

- **Backend:** Supabase (Postgres + Storage + Auth), not Box. Box integration
  (`lib/box-client.js`) is untouched but dormant — the app switched to
  Supabase because Box app authorization is still pending; swapping back is a
  one-line import change in `api/report.js`/`api/health.js`.
- **Auth:** Supabase Anonymous Auth — silent, no login screen, no email
  required. Each report is stamped with `user_id`. Users can optionally link
  a backup email (`BackupEmail.jsx` + `useAuth().linkEmail`) for manual
  recovery (you look them up by email in the Supabase dashboard and send a
  fresh sign-in link — no self-serve cross-device recovery yet).
- **Media:** audio (mic recording, 128kbps — 48kbps distorts spectral
  content), photo, and video upload **directly from the browser to Supabase
  Storage** via a signed URL (`POST /api/upload-url`), never through the
  Vercel function. Sidesteps Vercel's ~4.5MB body limit and execution time
  limit — same path will scale to longer video without further changes.
- **Report shape:** `report_data` is a free-form JSONB column, not fixed
  columns — the current questionnaire (annoyance, sound character, duration
  pattern, recurrence, vibration, windows open, behavioral response, notes)
  can evolve without a schema migration. Fields were chosen to fill a gap
  this repo's own research identified: NYC 311 and the NYC Noise Code have no
  category for rail/subway noise at all.
- **My reports:** compact one-row-per-report list (`ReportsList.jsx`) with a
  "Preview" toggle that expands to show media playback (signed, private URLs)
  and a delete button. Delete removes both the DB row and its storage files,
  after verifying ownership server-side.

## Key gotchas hit during development

- **`vercel.json`'s `env` field must be an object, not an array of names** —
  the array form silently breaks `vercel dev`'s port detection (manifested as
  "Detecting port ... timed out" and the dev server never opening its proxy
  port). Fixed by removing `env` from `vercel.json` entirely.
- **`vercel dev` didn't reliably inject `.env.local`** into the function
  runtime in this setup — `lib/env.js` loads it explicitly via `dotenv`
  (no-op in real deployments, where the file doesn't exist and Vercel injects
  real env vars natively).
- **Supabase's newer key naming** (`SUPABASE_SECRET_KEY`/`SUPABASE_PUBLISHABLE_KEY`)
  differs from the legacy `SUPABASE_SERVICE_ROLE_KEY`/anon key names —
  `lib/supabase-client.js` accepts either.
- **`vite --port $PORT --strictPort`** is required in `vercel.json`'s
  `devCommand` — plain `vite` ignores the port Vercel expects it on and the
  dev proxy times out waiting for it.

## Known limitations

- No spectral analysis yet (Phase 3) — `spectral` column exists, unused.
- No cross-device account recovery — anonymous identity is device-local;
  losing browser data loses report access unless a backup email was
  confirmed *and* you manually intervene.
- No read/aggregate endpoint for external tooling yet (Phase 4) — reports
  live only in Supabase, queried directly via the dashboard/SQL for now.

## Phase roadmap

**Phase 3:** On-device spectral decomposition (Web Audio API FFT → 1/3-octave
bands), populating the `spectral` field.
**Phase 4:** Read & aggregate endpoint, dashboards, self-serve cross-device
recovery if backup email is confirmed.
