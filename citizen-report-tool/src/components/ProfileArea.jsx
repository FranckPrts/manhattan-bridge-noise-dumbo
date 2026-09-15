import { useState, useEffect } from 'react';
import BackupEmail from './BackupEmail.jsx';
import { RELATIONSHIPS, TENURES, GLAZING_OPTIONS, TYPICAL_CONTEXTS } from '../lib/profileFields.js';

const EMPTY = { relationship: '', tenure: '', glazing: '', typical_context: '', longitudinal_consent: false };

export default function ProfileArea({ user, onLinkEmail, profile, profileLoading, onSaveProfile }) {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const [error, setError] = useState(null);

  // Profile loads asynchronously after the tab mounts — sync it into local
  // form state once it arrives, but don't clobber in-progress edits.
  useEffect(() => {
    if (profile && status === 'idle') {
      setForm({
        relationship: profile.relationship || '',
        tenure: profile.tenure || '',
        glazing: profile.glazing || '',
        typical_context: profile.typical_context || '',
        longitudinal_consent: profile.longitudinal_consent || false,
      });
    }
  }, [profile, status]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('saving');
    setError(null);
    const result = await onSaveProfile(form);
    if (result.ok) {
      setStatus('saved');
    } else {
      setStatus('error');
      setError(result.error);
    }
  };

  return (
    <div className="profile-area">
      <BackupEmail user={user} onLinkEmail={onLinkEmail} />

      <div className="info profile-context">
        <h2>About you</h2>
        <p className="hint">
          Optional, and answered once — not per report. This is what lets repeat reports
          from you be read as an exposure history instead of unrelated one-off complaints,
          the same way a resident's account differs from a passerby's.
        </p>

        {profileLoading ? (
          <p className="hint">Loading…</p>
        ) : (
          <form onSubmit={handleSubmit} className="report-form">
            <div className="field">
              <label htmlFor="relationship">Relationship to this location</label>
              <select
                id="relationship"
                value={form.relationship}
                onChange={(e) => update('relationship', e.target.value)}
              >
                <option value="">Prefer not to say</option>
                {RELATIONSHIPS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="tenure">How long has that been true?</label>
              <select id="tenure" value={form.tenure} onChange={(e) => update('tenure', e.target.value)}>
                <option value="">Prefer not to say</option>
                {TENURES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="glazing">Windows where you spend most time</label>
              <select id="glazing" value={form.glazing} onChange={(e) => update('glazing', e.target.value)}>
                <option value="">Prefer not to say</option>
                {GLAZING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="typical_context">Where are you usually when you notice the noise?</label>
              <select
                id="typical_context"
                value={form.typical_context}
                onChange={(e) => update('typical_context', e.target.value)}
              >
                <option value="">Prefer not to say</option>
                {TYPICAL_CONTEXTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.longitudinal_consent}
                  onChange={(e) => update('longitudinal_consent', e.target.checked)}
                />
                Link my reports over time for research use
              </label>
              <p className="hint">
                Separate from the backup email above — this only controls whether your reports
                may be studied together as a history. You can change this anytime.
              </p>
            </div>

            <button type="submit" className="submit" disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Save'}
            </button>
            {status === 'saved' && <p className="hint success">✓ Saved</p>}
            {status === 'error' && <p className="hint error">✗ {error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
