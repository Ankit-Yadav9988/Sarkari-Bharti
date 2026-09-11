import { useState } from 'react';
import { useRouter } from 'next/router';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { saveToken } from '../../lib/auth';
import { API_URL } from '../../lib/api';

/** "90" -> "in 2 minutes". Seconds are noise once it is more than a minute. */
function waitText(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'in a moment';
  if (seconds < 60) return `in ${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // AdminGuard and authFetch both send an expired session here with ?expired=1,
  // so the admin is told why they are looking at a login form again instead of
  // wondering whether something broke.
  const expired = router.query.expired === '1';

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      // Login is rate limited per IP. Without this branch a locked-out admin
      // reads "Incorrect username or password" and keeps trying the password
      // they already know is right, extending the lockout every time.
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const seconds = Number(body.retryAfterSeconds ?? res.headers.get('Retry-After'));
        throw new Error(`Too many login attempts from this network. Try again ${waitText(seconds)}.`);
      }

      if (!res.ok) {
        throw new Error('Incorrect username or password.');
      }

      const data = await res.json();
      saveToken(data.token);
      router.push('/admin/manage');
    } catch (err) {
      setError(err.message || 'Login failed. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Header />
      <div className="container" style={{ paddingTop: 40, maxWidth: 400, paddingBottom: 60 }}>
        <h1>Admin login</h1>

        {expired && !error && (
          <div className="pill-amber" style={{ padding: '12px 14px', borderRadius: 8, marginTop: 12, fontSize: '0.9rem' }}>
            Your session has expired. Please log in again.
          </div>
        )}

        {error && (
          <div className="pill-red" style={{ padding: '12px 14px', borderRadius: 8, marginTop: 12, fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="field-label">Username</label>
          <input className="input" value={username} onChange={e => setUsername(e.target.value)} required />

          <label className="field-label">Password</label>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />

          <button type="submit" className="btn-primary btn-block" disabled={submitting} style={{ marginTop: 20 }}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
}
