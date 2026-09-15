import { useRef, useEffect } from 'react';
import { EVENT_TYPES } from '../lib/reportFields.js';
import { eventWindowStats } from '../lib/spectralAnalysis.js';

const DBFS_MIN = -80;
const DBFS_MAX = 0;

const HEATMAP_H = { compact: 100, full: 140 }; // fixed frequency-axis height
const MARKER_MARGIN = 16; // bottom band reserved for event markers
const PX_PER_SEC = { compact: 30, full: 40 }; // time-axis resolution — generous, since width scrolls instead of compressing
const MIN_WIDTH = { compact: 240, full: 320 }; // floor so a very short clip doesn't render as a sliver
const MARKER_RADIUS = 4;
const MARKER_MIN_GAP_PX = 10; // minimum horizontal space between two markers' centers
const MARKER_HIT_RADIUS_PX = 16;
const TICK_ROW_H = 16;
const TICK_STEP_CANDIDATES_SEC = [0.5, 1, 2, 5, 10, 15, 30, 60];
const MIN_PX_PER_TICK = { compact: 40, full: 50 };

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

// Events close together in time could still land on nearly the same pixel
// column even with generous px/sec — this keeps their markers individually
// visible and tappable with a simple forward declutter pass (not a
// rescale): sort by position, push anything closer than MARKER_MIN_GAP_PX
// out from its left neighbor.
function layoutMarkers(eventList, data, baseWidth, totalDuration) {
  const markers = eventList
    .map((ev, i) => {
      const { barycenter_sec: barycenterSec } = eventWindowStats(data, ev.start_sec, ev.end_sec);
      return { i, x: (barycenterSec / totalDuration) * baseWidth };
    })
    .sort((a, b) => a.x - b.x);

  for (let k = 1; k < markers.length; k++) {
    const minX = markers[k - 1].x + MARKER_MIN_GAP_PX;
    if (markers[k].x < minX) markers[k].x = minX;
  }

  return markers;
}

// Ticks at a round-number step (0.5/1/2/5/10/15/30/60s) chosen so adjacent
// labels stay legible at the current px/sec — not a fixed count, since a
// 5s clip and a 60s clip need very different spacing on the same scale.
function pickTickStepSec(pxPerSec, mode) {
  const minPxPerTick = MIN_PX_PER_TICK[mode];
  return TICK_STEP_CANDIDATES_SEC.find((step) => step * pxPerSec >= minPxPerTick) || TICK_STEP_CANDIDATES_SEC[TICK_STEP_CANDIDATES_SEC.length - 1];
}

function buildTicks(durationSec, mode) {
  if (!durationSec) return [];
  const step = pickTickStepSec(PX_PER_SEC[mode], mode);
  const ticks = [];
  for (let t = 0; t <= durationSec; t += step) ticks.push(t);
  return ticks;
}

