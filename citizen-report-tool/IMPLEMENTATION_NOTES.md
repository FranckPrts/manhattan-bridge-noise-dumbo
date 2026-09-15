# Implementation Notes

Design decisions and history. See `README.md` for setup/API reference.

## Spectral analysis (Phase 3)

Computed entirely client-side, right after recording stops
(`src/lib/spectralAnalysis.js`, wired into `ReportForm.jsx`), and stored in
the existing `reports.spectral` jsonb column — no schema change was needed.

**Method: filter-bank + envelope-follower, not FFT/STFT.** A 1/3-octave
scheme built by binning FFT bins has a real resolution problem at low
frequencies (a 4096-sample FFT at 48kHz has ~11.7Hz bins — barely resolves a
25Hz band). Real sound level meters (IEC 61260) use a bank of bandpass
filters instead. This is built entirely from native Web Audio nodes — no
FFT math, no new dependency: per band, `OfflineAudioContext` runs
bandpass (`BiquadFilterNode`) → full-wave rectify (`WaveShaperNode`, curve
`x → |x|`) → lowpass smoothing tuned to a 125ms time constant (FAST
weighting, per IEC 61672 and this repo's own `FIELD-CAPTURE-PROTOCOL.md`
reference to the same concept). Bands render in chunks of ≤32 (Web Audio
caps `OfflineAudioContext`/`ChannelMergerNode` channel counts at 32 per
spec — with ~119 bands at 1/12-octave, one multi-channel pass isn't
possible; a first version tried anyway and silently produced an empty
`spectral` column in production, since the construction threw and the
caller's catch swallowed it before submission). Broadband (unfiltered,
used for baseline/event detection) renders as a separate single-channel
pass.

**Band resolution: 1/12-octave (~90-120 bands), generated from the standard
fractional-octave formula** (`fc = 1000 * 2^(i/N)`), not a hardcoded table —
`N=3` reproduces the textbook 1/3-octave series exactly (verified: 24.8,
31.3, 39.4, 49.6, 62.5... match the known *exact* — not preferred-rounded —
ANSI S1.11 values), so bumping resolution further (`N=24`) is a one-constant
change. True linear/uniform-Hz bands were considered and rejected: at 48kHz,
1Hz resolution needs ~1s analysis windows, which would collapse a pass-by's
temporal envelope into one or two static spectra — the opposite of what
this phase is for (time-frequency resolution trade off against each other).

**Baseline vs. event, EEG-style.** The quietest contiguous segment within
the same clip (auto-detected from a broadband envelope — there's no separate
ambient-only recording step in the UI, a real limitation) is averaged into a
baseline reference per band. This plays the same statistical role as Welch's
method (variance reduction via averaging) but operates on the
already-smoothed envelope domain, not by averaging FFT periodograms — named
`"envelope_mean"` in the stored data rather than borrowing "Welch" for a
mechanistically different technique. Event onset/offset is then a threshold
crossing relative to *baseline mean + 6dB*, sustained ≥300ms — reported as
a delta from baseline, not a raw absolute number.

**Not calibrated SPL.** Phone mic sensitivity is uncalibrated, so every
level is relative dBFS. The stored record says so explicitly
(`"calibrated": false`) — this matters if report data is ever compared
against FTA/CEQR absolute-dB thresholds later, where conflating the two
would be a real error, not just an approximation.

**Storage format is deliberately plain and self-describing** — every record
embeds its own parameters (band centers, time constant, baseline/event
thresholds) so it's reproducible by reading the data, not this app's source.
The original audio clip stays in Storage unchanged, so this JSON is a
derived, versioned cache (`"schema": "spectral_v1"`) — a different analysis
method can always be re-run from the source audio later without being
blocked by this choice. Plain JSONB in Postgres, queryable from any tool
with zero dependency on this app's JS.

