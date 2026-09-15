import { useState } from 'react';
import './index.css';
import { useAuth } from './hooks/useAuth.js';
import { useProfile } from './hooks/useProfile.js';
import { isProfileComplete } from './lib/profileFields.js';
import ProfileArea from './components/ProfileArea.jsx';
import ReportForm from './components/ReportForm.jsx';
import ReportsList from './components/ReportsList.jsx';

function App() {
  const { session, user, accessToken, loading, error, linkEmail } = useAuth();
  const { profile, loading: profileLoading, saveProfile } = useProfile(accessToken);
  const [tab, setTab] = useState('new'); // 'new' | 'mine' | 'profile'
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

  const profileComplete = isProfileComplete(profile);

  return (
    <div className="app">
      <h1>Bridge Noise Reports</h1>

      <nav className="tabs">
        <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
          New report
        </button>
        <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
          My reports
        </button>
        <button
          className={`profile-tab-button ${tab === 'profile' ? 'active' : ''}`}
          onClick={() => setTab('profile')}
          aria-label="Profile"
          title="Profile"
        >
          👤
          {!profileComplete && !profileLoading && (
            <span className="notification-pill" aria-label="Profile incomplete" />
          )}
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
      {tab === 'profile' && (
        <ProfileArea
          user={user}
          onLinkEmail={linkEmail}
          profile={profile}
          profileLoading={profileLoading}
          onSaveProfile={saveProfile}
        />
      )}
    </div>
  );
}

export default App;
