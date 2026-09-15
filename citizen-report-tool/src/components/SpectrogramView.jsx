import { useRef, useEffect } from 'react';
import { EVENT_TYPES } from '../lib/reportFields.js';
import { eventWindowStats } from '../lib/spectralAnalysis.js';

const DBFS_MIN = -80;
const DBFS_MAX = 0;

const HEATMAP_W = { compact: 24, full: 118 }; // fixed frequency-axis width; time-axis height is dynamic, see below
const LANE_W = 8; // width of one event "lane" — overlapping events get separate lanes instead of overdrawing each other
const ANCHOR_W = 12; // reserved column for the barycenter anchor dot + connecting line
const HEIGHT_BASE = { compact: 280, full: 320 };
const PX_PER_SEC = { compact: 5, full: 7 }; // keeps a 60s clip legible, not just a 10s one
const PX_PER_EVENT_CARD = 150; // rough EventAnnotator card height, so the spine grows to roughly match the card list beside it
const MIN_EVENT_DURATION_SEC = 0.1;
const EXTEND_THRESHOLD_PX = 14; // click-to-edge distance (in displayed pixels) that counts as "grab this edge"

const UNSET_COLOR = '#9ca3af';

const TYPE_COLORS = {
  train_passing: '#f59e0b',
  horn_whistle: '#8b5cf6',
  screech_brakes: '#ef4444',
  siren: '#3b82f6',
  construction: '#a16207',
  other: '#6b7280',
};

function levelToColor(dbfs) {
  const t = Math.min(1, Math.max(0, (dbfs - DBFS_MIN) / (DBFS_MAX - DBFS_MIN)));
  const hue = 240 * (1 - t); // blue (quiet) → red (loud)
  return `hsl(${hue}, 90%, ${20 + t * 40}%)`;
}

// Greedy interval-graph coloring: overlapping events land in different
// lanes (rendered as side-by-side columns) instead of one overdrawing
// another. Returns a lane index per event, in input order.
function assignLanes(events) {
  const order = events.map((ev, i) => ({ ...ev, i })).sort((a, b) => a.start_sec - b.start_sec);
  const laneEnds = [];
  const laneOf = new Array(events.length);
  order.forEach((ev) => {
    let lane = laneEnds.findIndex((end) => end <= ev.start_sec);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(ev.end_sec);
    } else {
      laneEnds[lane] = ev.end_sec;
    }
    laneOf[ev.i] = lane;
  });
  return { laneOf, laneCount: Math.max(1, laneEnds.length) };
}

// Distance (seconds) from a time to an event's nearer edge — used for both
// "grab and extend" (click outside the event, near an edge) and "grab and
// shrink" (click inside the event, near an edge): the same formula moves
// whichever edge is nearer to wherever was clicked, so there's no separate
// code path for growing vs. shrinking.
function nearestEdge(tSec, ev) {
  const dStart = Math.abs(tSec - ev.start_sec);
  const dEnd = Math.abs(tSec - ev.end_sec);
  return dStart <= dEnd ? { edge: 'start', dist: dStart } : { edge: 'end', dist: dEnd };
}

