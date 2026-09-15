import { useState } from 'react';
import './index.css';
import { useAuth } from './hooks/useAuth.js';
import BackupEmail from './components/BackupEmail.jsx';
import ReportForm from './components/ReportForm.jsx';
import ReportsList from './components/ReportsList.jsx';

function App() {
  const { session, user, accessToken, loading, error, linkEmail } = useAuth();
  const [tab, setTab] = useState('new'); // 'new' | 'mine'
  const [refreshKey, setRefreshKey] = useState(0);

  if (loading) {
    return <div className="app"><p className="hint">Loading…</p></div>;
  }

  if (!session) {
    return (
      <div className="app">
        <h1>Bridge Noise Reports</h1>
        <p className="hint error">✗ {error || 'Could not start a session. Please reload.'}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Bridge Noise Reports</h1>

      <BackupEmail user={user} onLinkEmail={linkEmail} />

      <nav className="tabs">
        <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
          New report
        </button>
        <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
          My reports
        </button>
      </nav>

      {tab === 'new' && (
        <ReportForm
          accessToken={accessToken}
          onSubmitted={() => {
            setRefreshKey((k) => k + 1);
            setTab('mine');
          }}
        />
      )}
      {tab === 'mine' && <ReportsList accessToken={accessToken} refreshKey={refreshKey} />}
    </div>
  );
}

export default App;
