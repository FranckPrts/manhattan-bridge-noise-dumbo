import { useState, useRef } from 'react';
import SpectrogramView from './SpectrogramView.jsx';
import { EVENT_TYPES, labelFor } from '../lib/reportFields.js';
import { eventWindowStats } from '../lib/spectralAnalysis.js';

const DBFS_MIN = -80;
const DBFS_MAX = 0;
const STEP_SEC = 0.5;
const MIN_EVENT_DURATION_SEC = 0.1;
const REMOVE_ARM_MS = 3000;
const HIGHLIGHT_MS = 1500;

function LevelBar({ dbfs }) {
  if (dbfs == null) return null;
  const pct = Math.min(100, Math.max(0, ((dbfs - DBFS_MIN) / (DBFS_MAX - DBFS_MIN)) * 100));
  return (
    <div className="level-bar" title={`${dbfs.toFixed(1)} dBFS (relative)`}>
      <div className="level-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Stepper({ label, valueLabel, onDecrement, onIncrement }) {
  return (
    <div className="event-card-stepper">
      <span className="event-card-stepper-label">{label}</span>
      <button type="button" onClick={onDecrement}>−{STEP_SEC}s</button>
      <span className="event-card-stepper-value">{valueLabel}</span>
      <button type="button" onClick={onIncrement}>+{STEP_SEC}s</button>
    </div>
  );
}

// The post-recording annotation screen: a fixed-size minimap (see
// SpectrogramView.jsx's `compact` mode — a glance-only overview, not a
// reading or editing surface) that jumps to a card on tap, alongside a
// scrollable list of cards, one per captured moment, to categorize, trim,
// replay, or discard it.
//
// `onSeek(sec)` plays the recorded clip back from a given time — wired from
// ReportForm's <audio> element — so a citizen can listen to exactly the
// moment they're about to tag, rather than guessing from the heatmap alone.
export default function EventAnnotator({ spectral, events, onEventsChange, onSeek, playbackTimeSec }) {
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [armedIndex, setArmedIndex] = useState(null);
  // Every card starts expanded (unchanged first-view behavior) — collapsing
  // is something the citizen opts into once they've seen a card, e.g. after
  // categorizing it, to make room to scroll through the rest of the list.
  const [collapsedIndices, setCollapsedIndices] = useState(() => new Set());
  const cardRefs = useRef(new Map());
  const highlightTimeoutRef = useRef(null);
  const armTimeoutRef = useRef(null);

  if (!spectral || events.length === 0) return null;

  const totalDuration = spectral.frame_times_sec[spectral.frame_times_sec.length - 1];

  const setType = (index, type) => {
    onEventsChange(events.map((ev, i) => (i === index ? { ...ev, type } : ev)));
  };

  const removeEvent = (index) => {
    onEventsChange(events.filter((_, i) => i !== index));
  };

  const adjustStart = (index, delta) => {
    onEventsChange(events.map((ev, i) => {
      if (i !== index) return ev;
      const start_sec = Math.max(0, Math.min(ev.start_sec + delta, ev.end_sec - MIN_EVENT_DURATION_SEC));
      return { ...ev, start_sec };
    }));
  };

  const adjustEnd = (index, delta) => {
    onEventsChange(events.map((ev, i) => {
      if (i !== index) return ev;
      const end_sec = Math.min(totalDuration, Math.max(ev.end_sec + delta, ev.start_sec + MIN_EVENT_DURATION_SEC));
      return { ...ev, end_sec };
    }));
  };

  const selectEvent = (index) => {
    // Jumping to a card from a spectrogram marker tap should always land on
    // its full detail, not a collapsed summary the citizen then has to open.
    setCollapsedIndices((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    cardRefs.current.get(index)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    setHighlightedIndex(index);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedIndex(null), HIGHLIGHT_MS);
  };

  const toggleCollapsed = (index) => {
    setCollapsedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleRemoveClick = (index) => {
    if (armTimeoutRef.current) clearTimeout(armTimeoutRef.current);
    if (armedIndex === index) {
      setArmedIndex(null);
      removeEvent(index);
      return;
    }
    setArmedIndex(index);
    armTimeoutRef.current = setTimeout(() => setArmedIndex(null), REMOVE_ARM_MS);
  };

  return (
    <div className="field">
      <label>What were the loud moments you captured?</label>
      <p className="hint">
        Tap ▶ or a marker to listen and scroll to that moment. Use the +/− buttons to trim where it starts or ends.
        Tap a card's time to collapse it once you're done with it.
      </p>
      <div className="event-annotator">
        <SpectrogramView
          data={spectral}
          events={events}
          onSelectEvent={selectEvent}
          onSeek={onSeek}
          playbackTimeSec={playbackTimeSec}
          compact
        />
        <div className="event-list">
          {events.map((ev, i) => {
            const { peak_dbfs: peak, barycenter_sec: barycenter } = eventWindowStats(spectral, ev.start_sec, ev.end_sec);
            const durationSec = ev.end_sec - ev.start_sec;
            const removeArmed = armedIndex === i;
            const collapsed = collapsedIndices.has(i);
            return (
              <div
                key={i}
                ref={(node) => {
                  if (node) cardRefs.current.set(i, node);
                  else cardRefs.current.delete(i);
                }}
                className={`event-card${highlightedIndex === i ? ' highlighted' : ''}${collapsed ? ' collapsed' : ''}`}
              >
                <div className="event-card-header">
                  <button
                    type="button"
                    className="event-card-toggle"
                    onClick={() => toggleCollapsed(i)}
                    aria-expanded={!collapsed}
                  >
                    <span className="event-card-chevron">{collapsed ? '▸' : '▾'}</span>
                    <span className="event-card-time">
                      {ev.start_sec.toFixed(1)}s
                      {durationSec > 0.2 ? `–${ev.end_sec.toFixed(1)}s` : ''}
                    </span>
                    {collapsed && (
                      <span className="event-card-type-summary">
                        {ev.type ? `${EVENT_TYPES.find((t) => t.value === ev.type)?.icon || ''} ${labelFor(EVENT_TYPES, ev.type)}` : 'Not categorized'}
                      </span>
                    )}
                  </button>
                  <div className="event-card-actions">
                    {onSeek && (
                      <button type="button" className="event-card-replay" onClick={() => onSeek(ev.start_sec, ev.end_sec)}>▶</button>
                    )}
                    <button
                      type="button"
                      className={`event-card-remove${removeArmed ? ' armed' : ''}`}
                      onClick={() => handleRemoveClick(i)}
                    >
                      {removeArmed ? 'Remove?' : '✕'}
                    </button>
                  </div>
                </div>
                {!collapsed && (
                  <>
                    {durationSec > 0.5 && (
                      <p className="event-card-anchor">Loudest around {barycenter.toFixed(1)}s</p>
                    )}
                    <LevelBar dbfs={peak} />
                    <div className="event-card-steppers">
                      <Stepper
                        label="Start"
                        valueLabel={`${ev.start_sec.toFixed(1)}s`}
                        onDecrement={() => adjustStart(i, -STEP_SEC)}
                        onIncrement={() => adjustStart(i, STEP_SEC)}
                      />
                      <Stepper
                        label="End"
                        valueLabel={`${ev.end_sec.toFixed(1)}s`}
                        onDecrement={() => adjustEnd(i, -STEP_SEC)}
                        onIncrement={() => adjustEnd(i, STEP_SEC)}
                      />
                    </div>
                    <div className="tile-group event-card-tiles">
                      {EVENT_TYPES.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`tile${ev.type === opt.value ? ' selected' : ''}`}
                          onClick={() => setType(i, opt.value)}
                        >
                          {opt.icon} {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
