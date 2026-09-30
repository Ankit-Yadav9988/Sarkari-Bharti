// Bulk delete for the notices screen.
//
// WHY THIS IS NOT ONE REQUEST
//
// Jobs get their bulk actions from real server endpoints under /api/admin/jobs
// (see lib/adminJobs.js), which is the better design: one request, one
// transaction, one count to report. Notices have no such endpoint. This file
// deletes them one at a time through the DELETE /api/notices/{id} route the
// per-row Delete button already uses.
//
// That is a deliberate choice, not an oversight. Adding POST /api/admin/notices/
// bulk-delete means Java, and the Java side could not be compiled or run where
// this was written -- so it would have shipped unproven, on the one operation
// in the application that erases data. A loop over a route that is already in
// production and already used by this screen carries no such risk. If a bulk
// endpoint is added later, replace the body of deleteNotices with a single call
// and the screen above it need not change: the return shape is the same
// { requested, changed, skipped, failed } the job endpoints use.
//
// WHAT THIS DOES NOT DO
//
// There is no trash for notices. The Notice table has no deletedAt column, so
// this is permanent. The confirmation wording on the screen says so.

import { API_URL } from './api';
import { authFetch } from './auth';

/**
 * Stop after this many consecutive failures.
 *
 * If the third one in a row has failed, the fourth will too, and firing the
 * remaining eighteen requests at a backend that is clearly unwell only makes
 * the report harder to read. The count reached is returned either way.
 */
const GIVE_UP_AFTER = 3;

/**
 * Deletes each notice in turn and reports what actually happened.
 *
 * Sequential on purpose. The backend runs on Render's free tier, and twenty
 * parallel deletes against a cold instance is how a partial failure with no
 * clear cause gets produced. One at a time is slower and legible.
 *
 * Returns { requested, changed, skipped, failed, error }:
 *   changed  deleted just now
 *   skipped  already gone (404) -- another tab, or a double-clicked button
 *   failed   the server refused, and `error` is the first reason it gave
 *
 * Throws only when carrying on is pointless: an expired session (authFetch has
 * already started the redirect) or a backend that is still waking up. Both
 * throw an Error whose `progress` property carries the counts reached, so the
 * screen can still tell the admin what got through.
 */
export async function deleteNotices(ids) {
  const list = Array.from(ids || [])
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0);

  const result = { requested: list.length, changed: 0, skipped: 0, failed: 0, error: '' };
  let consecutiveFailures = 0;

  const stop = message => {
    const err = new Error(message);
    err.progress = { ...result };
    return err;
  };

  for (const id of list) {
    let res;
    try {
      res = await authFetch(`${API_URL}/notices/${id}`, { method: 'DELETE' });
    } catch {
      throw stop('Lost the connection to the server. Check your connection and try again.');
    }

    if (res.status === 401 || res.status === 403) {
      throw stop('Session expired. Please log in again.');
    }
    if (res.status === 503) {
      throw stop('The server is waking up. Wait a few seconds and try the rest again.');
    }

    if (res.ok) {
      result.changed += 1;
      consecutiveFailures = 0;
      continue;
    }
    if (res.status === 404) {
      // Not an error worth showing as one: the row is gone, which is the
      // outcome that was asked for.
      result.skipped += 1;
      consecutiveFailures = 0;
      continue;
    }

    result.failed += 1;
    consecutiveFailures += 1;
    if (!result.error) {
      let body = null;
      try { body = await res.json(); } catch { body = null; }
      result.error = (body && body.error) || `the server answered ${res.status}`;
    }
    if (consecutiveFailures >= GIVE_UP_AFTER) {
      result.error = `${result.error} — stopped after ${consecutiveFailures} failures in a row, `
        + `so ${list.length - result.changed - result.skipped - result.failed} were not attempted`;
      break;
    }
  }

  return result;
}

/**
 * The sentence the screen shows afterwards.
 *
 * Every number that is not zero is named. A bulk delete that half worked and
 * said "Done" is how an admin comes to believe the site is lying to them.
 */
export function describeDeleteResult(result) {
  const noun = result.changed === 1 ? 'notice' : 'notices';
  const parts = [`Deleted ${result.changed} ${noun}.`];
  if (result.skipped > 0) {
    parts.push(`${result.skipped} had already been removed — another tab may have done it.`);
  }
  if (result.failed > 0) {
    parts.push(`${result.failed} could not be deleted (${result.error}). Try those again.`);
  }
  return parts.join(' ');
}
