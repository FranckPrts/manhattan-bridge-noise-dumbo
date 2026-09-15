import { useState } from 'react';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || null;

export default function BackupEmail({ user, onLinkEmail }) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState(null);
  // Dismissal is in-memory only — it comes back on reload as a reminder,
  // rather than being silenced forever after one click.
  const [dismissed, setDismissed] = useState(false);

  // is_anonymous flips to false only once the confirmation link is clicked —
  // until then this account has no usable email on file yet.
  const hasConfirmedEmail = !!user?.email && user?.is_anonymous === false;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    const result = await onLinkEmail(email);
    if (result.ok) {
      setStatus('sent');
    } else {
      setStatus('error');
      setError(result.error);
    }
  };

  const dismiss = () => setDismissed(true);

  if (hasConfirmedEmail) {
    return (
      <div className="backup-email success">
        <p>✓ Backup email on file: {user.email}</p>
        {SUPPORT_EMAIL && (
          <p className="hint">
            Lost access to this device? Email {SUPPORT_EMAIL} from that address for help recovering your reports.
          </p>
        )}
      </div>
    );
  }

  if (status === 'sent') {
    return (
      <div className="backup-email">
        <p className="hint">📧 Check {email} to confirm your backup email.</p>
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div className="backup-email warning">
      <button type="button" className="dismiss-button" onClick={dismiss} aria-label="Dismiss">✕</button>
      <p>⚠ No backup email — if you lose access to this device (clear browser data, reinstall), your reports can't be recovered.</p>
      {!showForm ? (
        <button type="button" onClick={() => setShowForm(true)}>Add backup email</button>
      ) : (
        <form onSubmit={handleSubmit} className="inline-form">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <button type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Confirm'}
          </button>
        </form>
      )}
      {status === 'error' && <p className="hint error">✗ {error}</p>}
    </div>
  );
}
