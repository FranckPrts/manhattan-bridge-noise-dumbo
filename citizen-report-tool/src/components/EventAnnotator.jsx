import SpectrogramView from './SpectrogramView.jsx';
import { EVENT_TYPES } from '../lib/reportFields.js';
import { eventWindowStats } from '../lib/spectralAnalysis.js';

const DBFS_MIN = -80;
const DBFS_MAX = 0;

function LevelBar({ dbfs }) {
  if (dbfs == null) return null;
  const pct = Math.min(100, Math.max(0, ((dbfs - DBFS_MIN) / (DBFS_MAX - DBFS_MIN)) * 100));
  return (
    <div className="level-bar" title={`${dbfs.toFixed(1)} dBFS (relative)`}>
      <div className="level-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

// The post-recording annotation screen: a vertical spectrogram spine (with
// a barycenter anchor + connecting line per event — see SpectrogramView.jsx)
// alongside a card per captured moment, to categorize, extend, replay, or
// discard it. One shared scroll container keeps the spine and the cards
// aligned without separate scroll-sync JS.
//
// `onSeek(sec)` plays the recorded clip back from a given time — wired from
// ReportForm's <audio> element — so a citizen can listen to exactly the
// moment they're about to tag, rather than guessing from the heatmap alone.
export default function EventAnnotator({ spectral, events, onEventsChange, onSeek }) {
  if (!spectral || events.length === 0) return null;

  const setType = (index, type) => {
    onEventsChange(events.map((ev, i) => (i === index ? { ...ev, type } : ev)));
  };

  const removeEvent = (index) => {
    onEventsChange(events.filter((_, i) => i !== index));
  };

  return (
    <div className="field">
      <label>What were the loud moments you captured?</label>
      <p className="hint">
        Tap ▶ to listen back to a moment. Tap near the edge of a mark on the strip to stretch or shrink it — overlapping moments get their own lane.
      </p>
      <div className="event-annotator">
        <SpectrogramView data={spectral} events={events} onEventsChange={onEventsChange} onSeek={onSeek} compact />
        <div className="event-list">
          {events.map((ev, i) => {
            const { peak_dbfs: peak, barycenter_sec: barycenter } = eventWindowStats(spectral, ev.start_sec, ev.end_sec);
            const durationSec = ev.end_sec - ev.start_sec;
            return (
              <div className="event-card" key={i}>
                <div className="event-card-header">
                  <span className="event-card-time">
                    {ev.start_sec.toFixed(1)}s
                    {durationSec > 0.2 ? `–${ev.end_sec.toFixed(1)}s` : ''}
                  </span>
                  <div className="event-card-actions">
                    {onSeek && (
                      <button type="button" className="event-card-replay" onClick={() => onSeek(ev.start_sec)}>▶</button>
                    )}
                    <button type="button" className="event-card-remove" onClick={() => removeEvent(i)}>✕</button>
                  </div>
                </div>
                {durationSec > 0.5 && (
                  <p className="event-card-anchor">Loudest around {barycenter.toFixed(1)}s</p>
                )}
                <LevelBar dbfs={peak} />
                <div className="tile-group">
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
