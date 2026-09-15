import { useMemo, useState } from 'react';
import { EVENT_TYPES } from '../lib/reportFields.js';
import { eventBandProfile, eventWindowStats } from '../lib/spectralAnalysis.js';
import SpectralSignatureStrip from './SpectralSignatureStrip.jsx';
import ReportDetailPanel from '../components/ReportDetailPanel.jsx';

const UNCATEGORIZED = { value: '__uncategorized', label: 'Not categorized', icon: '❓' };

// Flattens every citizen-marked "loud moment" (report_data.marked_events)
// across all reports into one list, each carrying its own spectral
// signature (eventBandProfile — a per-band mean over just that window, not
// the whole clip). This is the anchor IMPLEMENTATION_NOTES.md called out as
// missing: human-labeled onsets, not the auto-detector's threshold
// crossing, so events of the same citizen-assigned type can be compared and
// averaged meaningfully.
function collectEvents(reports) {
  const out = [];
  reports.forEach((r) => {
    const marked = r.report_data?.marked_events || [];
    if (!r.spectral || marked.length === 0) return;
    marked.forEach((ev, idx) => {
      const profile = eventBandProfile(r.spectral, ev.start_sec, ev.end_sec);
      if (!profile) return;
      const stats = eventWindowStats(r.spectral, ev.start_sec, ev.end_sec);
      out.push({
        id: `${r.id}-${idx}`,
        report: r,
        type: ev.type || null,
        startSec: ev.start_sec,
        endSec: ev.end_sec,
        peakDbfs: stats.peak_dbfs,
        profile,
      });
    });
  });
  return out.sort((a, b) => new Date(b.report.timestamp) - new Date(a.report.timestamp));
}

function averageProfile(events) {
  if (events.length === 0) return null;
  const bandCentersHz = events[0].profile.band_centers_hz;
  const bandCount = bandCentersHz.length;
  const sums = new Array(bandCount).fill(0);
  events.forEach((e) => {
    e.profile.relative_dbfs.forEach((v, b) => {
      sums[b] += v;
    });
  });
  return { bandCentersHz, relativeDbfs: sums.map((s) => s / events.length) };
}

function typeInfo(value) {
  return EVENT_TYPES.find((t) => t.value === value) || UNCATEGORIZED;
}

function EventCard({ event }) {
  const [expanded, setExpanded] = useState(false);
  const info = typeInfo(event.type);
  const annoyance = event.report.report_data?.annoyance;

  return (
    <div className="chart-block event-card">
      <div className="event-card-head">
        <span>
          {info.icon} <strong>{info.label}</strong>
        </span>
        <span className="hint">{new Date(event.report.timestamp).toLocaleString()}</span>
      </div>

      <SpectralSignatureStrip bandCentersHz={event.profile.band_centers_hz} relativeDbfs={event.profile.relative_dbfs} />

      <ul className="mitigation-stats">
        <li>{(event.endSec - event.startSec).toFixed(1)}s window</li>
        <li>peak {typeof event.peakDbfs === 'number' ? `${event.peakDbfs.toFixed(1)} dBFS` : '—'} (uncalibrated)</li>
        {typeof annoyance === 'number' && <li>annoyance {annoyance}/10</li>}
        {typeof event.report.lat === 'number' && (
          <li>{event.report.lat.toFixed(3)}, {event.report.lon.toFixed(3)}</li>
        )}
      </ul>

      <button type="button" className="preview-button" onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Hide full report' : 'Show full report & audio'}
      </button>
      {expanded && (
        <div className="report-details">
          <ReportDetailPanel report={event.report} />
        </div>
      )}
    </div>
  );
}

export default function EventExplorer({ reports }) {
  const allEvents = useMemo(() => collectEvents(reports), [reports]);
  const [typeFilter, setTypeFilter] = useState('all');

  const typeOptions = [
    { value: 'all', label: 'All types', icon: '' },
    ...EVENT_TYPES,
    UNCATEGORIZED,
  ];

  const filtered = typeFilter === 'all' ? allEvents : allEvents.filter((e) => (e.type || UNCATEGORIZED.value) === typeFilter);

  const byType = typeOptions
    .filter((t) => t.value !== 'all')
    .map((t) => ({
      ...t,
      events: allEvents.filter((e) => (e.type || UNCATEGORIZED.value) === t.value),
    }))
    .filter((t) => t.events.length > 0);

  return (
    <div>
      <div className="chart-block">
        <h2>Average spectral signature by event type (n={allEvents.length} logged moments)</h2>
        {byType.length === 0 ? (
          <p className="hint">No categorized loud moments yet — citizens tag these after recording.</p>
        ) : (
          <div className="mitigation-grid">
            {byType.map((t) => {
              const avg = averageProfile(t.events);
              return (
                <div key={t.value} className="event-type-avg">
                  <p>
                    {t.icon} <strong>{t.label}</strong> <span className="hint">({t.events.length})</span>
                  </p>
                  <SpectralSignatureStrip bandCentersHz={avg.bandCentersHz} relativeDbfs={avg.relativeDbfs} />
                </div>
              );
            })}
          </div>
        )}
        <p className="hint">
          Shape only (each event re-based to its own peak = 0dB) — raw levels are uncalibrated and not comparable
          across different phones, but where the energy sits across frequency is.
        </p>
      </div>

      <div className="tabs event-type-filter">
        {typeOptions.map((t) => (
          <button
            key={t.value}
            type="button"
            className={typeFilter === t.value ? 'active' : ''}
            onClick={() => setTypeFilter(t.value)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="hint">No logged moments for this filter.</p>
      ) : (
        <div className="mitigation-grid">
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
