import { useState, useEffect, useCallback } from 'react';
import '../index.css';
import AdminLogin from './AdminLogin.jsx';
import AdminDashboard from './AdminDashboard.jsx';

export default function AdminApp() {
  const [status, setStatus] = useState('loading'); // loading | signed-out | signed-in
  const [reports, setReports] = useState([]);
  const [error, setError] = useState(null);

  // The citizen-facing form relies on body's centered, narrow max-width for
  // mobile-first readability. The admin dashboard is a data-dense tool used
  // on a desktop-size screen, so it opts out and uses the full viewport
  // width instead — scoped to this page's lifetime, not a global change.
  useEffect(() => {
    document.body.classList.add('admin-mode');
    return () => document.body.classList.remove('admin-mode');
  }, []);

  const fetchReports = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/reports', { credentials: 'include' });
      if (res.status === 401) {
        setStatus('signed-out');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Could not load reports (${res.status})`);
      }
      const data = await res.json();
      setReports(data.reports);
      setStatus('signed-in');
    } catch (err) {
      setError(err.message);
      setStatus('signed-out');
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    setStatus('signed-out');
    setReports([]);
  };

  if (status === 'loading') {
    return <div className="app"><p className="hint">Loading…</p></div>;
  }

  if (status === 'signed-out') {
    return (
      <div className="app">
        <AdminLogin onSignedIn={fetchReports} error={error} />
      </div>
    );
  }

  return (
    <div className="app">
      <AdminDashboard reports={reports} onLogout={handleLogout} onRefresh={fetchReports} />
    </div>
  );
}