// Vertical heatmap: time flows top-to-bottom (phones are tall, not wide),
// frequency across the width, low frequency on the left. `events` (citizen-
// captured loud moments, each `{start_sec, end_sec, type}`) render as
// colored lane stripes — overlapping events get their own lane rather than
// overdrawing each other — plus a small dot at each event's energy-weighted
// barycenter (see `eventWindowStats` in spectralAnalysis.js) connected to
// its stripe by a short line, since the stripe alone can't show where
// within a longer hold the sound actually peaked.
//
// Height scales with both the clip's duration and (in `compact` mode) the
// event count, so the spine stays legible for up to a minute of audio and
// roughly matches the height of the event-card list beside it in
// EventAnnotator.jsx — a heuristic match, not pixel-perfect scroll-sync.
//
// Interactive only when `onEventsChange`/`onSeek` are passed (the
// annotation screen); omitted, it's read-only (saved-report review).
// Clicking near an existing event's edge grabs that edge and moves it to
// the click point — stretching the event if the click is outside it,
// shrinking it if the click is inside it. Every click also seeks/plays the
// clip from that time (`onSeek`), so a citizen can listen to exactly what
// they're about to tag.
export default function SpectrogramView({ data, events, onEventsChange, onSeek, compact }) {
  const canvasRef = useRef(null);
  const mode = compact ? 'compact' : 'full';
  const heatmapW = HEATMAP_W[mode];

  const durationSec = data?.frame_times_sec?.length
    ? data.frame_times_sec[data.frame_times_sec.length - 1]
    : 0;
  const eventList = events || [];
  const { laneOf, laneCount } = assignLanes(eventList);
  const gutterW = LANE_W * laneCount;
  const width = heatmapW + gutterW + ANCHOR_W;
  const height = Math.max(
    HEIGHT_BASE[mode],
    durationSec * PX_PER_SEC[mode],
    compact ? eventList.length * PX_PER_EVENT_CARD : 0
  );

  useEffect(() => {
    if (!data || !canvasRef.current) return;

    const { levels_dbfs: levels, band_centers_hz: bands, frame_times_sec: times, event } = data;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const frameCount = levels.length;
    const bandCount = bands.length;
    if (frameCount === 0 || bandCount === 0) return;

    const cellH = height / frameCount;
    const cellW = heatmapW / bandCount;

    for (let f = 0; f < frameCount; f++) {
      for (let b = 0; b < bandCount; b++) {
        ctx.fillStyle = levelToColor(levels[f][b]);
        const y = f * cellH;
        ctx.fillRect(b * cellW, y, cellW + 1, cellH + 1);
      }
    }

    const totalDuration = times[times.length - 1];

    if (event && times.length > 1) {
      const onsetY = (event.onset_sec / totalDuration) * height;
      const offsetY = (event.offset_sec / totalDuration) * height;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      [onsetY, offsetY].forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(heatmapW, y);
        ctx.stroke();
      });
    }

    if (eventList.length > 0 && totalDuration > 0) {
      eventList.forEach((ev, i) => {
        const y0 = (ev.start_sec / totalDuration) * height;
        const y1 = Math.max(y0 + 2, (ev.end_sec / totalDuration) * height);
        const color = (ev.type && TYPE_COLORS[ev.type]) || UNSET_COLOR;
        const laneX = heatmapW + laneOf[i] * LANE_W;

        ctx.fillStyle = color;
        ctx.fillRect(laneX, y0, LANE_W - 1, y1 - y0);

        const { barycenter_sec: barycenterSec } = eventWindowStats(data, ev.start_sec, ev.end_sec);
        const anchorY = (barycenterSec / totalDuration) * height;
        const gutterEdgeX = heatmapW + gutterW;
        const dotX = width - 3;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(gutterEdgeX, anchorY);
        ctx.lineTo(dotX, anchorY);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(dotX, anchorY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, [data, eventList, laneOf, width, height, heatmapW, gutterW]);

  const handleClick = (e) => {
    if (!data) return;
    const totalDuration = data.frame_times_sec[data.frame_times_sec.length - 1];
    if (!totalDuration) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const tSec = Math.min(totalDuration, Math.max(0, (y / rect.height) * totalDuration));
    const thresholdSec = (EXTEND_THRESHOLD_PX / rect.height) * totalDuration;

    if (onEventsChange && eventList.length > 0) {
      let best = null;
      eventList.forEach((ev, i) => {
        const info = nearestEdge(tSec, ev);
        if (!best || info.dist < best.dist) best = { i, ...info };
      });
      if (best && best.dist <= thresholdSec) {
        const ev = eventList[best.i];
        const patch =
          best.edge === 'start'
            ? { start_sec: Math.max(0, Math.min(tSec, ev.end_sec - MIN_EVENT_DURATION_SEC)) }
            : { end_sec: Math.min(totalDuration, Math.max(tSec, ev.start_sec + MIN_EVENT_DURATION_SEC)) };
        onEventsChange(eventList.map((e2, i) => (i === best.i ? { ...e2, ...patch } : e2)));
      }
    }

    onSeek?.(tSec);
  };

  if (!data) return null;

  const interactive = Boolean(onEventsChange || onSeek);

  return (
    <div className={`spectrogram${compact ? ' compact' : ''}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={interactive ? handleClick : undefined}
        className={interactive ? 'clickable' : undefined}
      />
      {!compact && (
        <p className="hint">
          {!data.calibrated && 'Uncalibrated, relative levels (dBFS), not SPL. '}
          Peak {data.summary.peak_dbfs.toFixed(1)} dBFS at {Math.round(data.summary.peak_band_hz)}Hz
          {data.summary.event_duration_sec != null && ` · Event ${data.summary.event_duration_sec.toFixed(1)}s`}
        </p>
      )}
      {!compact && eventList.length > 0 && (
        <ul className="spectrogram-legend">
          {eventList.map((ev, i) => {
            const type = EVENT_TYPES.find((t) => t.value === ev.type);
            return (
              <li key={i}>
                <span className="legend-swatch" style={{ background: (ev.type && TYPE_COLORS[ev.type]) || UNSET_COLOR }} />
                {ev.start_sec.toFixed(1)}–{ev.end_sec.toFixed(1)}s — {type ? `${type.icon} ${type.label}` : 'Not categorized'}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