// Horizontal heatmap — time left-to-right, frequency bottom-to-top, low
// frequency at the bottom. Width scales with the clip's duration at a fixed,
// generous px/sec (not compressed into a fixed box), so it scrolls
// horizontally inside `.spectrogram-scroll` rather than cramming a whole
// minute of audio into a small fixed area. `events` (citizen-captured loud
// moments) render as small markers in a bottom margin band, at their
// energy-weighted barycenter position (`eventWindowStats()` in
// spectralAnalysis.js — same frame data already computed, no new DSP).
//
// A single mechanism drives both requested scroll behaviors — "follow
// playback" and "jump to a clicked marker": `playbackTimeSec` (the actual
// <audio> element's current time, tracked in ReportForm.jsx and passed down
// through EventAnnotator.jsx) moves a playhead line and keeps it centered
// in view; clicking a marker calls `onSeek(event.start_sec, event.end_sec)`,
// which moves the real playback position, which is what actually triggers
// the scroll — not a separate scroll-to-marker code path. Passing an end
// time tells the caller (ReportForm.jsx) to stop playback there, so tapping
// a marker replays just that moment instead of running on into whatever
// comes after it in the clip.
//
// Interactive only when `onSelectEvent`/`onSeek` are passed (the annotation
// screen); the saved-report review in `ReportDetailPanel.jsx` passes
// neither and stays a static, manually-scrollable strip.
export default function SpectrogramView({ data, events, onSelectEvent, onSeek, playbackTimeSec, compact }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const mode = compact ? 'compact' : 'full';
  const heatmapH = HEATMAP_H[mode];
  const height = heatmapH + MARKER_MARGIN;

  const durationSec = data?.frame_times_sec?.length
    ? data.frame_times_sec[data.frame_times_sec.length - 1]
    : 0;
  const eventList = events || [];
  const baseWidth = Math.max(MIN_WIDTH[mode], durationSec * PX_PER_SEC[mode]);
  const markerLayout = data && durationSec > 0 ? layoutMarkers(eventList, data, baseWidth, durationSec) : [];
  const lastMarkerX = markerLayout.length ? markerLayout[markerLayout.length - 1].x : 0;
  const width = Math.max(baseWidth, lastMarkerX + MARKER_RADIUS + 6);
  const ticks = buildTicks(durationSec, mode);

  useEffect(() => {
    if (!data || !canvasRef.current) return;

    const { levels_dbfs: levels, band_centers_hz: bands, frame_times_sec: times, event } = data;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const frameCount = levels.length;
    const bandCount = bands.length;
    if (frameCount === 0 || bandCount === 0) return;

    // The heatmap and the auto-detected onset/offset lines map to
    // baseWidth, not the (possibly wider) final canvas width — any extra
    // room past baseWidth exists only to fit decluttered markers.
    const cellW = baseWidth / frameCount;
    const cellH = heatmapH / bandCount;

    for (let f = 0; f < frameCount; f++) {
      for (let b = 0; b < bandCount; b++) {
        ctx.fillStyle = levelToColor(levels[f][b]);
        const x = f * cellW;
        const y = heatmapH - (b + 1) * cellH; // low frequency at the bottom
        ctx.fillRect(x, y, cellW + 1, cellH + 1);
      }
    }

    if (event && times.length > 1) {
      const onsetX = (event.onset_sec / durationSec) * baseWidth;
      const offsetX = (event.offset_sec / durationSec) * baseWidth;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      [onsetX, offsetX].forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, heatmapH);
        ctx.stroke();
      });
    }

    const markerY = heatmapH + MARKER_MARGIN / 2;
    markerLayout.forEach(({ i, x }) => {
      const color = (eventList[i].type && TYPE_COLORS[eventList[i].type]) || UNSET_COLOR;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, markerY, MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [data, eventList, markerLayout, width, height, baseWidth, heatmapH, durationSec]);

  // Keep the playhead centered in view as it moves — covers both "scroll as
  // it plays" (progressing playback ticks this via `timeupdate`) and
  // "scroll to a clicked marker" (a seek moves playbackTimeSec the same way).
  useEffect(() => {
    if (playbackTimeSec == null || !containerRef.current || !durationSec) return;
    const x = (playbackTimeSec / durationSec) * baseWidth;
    const el = containerRef.current;
    el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
  }, [playbackTimeSec, baseWidth, durationSec]);

  const handleClick = (e) => {
    if (!data) return;
    const totalDuration = data.frame_times_sec[data.frame_times_sec.length - 1];
    if (!totalDuration) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    const tSec = Math.min(totalDuration, Math.max(0, (clickX / rect.width) * totalDuration));

    if (onSelectEvent && markerLayout.length > 0) {
      const markerY = (heatmapH + MARKER_MARGIN / 2) * scaleY;
      let best = null;
      markerLayout.forEach(({ i, x }) => {
        const markerX = x * scaleX;
        const dist = Math.hypot(clickX - markerX, clickY - markerY);
        if (!best || dist < best.dist) best = { i, dist };
      });
      if (best && best.dist <= MARKER_HIT_RADIUS_PX) {
        onSelectEvent(best.i);
        onSeek?.(eventList[best.i].start_sec, eventList[best.i].end_sec);
        return;
      }
    }

    onSeek?.(tSec);
  };

  if (!data) return null;

  const interactive = Boolean(onSelectEvent || onSeek);
  const playheadX = playbackTimeSec != null && durationSec > 0 ? (playbackTimeSec / durationSec) * baseWidth : null;

  return (
    <div className={`spectrogram${compact ? ' compact' : ''}`}>
      <div className="spectrogram-scroll" ref={containerRef}>
        <div className="spectrogram-inner" style={{ width }}>
          <div className="spectrogram-canvas-wrap" style={{ width, height }}>
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              onClick={interactive ? handleClick : undefined}
              className={interactive ? 'clickable' : undefined}
            />
            {playheadX != null && <div className="playhead-line" style={{ left: `${playheadX}px` }} />}
          </div>
          {ticks.length > 0 && (
            <div className="spectrogram-time-ticks" style={{ width: baseWidth, height: TICK_ROW_H }}>
              {ticks.map((t) => (
                <span key={t} style={{ left: `${(t / durationSec) * 100}%` }}>{t}s</span>
              ))}
            </div>
          )}
        </div>
      </div>
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
