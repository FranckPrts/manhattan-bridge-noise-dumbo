import { RECURRING_OPTIONS, DURATION_PATTERNS } from '../lib/reportFields.js';

const EVENT_DURATION_BUCKETS = [
  { label: '<1s', test: (v) => v < 1 },
  { label: '1-2s', test: (v) => v >= 1 && v < 2 },
  { label: '2-3s', test: (v) => v >= 2 && v < 3 },
  { label: '3-5s', test: (v) => v >= 3 && v < 5 },
  { label: '5-10s', test: (v) => v >= 5 && v < 10 },
  { label: '10s+', test: (v) => v >= 10 },
];

function Histogram({ title, rows }) {
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="chart-block">
      <h2>{title}</h2>
      {rows.every((r) => r.count === 0) ? (
        <p className="hint">No data yet.</p>
      ) : (
        rows.map((row) => (
          <div className="histogram-row" key={row.label}>
            <span className="histogram-label">{row.label}</span>
            <div className="histogram-bar-track">
              <div className="histogram-bar-fill" style={{ width: `${(row.count / max) * 100}%` }} />
            </div>
            <span className="histogram-count">{row.count}</span>
          </div>
        ))
      )}
    </div>
  );
}

export default function EventHistograms({ reports }) {
  const eventDurations = reports
    .map((r) => r.spectral?.summary?.event_duration_sec)
    .filter((v) => typeof v === 'number');

  const durationRows = EVENT_DURATION_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: eventDurations.filter(bucket.test).length,
  }));

  const recurringRows = RECURRING_OPTIONS.map((opt) => ({
    label: opt.label,
    count: reports.filter((r) => r.report_data?.recurring === opt.value).length,
  }));

  const patternRows = DURATION_PATTERNS.map((opt) => ({
    label: opt.label,
    count: reports.filter((r) => r.report_data?.duration_pattern === opt.value).length,
  }));

  return (
    <>
      <Histogram title={`Detected event duration (n=${eventDurations.length})`} rows={durationRows} />
      <Histogram title="Reported recurrence pattern" rows={recurringRows} />
      <Histogram title="Reported duration pattern" rows={patternRows} />
    </>
  );
}
