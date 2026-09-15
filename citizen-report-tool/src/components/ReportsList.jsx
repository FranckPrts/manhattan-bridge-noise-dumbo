import { useState, useEffect, useCallback } from 'react';

const KIND_ICON = { audio: '🎙️', image: '📷', video: '🎥' };

function MediaItem({ item }) {
  if (item.kind === 'audio') {
    return <audio controls src={item.url} />;
  }
  if (item.kind === 'image') {
    return <img src={item.url} alt="Report media" />;
  }
  if (item.kind === 'video') {
    return <video controls src={item.url} />;
  }
  return null;
}

export default function ReportsList({ accessToken, refreshKey }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reports', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Could not load reports (${res.status})`);
      }
      const data = await res.json();
      setReports(data.reports);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports, refreshKey]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this report? This cannot be undone.')) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/report?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Delete failed (${res.status})`);
      }
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <p className="hint">Loading your reports…</p>;
  if (error) return <p className="hint error">✗ {error}</p>;
  if (reports.length === 0) {
    return <p className="hint">No reports yet. Submit one from the "New report" tab.</p>;
  }

  return (
    <ul className="reports-list">
      {reports.map((r) => {
        const expanded = expandedId === r.id;
        return (
          <li key={r.id} className="report-item">
            <div className="report-row">
              <span className="annoyance-badge">{r.report_data?.annoyance}/10</span>
              <span className="report-row-summary">
                <strong>{r.report_data?.activity_interrupted}</strong> · {r.report_data?.perceived_direction}
              </span>
              {r.media?.length > 0 && (
                <span className="media-icons">
                  {r.media.map((item, i) => (
                    <span key={i}>{KIND_ICON[item.kind] || ''}</span>
                  ))}
                </span>
              )}
              <span className="timestamp">{new Date(r.timestamp).toLocaleDateString()}</span>
              <button
                type="button"
                className="preview-button"
                onClick={() => setExpandedId(expanded ? null : r.id)}
              >
                {expanded ? 'Hide' : 'Preview'}
              </button>
            </div>

            {expanded && (
              <div className="report-details">
                <p className="hint">{new Date(r.timestamp).toLocaleString()}</p>
                {r.media?.length > 0 && (
                  <div className="report-media">
                    {r.media.map((item, i) => (
                      <MediaItem key={i} item={item} />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => handleDelete(r.id)}
                  disabled={deletingId === r.id}
                >
                  {deletingId === r.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
