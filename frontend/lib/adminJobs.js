// The admin-only job housekeeping endpoints: bulk trash, restore, permanent
// delete, and the duplicate finder.
//
// These live under /api/admin/jobs, not /api/jobs. That is a security boundary,
// not a tidiness preference: the backend makes every GET under /api/jobs public,
// so a "list the trash" route added there would have been readable by anyone.
// Nothing under /api/admin is in the public allowlist, so these all require the
// admin token. Keep new admin routes on this side of the line.
//
// Everything here goes through authFetch, which attaches the token and sends the
// browser to the login page on 401/403.

import { API_URL } from './api';
import { authFetch } from './auth';

/** API_URL already ends in /api, so this is /api/admin/jobs. */
const ADMIN_JOBS = `${API_URL}/admin/jobs`;

/**
 * One request, one readable error.
 *
 * The backend's error handler answers with {"error": "..."} for anything a
 * caller can act on, so that message is preferred over inventing one here. The
 * status-code fallbacks exist because a 502 from Render's proxy or a cold-start
 * 503 never reaches that handler and so has no JSON body at all.
 */
async function adminJson(path, options = {}) {
  let res;
  try {
    res = await authFetch(`${ADMIN_JOBS}${path}`, options);
  } catch {
    // Thrown by fetch itself: no network, DNS failure, or the backend refusing
    // the connection outright. There is no response to read a message from.
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  if (res.status === 401 || res.status === 403) {
    // authFetch has already cleared the token and started the redirect. Throwing
    // stops the caller treating this as a successful empty result and flashing
    // "0 jobs" on the way out.
    throw new Error('Session expired. Please log in again.');
  }

  if (res.status === 503) {
    throw new Error('The server is waking up. Wait a few seconds and try again.');
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;                  // empty or non-JSON response
  }

  if (!res.ok) {
    throw new Error(
      (body && body.error) || `Request failed (${res.status}). Please try again.`
    );
  }

  return body;
}

/** POST with a JSON body. */
function post(path, payload) {
  return adminJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Normalises whatever a screen passes in into a clean array of numeric ids.
 *
 * Selection state is held in a Set keyed by job id, and ids that arrive from a
 * checkbox's value have been through the DOM and come back as strings. Sending
 * "12" where the server expects a number is the kind of thing that works until
 * it doesn't, so the conversion happens once, here.
 */
function toIds(ids) {
  return Array.from(ids || [])
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0);
}

// ---- bulk actions ----
//
// All three return { requested, changed, skipped }. changed is the number the
// screen should report, and it can legitimately be lower than requested: two
// tabs open, a double-clicked button, or an id someone else already actioned.

/** Hide these jobs from the site, keeping them restorable. */
export function trashJobs(ids) {
  return post('/trash', { ids: toIds(ids) });
}

/** Put these trashed jobs back on the site. */
export function restoreJobs(ids) {
  return post('/restore', { ids: toIds(ids) });
}

/**
 * Delete these trashed jobs for good.
 *
 * The one irreversible call in the application. The server ignores ids that are
 * not already in the trash, so a live posting cannot be destroyed by this even
 * if the wrong list is sent -- but the confirmation still belongs in the UI,
 * because "nothing happened" is not the outcome the admin was expecting.
 */
export function purgeJobs(ids) {
  return post('/purge', { ids: toIds(ids) });
}

// ---- reads ----

/** Everything in the trash, most recently deleted first. */
export function fetchTrash() {
  return adminJson('/trash');
}

/**
 * Just the number in the trash, for the link on the manage screen.
 *
 * Separate from fetchTrash so rendering "Trash (3)" does not pull down a trash
 * that has been accumulating for a year.
 */
export async function fetchTrashCount() {
  const body = await adminJson('/trash/count');
  return body && typeof body.count === 'number' ? body.count : 0;
}

/**
 * Live jobs that share a post name and organisation, grouped, worst first.
 *
 * A group is not proof of a mistake. Two postings for the same post at the same
 * body in different years are correct and normal, which is why the server marks
 * the members it believes are genuine repeats (same post, same body, same last
 * date) rather than leaving the screen to guess.
 */
export function fetchDuplicates() {
  return adminJson('/duplicates');
}

/**
 * Asks which of these rows already exist, before the importer publishes them.
 *
 * rows is [{ postName, organization, lastDate }], and the response identifies
 * matches by their index in that array -- so the array passed in must be in the
 * same order as the rows on screen, and must not be filtered in between.
 */
export async function checkDuplicates(rows) {
  const body = await post('/duplicate-check', { rows });
  return body && Array.isArray(body.matches) ? body.matches : [];
}

/**
 * Formats an instant like "2026-09-24T10:33:07.412Z" as "24 Sep 2026, 4:03 pm".
 *
 * formatDate() in lib/api.js cannot be used for these. It appends 'T00:00:00' to
 * turn a bare "2026-07-20" into a local date, which is right for a last date but
 * produces "...ZT00:00:00" for a timestamp -- an invalid date that it then hands
 * back as the raw string. deletedAt and createdAt are both full instants, so
 * they get their own formatter rather than a silently unformatted one.
 *
 * Rendered in the browser's local zone, which for the one person using these
 * screens is IST.
 */
export function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}
