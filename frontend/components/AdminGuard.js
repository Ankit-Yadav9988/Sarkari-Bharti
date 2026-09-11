import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { isLoggedIn, logout, millisUntilExpiry } from '../lib/auth';

// Wraps every admin page. Sends anyone without a usable token to the login
// screen and renders nothing while it decides, so a protected screen never
// flashes up before the redirect.
//
// This is not the access control -- the backend is. A token that this accepts
// still has to survive SecurityConfig on every request. What this prevents is
// the confusing version of failure: a full admin UI where every button quietly
// comes back 401.
export default function AdminGuard({ children }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      logout();       // clear an expired token so it stops being retried
      router.replace('/admin/login?expired=1');
      return;
    }
    setChecked(true);

    // A tab left open past the token's expiry: drop to the login screen at the
    // moment it lapses rather than waiting for the admin to click something and
    // watch it fail. Guarded against setTimeout's 32-bit ceiling, which would
    // otherwise fire immediately for a long-lived token.
    const remaining = millisUntilExpiry();
    if (remaining == null || remaining > 2_147_483_647) return;

    const timer = setTimeout(() => {
      logout();
      router.replace('/admin/login?expired=1');
    }, Math.max(0, remaining));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked) return null;

  return (
    <div>
      <div style={{ textAlign: 'right', padding: '6px 20px' }}>
        <button
          onClick={() => { logout(); router.push('/admin/login'); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
        >
          Log out
        </button>
      </div>
      {children}
    </div>
  );
}