Scope: audio only (not video's embedded track), computed synchronously in
the browser — fast enough for a ≤10s clip that a brief "Analyzing sound…"
state is enough UI. Rendered as a canvas heatmap in "My reports" → Preview
(`SpectrogramView.jsx`).

## Live event marking + vertical annotation (Phase 3.5)

Built in two iterations. The first shipped a single "🚂 Mark train pass"
tap button plus a horizontal live spectrogram. Real-world use of that
surfaced the actual problem: identifying *what* a sound was while it's
happening, on a phone, under time pressure, is a much harder task than just
noticing "that was loud." It was reworked around **capture-then-categorize**
instead: recording only asks the citizen to notice loud moments; naming
what they were happens afterward, calmly, once the clip has stopped.

**Press-and-hold capture, not a tap-to-mark button.** One button —
"🔊 Hold while it's loud" — during recording. `useAudioRecorder.js`'s
`markStart()`/`markEnd()` (Pointer Events, `setPointerCapture` on press so a
release is still caught even if a finger drags off the button mid-hold, a
real touchscreen failure mode) record elapsed time off the same
`startTimeRef` already used for `duration`. A quick tap and a long hold
produce the same shape, `{start_sec, end_sec, type: null}` — a range, not a
point; "point vs. range" is just how short the range is, so there's no
separate point/range code path. `pendingElapsedSec` ticks live at 100ms
while held, driving the "Holding… 1.3s" readout.

**Categorization happens after, in `EventAnnotator.jsx`.** Once analysis
finishes, every captured range becomes a card: time range, a peak-level bar
for that window (max of `spectral.levels_dbfs` across bands within
`[start_sec, end_sec]` — reuses already-computed frame data, no new DSP),
and a row of category tiles (`EVENT_TYPES` in `reportFields.js`: train
passing, horn/whistle, screech/brakes, siren, construction, other) — plus a
delete button, for a hold triggered by something that wasn't actually the
target sound. `EVENT_TYPES` is deliberately separate from
`SOUND_CHARACTERS`: the latter describes the whole clip's acoustic quality
(one answer per report), this is a per-event source/cause tag (one answer
per captured moment).

**Vertical, everywhere — not just this screen.** `SpectrogramView.jsx` was
rewritten to draw time top-to-bottom, frequency across the width (axes
swapped from the original horizontal version), for every place it's used —
the annotator's compact spine, and the saved-report review in
`ReportDetailPanel.jsx` — because a phone is tall, not wide, generally, not
only during annotation. `LiveSpectrogram.jsx` was rotated the same way
(rows drawn at the bottom, scrolling up), keeping the live and saved views
visually consistent. Losing the click-to-add/remove-marker interaction the
first iteration had on the heatmap was an acceptable trade: nothing creates
events by tapping the canvas anymore, that's what the hold-button is for,
so the heatmap could go back to being a read-only visualization.

**Layout: a hybrid spine + card list**, chosen over two simpler
alternatives after comparing mockups — a fully rotated heatmap alone (loses
readability of ~90-120 frequency bands squeezed into a ~140px-wide column,
with nowhere to put the categorization UI) and a plain event list with no
heatmap at all (loses the at-a-glance "where does this moment sit in the
clip" context). The compact spine and the card list share one scroll
container in `EventAnnotator.jsx`, so they stay aligned without separate
scroll-sync code.

**Data model:** `report_data.marked_events: [{ start_sec, end_sec, type }]`
— replaces the first iteration's `manual_markers: [seconds]` outright, not
additively. No migration: `report_data` is free-form JSONB
(`lib/report-schema.js` checks only `typeof === 'object'`), and this
shipped the session before, so there was no real data in the old shape
worth preserving. Still shares `spectral.frame_times_sec`'s time base
(seconds since recording start).

**Barycenter anchor.** A held-down range can start slightly early or run
slightly long relative to the actual sound — the raw `start_sec`/`end_sec`
the citizen happened to press don't necessarily mark where the sound really
was loudest. `eventWindowStats()` (`spectralAnalysis.js`) computes an
energy-weighted mean time within the window (`barycenter_sec`, weighted by
each frame's peak-across-bands level converted to linear power — the same
frame data already computed, no new DSP pass), shown as a small dot on
`SpectrogramView.jsx`'s spine, connected to the event's colored stripe by a
short line, and as "Loudest around Xs" text on the event card for ranges
long enough for the distinction to matter. One function, imported by both
`SpectrogramView.jsx` (the dot) and `EventAnnotator.jsx` (the card text and
the peak-level bar), so the two can never disagree about the same event.

**Click to extend, shrink, or replay.** The compact spine takes clicks when
`onEventsChange`/`onSeek` are supplied (only in `EventAnnotator.jsx` — the
saved-report view in `ReportDetailPanel.jsx` passes neither, staying
read-only). `nearestEdge()` finds the event whose *nearer edge* (not nearer
interval — a click deep inside a long event, far from both edges, is left
alone) is closest to the click; if that distance is within
`EXTEND_THRESHOLD_PX` (14 **displayed** pixels, converted to seconds via
the canvas's actual on-screen height — an absolute pixel budget, not a
fraction of clip duration, so it stays a comfortable tap target whether the
clip is 5s or the full 60s) that edge is moved to the click point. One
formula handles both directions: clicking outside the event stretches it,
clicking inside it shrinks it — same code path, no inside/outside
branching. Every click also seeks the `<audio>` element (via a ref lifted
to `ReportForm.jsx` and passed down as `onSeek`) to that exact time and
plays it, so a citizen can listen to precisely the moment they're about to
categorize rather than judging from the heatmap colors alone. Each event
card also has an explicit ▶ button (seeks to `start_sec`) as an
unambiguous alternative to clicking the spine.

**Overlapping events get lanes, not overdraws.** `assignLanes()` — greedy
interval-graph coloring, sort by `start_sec`, reuse the first lane whose
last event already ended — gives each event a lane index; overlapping
events render as side-by-side columns instead of one flattening the other,
so two citizen-marked moments that happened to overlap (e.g. a horn during
a train passing) both stay visible and independently editable. The gutter's
width is `laneCount * LANE_W`, so it only widens when an overlap actually
needs the room.

**Spine height scales with content, not fixed.** Previously a flat 280/320px
regardless of clip length or event count — with recording now up to a
minute (see below) and events able to pile up, a fixed height either
wasted space or crushed the time axis unreadably thin. Height is now
`max(base, durationSec × px-per-second, eventCount × ~card-height)` (the
last term only in `compact` mode, since that's the only place a card list
sits beside it) — a heuristic, not true pixel-perfect scroll-sync with the
card list, but it keeps the spine roughly as tall as what's next to it. The
canvas's `width`/`height` **attributes** (its actual pixel buffer) now vary
per render, so the CSS was changed from a hardcoded `aspect-ratio` (which
would silently go stale and distort the image the moment size became
dynamic) to `height: auto`, letting the browser derive displayed aspect
ratio from the live attributes instead.

**Recording extended to 60s**, from 10s (`MAX_DURATION_SEC` in
`useAudioRecorder.js`) — long enough to reliably catch a full pass, not
just its loudest instant. Two UI additions make the longer window legible
rather than anxiety-inducing: the pre-record hint states the time budget
up front ("You'll have 1 minute to record…"), and a live countdown
(`recordingElapsedSec`, ticking at 200ms via the same interval-ref pattern
as the existing hold-button's `pendingElapsedSec`) shows time remaining
during recording, both formatted through a small `formatDuration()` helper
in `ReportForm.jsx` (`"1 minute"` / `"0:42"` / `"8s"`) rather than a raw
seconds count.

## Admin dashboard

A separate, password-gated view at `/admin` — not a citizen feature, not
Supabase Auth. One shared operator secret (`ADMIN_PASSWORD`) via
`POST /api/admin/login`, which sets an HttpOnly HMAC-signed session cookie
(`lib/require-admin.js`, mirrors `lib/require-user.js`'s shape). Password
comparison and token verification both use `crypto.timingSafeEqual` over
fixed-length HMAC digests (a raw length check before comparing would leak
timing information about password length). `GET /api/admin/reports` is the
one endpoint behind it — service role, so it deliberately bypasses the RLS
that scopes citizens to their own reports (`lib/supabase-client.js`'s
`listAllReports`, admin-only, never exposed to citizen routes).

**Map: Leaflet + OpenStreetMap tiles + `leaflet.markercluster`, not
Mapbox/Google.** This repo's own `README.md` states an explicit policy —
*"Google Maps is deliberately not used... a picture traced off a
proprietary basemap is not a source, because nobody else can regenerate
it."* Every geospatial visual elsewhere in this repo
(`visual-review/noise-canyon.html`) is hand-drawn SVG from openly-fetched
geodata for exactly that reason. Leaflet + OSM is the only choice
consistent with that — open data, re-fetchable, no API key. Clicking a
cluster (`zoomToBoundsOnClick: false`, so it doesn't just auto-zoom) opens
a popover listing that cluster's reports, each expandable to the full
detail view via `ReportDetailPanel.jsx` — extracted from `ReportsList.jsx`
specifically so this reuse was possible without duplicating the
questionnaire-answer/spectrogram/media rendering.

**Charts: hand-rolled (CSS bars + canvas), not a charting library.** Checked
`usage/usage-dashboard.html` and `procurement/procurement-dashboard.html`
for precedent: no Chart.js/D3/Plotly anywhere in this repo — bar charts are
plain CSS width-percentage rows, more complex plots are hand-drawn canvas.
This app had already independently landed on the same pattern
(`SpectrogramView.jsx`). `EventHistograms.jsx` continues it (CSS bars);
`AnnoyanceScatter.jsx` is a small hand-drawn canvas scatter, same technique
as the spectrogram.

**No Python pipeline** — deferred by choice; everything here is client-side
JS reading one endpoint.

**Deferred, not forgotten: per-band energy distribution across reports.**
Comparing raw band levels across reports directly would be misleading —
each clip's event lands at a different point in its own timeline, and
levels are uncalibrated per-device. This needs an event-aligned sampling
mechanism first (treat each report's detected `event` window like an ERP
epoch, align clips to onset before aggregating across reports) — not built
yet. `AnnoyanceScatter.jsx` and `EventHistograms.jsx` sidestep this by using
each report's own single summary scalar (`peak_dbfs`, `event_duration_sec`)
rather than the full band matrix. `report_data.marked_events` (see
"Live event marking" above) is the intended anchor for this once built —
human-labeled, typed onsets are a better epoch reference than the
auto-detector's threshold crossing, and now carry a category to group by.

## Current state (Phase 1 + 2 + 3 complete)

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

- No separate ambient/baseline recording step — baseline is auto-detected
  as the quietest segment within the same clip, which fails if the whole
  clip is loud throughout (`baseline`/`event` are `null` in that case).
- Spectral levels are uncalibrated (relative dBFS), not measured SPL — not
  directly comparable to absolute-dB regulatory thresholds without a
  calibration step this app doesn't do.
- No cross-device account recovery — anonymous identity is device-local;
  losing browser data loses report access unless a backup email was
  confirmed *and* you manually intervene.
- No read/aggregate endpoint for external tooling yet (Phase 4) — reports
  live only in Supabase, queried directly via the dashboard/SQL for now.

## Phase roadmap

**Phase 4 (in progress):** Admin dashboard (map + clustering, raw data
table, event/recurrence histograms, annoyance-vs-level scatter,
geospatial-spectral overlay) is built. Still open: event-aligned per-band
distribution view (see above), self-serve cross-device recovery if backup
email is confirmed, and possibly a Python pipeline if the JS-only approach
turns out to be limiting. Possible later extension: compare captured
metrics (annoyance, event duration, band levels) against the
documentation/format requirements for lodging a formal noise complaint, once
that angle is researched.
