// The admin's JWT in the browser, and the small amount of logic that goes with
// it.
//
// One admin managing their own site, so the token lives in localStorage. That
// is a real trade-off, not an oversight: localStorage is readable by any script
// on the page, so a script injection would expose the token. The alternative,
// an HttpOnly cookie, needs CSRF protection and a backend that sets it. For a
// single-operator portal this is the proportionate choice.
//
// Everything below is convenience and user experience. Authorisation happens on
// the server: SecurityConfig rejects a request with a bad, missing or expired
// token no matter what this file believes.

const TOKEN_KEY = 'admin_token';

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function logout() {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

/**
 * Reads the claims out of a JWT without verifying it.
 *
 * Deliberately not verification -- the signing secret is on the server and must
 * stay there, so nothing here can tell a real token from a forged one. It is
 * only used to notice a token that has plainly expired, so the admin sees the
 * login screen instead of a page whose every request comes back 401.
 */
function claims(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;    // not a JWT, or not base64: treat as no session
  }
}

/**
 * True when a token is present and not past its expiry.
 *
 * A token with no exp claim is accepted: a malformed one is the server's to
 * reject, and locking the admin out of their own site over a claim this cannot
 * verify would be the wrong failure.
 */
export function isLoggedIn() {
  const token = getToken();
  if (!token) return false;

  const payload = claims(token);
  if (!payload || typeof payload.exp !== 'number') return true;

  // exp is in seconds. The 30s margin stops a token that expires mid-request
  // from being treated as good right up to the instant it fails.
  return payload.exp * 1000 > Date.now() + 30_000;
}

/** Milliseconds until the token expires, or null when there is nothing to time. */
export function millisUntilExpiry() {
  const payload = claims(getToken());
  if (!payload || typeof payload.exp !== 'number') return null;
  return payload.exp * 1000 - Date.now();
}

/**
 * fetch() with the admin's token attached.
 *
 * A 401 or 403 clears the stored token and sends the browser to the login page.
 * That is a side effect in a helper, which is worth being explicit about: the
 * alternative is every admin screen remembering to check, and the one that
 * forgets leaves the operator clicking buttons that silently do nothing. The
 * response is still returned, so a caller that wants to show its own message
 * can.
 */
export async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
    Authorization: token ? `Bearer ${token}` : '',
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 || res.status === 403) {
    logout();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin/login')) {
      window.location.replace('/admin/login?expired=1');
    }
  }

  return res;
}
