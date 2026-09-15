import { useState, useMemo } from 'react';

const COLUMNS = [
  { key: 'timestamp', label: 'Time', get: (r) => new Date(r.timestamp).toLocaleString() },
  { key: 'lat', label: 'Lat', get: (r) => (typeof r.lat === 'number' ? r.lat.toFixed(5) : '—') },
  { key: 'lon', label: 'Lon', get: (r) => (typeof r.lon === 'number' ? r.lon.toFixed(5) : '—') },
  { key: 'annoyance', label: 'Annoyance', get: (r) => r.report_data?.annoyance ?? '—' },
  { key: 'activity', label: 'Interrupted', get: (r) => r.report_data?.activity_interrupted ?? '—' },
  { key: 'direction', label: 'Direction', get: (r) => r.report_data?.perceived_direction ?? '—' },
  { key: 'recurring', label: 'Pattern', get: (r) => r.report_data?.recurring ?? '—' },
  { key: 'media', label: 'Media', get: (r) => (r.media || []).map((m) => m.kind).join(', ') || '—' },
  {
    key: 'event_duration',
    label: 'Event (s)',
    get: (r) => (typeof r.spectral?.summary?.event_duration_sec === 'number' ? r.spectral.summary.event_duration_sec.toFixed(1) : '—'),
  },
];

function sortValue(report, key) {
  switch (key) {
    case 'timestamp':
      return new Date(report.timestamp).getTime();
    case 'annoyance':
      return report.report_data?.annoyance ?? -1;
    case 'event_duration':
      return report.spectral?.summary?.event_duration_sec ?? -1;
    default:
      return COLUMNS.find((c) => c.key === key)?.get(report) ?? '';
  }
}

export default function RawDataTable({ reports }) {
  const [sortKey, setSortKey] = useState('timestamp');
  const [sortDir, setSortDir] = useState('desc');

  const sorted = useMemo(() => {
    const copy = [...reports];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [reports, sortKey, sortDir]);

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (reports.length === 0) {
    return <p className="hint">No reports yet.</p>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key} onClick={() => handleSort(col.key)} style={{ cursor: 'pointer' }}>
                {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              {COLUMNS.map((col) => (
                <td key={col.key}>{col.get(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
