import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import AdminGuard from '../../components/AdminGuard';
import AdminNav from '../../components/AdminNav';
import { authFetch } from '../../lib/auth';
import {
  API_URL, fetchJobs, fetchNotices, formatDate, jobHref, noticeTypeLabel,
} from '../../lib/api';
import { SITE, absoluteUrl } from '../../lib/site';

/**
 * "Send alert" — mails the subscriber list about specific jobs and results.
 *
 * Items are *picked from the live lists*, never typed. That is the whole design
 * of this screen: a hand-typed alert is how a mail goes out to every subscriber
 * with a link to a page that does not exist, and there is no recalling it. Here
 * the title and the URL both come from the row that is already on the site, so
 * the worst case is a correct link to something the admin did not mean to
 * feature.
 *
 * Sending happens on the server's background thread, so this page starts it and
 * then polls. A consequence worth knowing: progress lives on the server, so
 * reloading this page mid-send shows the real state rather than losing it.
 */

/** How many recent rows to offer. Past this the picker needs a search field. */
const LIST_SIZE = 25;

/** Matches BroadcastService.MAX_ITEMS — the server refuses more than this. */
const MAX_ITEMS = 30;

/** Where a notice with no linked job sends the reader on this site. */
const NOTICE_PATH = {
  ADMIT_CARD: '/admit-card',
  RESULT: '/result',
  ANSWER_KEY: '/answer-key',
};

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function jobItem(job) {
  return {
    title: job.postName,
    url: absoluteUrl(jobHref(job)),
    meta: [
      job.organization,
      job.totalPosts ? `${job.totalPosts.toLocaleString('en-IN')} posts` : null,
      job.lastDate ? `Last date: ${formatDate(job.lastDate)}` : null,
    ].filter(Boolean).join(' · '),
  };
}

/**
 * Where a result or admit card in an alert should point.
 *
 * A notice attached to a job goes to that job's page, which shows it in context
 * with every other date and link for the same posting. A standalone notice has
 * no page of its own here, so it goes to its official link — the same place the
 * site's own notice rows go, so the email and the site cannot disagree. If that
 * link is somehow not an http(s) URL it falls back to the section listing,
 * because the server rejects the whole send over one bad link and losing an
 * alert to a malformed row would be a poor trade.
 */
function noticeItem(notice) {
  const url = notice.jobId
    ? absoluteUrl(`/jobs/${notice.jobSlug || notice.jobId}`)
    : isHttpUrl(notice.link)
      ? notice.link
      : absoluteUrl(NOTICE_PATH[notice.type] || '/');

  return {
    title: notice.title,
    url,
    meta: [
      noticeTypeLabel(notice.type),
      notice.organization,
      notice.releaseDate ? formatDate(notice.releaseDate) : null,
    ].filter(Boolean).join(' · '),
  };
}

function todaySubject() {
  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  return `${SITE.name} — new jobs & results (${today})`;
}

export default function SendAlert() {
  const [status, setStatus] = useState(null);
  const [subscriberCount, setSubscriberCount] = useState(null);

  const [jobs, setJobs] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [listError, setListError] = useState(false);

  // Keyed "job:12" / "notice:4" so the two id spaces cannot collide.
  const [picked, setPicked] = useState({});
  const [subject, setSubject] = useState('');
  const [heading, setHeading] = useState('');
  const [sendError, setSendError] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/subscribers/broadcast`);
      if (!res.ok) return;
      setStatus(await res.json());
    } catch {
      // A dropped poll is not worth a message on screen; the next one wins.
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Poll only while something is actually running. The dependency is the
  // boolean, not the whole status object — keying it on `status` would tear the
  // interval down and rebuild it on every single poll.
  useEffect(() => {
    if (!status?.running) return undefined;
    const timer = setInterval(loadStatus, 2000);
    return () => clearInterval(timer);
  }, [status?.running, loadStatus]);

  // The subject carries today's date, so it is set after mount rather than in
  // useState. Building it during render would bake the prerender's date into
  // the HTML and then disagree with the browser at hydration.
  useEffect(() => { setSubject(todaySubject()); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [jobRes, noticeRes, subRes] = await Promise.all([
        fetchJobs({ page: 1, size: LIST_SIZE }),
        fetchNotices({ page: 1, size: LIST_SIZE }),
        // size=1 because only the count is wanted. The rows would be thrown
        // away, and they are the one piece of personal data here.
        authFetch(`${API_URL}/subscribers?page=0&size=1`)
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (cancelled) return;
      setJobs(jobRes.items || []);
      setNotices(noticeRes.items || []);
      setListError(Boolean(jobRes.backendError || noticeRes.backendError));
      if (subRes && typeof subRes.totalElements === 'number') {
        setSubscriberCount(subRes.totalElements);
      }
      setLoadingLists(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const pickedKeys = useMemo(() => Object.keys(picked), [picked]);
  const items = useMemo(() => pickedKeys.map(k => picked[k]), [picked, pickedKeys]);

  function toggle(key, item) {
    setSendError('');
    setPicked(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = item;
      return next;
    });
  }

  const running = Boolean(status?.running);
  const configured = status ? status.configured : true;
  const overLimit = items.length > MAX_ITEMS;
  const canSend = configured && !running && items.length > 0 && !overLimit
    && subject.trim().length > 0;

  async function handleSend() {
    if (!canSend) return;
    const audience = subscriberCount == null
      ? 'every subscriber'
      : `${subscriberCount} subscriber${subscriberCount === 1 ? '' : 's'}`;
    if (!confirm(
      `Email ${items.length} item${items.length === 1 ? '' : 's'} to ${audience}?\n\n`
      + 'This cannot be undone or recalled.'
    )) return;

    setSendError('');
    try {
      const res = await authFetch(`${API_URL}/subscribers/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          heading: heading.trim() || null,
          items,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSendError(data?.error || data?.message || `The server refused it (${res.status}).`);
        return;
      }
      // The 202 body is the opening status snapshot, which flips `running` and
      // so starts the poll above.
      setStatus(data);
      setPicked({});
    } catch (err) {
      setSendError(err.message || 'Could not reach the server.');
    }
  }

  return (
    <AdminGuard>
      <div>
        <Header />
        <div className="container" style={{ paddingTop: 16, paddingBottom: 40 }}>
          <AdminNav />

          <h1 style={{ margin: 0 }}>Send a job alert</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            Pick what to feature, check the subject, send.{' '}
            {subscriberCount != null && (
              <>Goes to <strong>{subscriberCount}</strong> subscriber{subscriberCount === 1 ? '' : 's'}. </>
            )}
            <Link href="/admin/subscribers">Manage the list →</Link>
          </p>

          {status && !configured && <NotConfigured />}

          {(running || status?.startedAt) && <Progress status={status} />}

          {listError && (
            <div className="pill-amber" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 14 }}>
              Could not load the latest rows from the server. Reload to try again — sending with a
              half-loaded list would leave things out.
            </div>
          )}

          <label className="field-label" style={{ marginTop: 18 }}>Subject line</label>
          <input
            className="input"
            value={subject}
            maxLength={150}
            onChange={e => { setSubject(e.target.value); setSendError(''); }}
            placeholder={`${SITE.name} — new jobs & results`}
          />

          <label className="field-label" style={{ marginTop: 12 }}>
            Heading inside the email <span className="muted">(optional)</span>
          </label>
          <input
            className="input"
            value={heading}
            maxLength={200}
            onChange={e => setHeading(e.target.value)}
            placeholder={`Latest updates from ${SITE.name}`}
          />

          <PickList
            title="Recent job postings"
            emptyLabel="No job postings yet."
            loading={loadingLists}
            rows={jobs}
            keyFor={job => `job:${job.id}`}
            itemFor={jobItem}
            picked={picked}
            onToggle={toggle}
            disabled={running}
          />

          <PickList
            title="Recent results, admit cards & answer keys"
            emptyLabel="No results or admit cards yet."
            loading={loadingLists}
            rows={notices}
            keyFor={notice => `notice:${notice.id}`}
            itemFor={noticeItem}
            picked={picked}
            onToggle={toggle}
            disabled={running}
          />

          <h2 style={{ marginTop: 26, marginBottom: 6 }}>
            Preview {items.length > 0 && <span className="muted">({items.length} selected)</span>}
          </h2>

          {items.length === 0 ? (
            <p className="muted">Tick something above to build the email.</p>
          ) : (
            <div className="list-card">
              {items.map((item, i) => (
                <div key={pickedKeys[i]} className="row">
                  <span className="row-main">
                    <span className="row-title">{item.title}</span>
                    <span className="row-sub">
                      {item.meta}
                      <br />
                      {/* Shown because it is the one thing that cannot be
                          checked after the fact. */}
                      <span style={{ wordBreak: 'break-all', opacity: 0.75 }}>{item.url}</span>
                    </span>
                  </span>
                  <span className="row-meta">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => toggle(pickedKeys[i], item)}
                      disabled={running}
                    >
                      Remove
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {overLimit && (
            <div className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 12 }}>
              {items.length} items selected. An alert carries at most {MAX_ITEMS} — anything longer
              stops being read. Send the rest as a second alert.
            </div>
          )}

          {sendError && (
            <div className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 12 }}>
              {sendError}
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <button type="button" className="btn-primary" onClick={handleSend} disabled={!canSend}>
              {running
                ? 'A send is already running…'
                : `Send to ${subscriberCount == null ? 'subscribers' : subscriberCount}`}
            </button>
            <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
              Every email carries a one-click unsubscribe link. There is no way to recall a send.
            </p>
          </div>
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}

/** Shown when the server has no SMTP settings — the state of a fresh deploy. */
function NotConfigured() {
  return (
    <div className="pill-amber" style={{ padding: '12px 14px', borderRadius: 8, marginTop: 14 }}>
      <strong>Email is not set up on the server yet.</strong>
      <p className="small" style={{ margin: '6px 0 0' }}>
        Sign up for a free mail provider, then set <code>MAIL_ENABLED=true</code> along with{' '}
        <code>MAIL_HOST</code>, <code>MAIL_USERNAME</code>, <code>MAIL_PASSWORD</code> and{' '}
        <code>MAIL_FROM_ADDRESS</code> on the backend and redeploy. The step-by-step version is in{' '}
        <code>SETUP-EMAIL.md</code> in the project root. Subscribers are still being collected in the
        meantime — nothing is lost by setting this up later.
      </p>
    </div>
  );
}

/** Live progress, and the result of the last send once it is over. */
function Progress({ status }) {
  if (!status) return null;
  const done = status.sent + status.failed;
  const pct = status.total > 0 ? Math.round((done / status.total) * 100) : 0;
  const finished = !status.running && status.finishedAt;

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>
        {status.running ? 'Sending…' : 'Last send'}
        {status.subject && <span className="muted" style={{ fontWeight: 400 }}> — {status.subject}</span>}
      </p>

      <div
        style={{
          height: 8, borderRadius: 4, background: 'var(--surface-2)',
          overflow: 'hidden', margin: '10px 0',
        }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--maroon)' }} />
      </div>

      <p className="small" style={{ margin: 0 }}>
        {status.sent} sent
        {status.failed > 0 && <span style={{ color: '#a11019' }}> · {status.failed} failed</span>}
        {status.total > 0 && <span className="muted"> · of {status.total}</span>}
        {finished && <span className="muted"> · finished {new Date(status.finishedAt).toLocaleTimeString()}</span>}
      </p>

      {status.error && (
        <p className="small" style={{ color: '#a11019', margin: '8px 0 0' }}>
          First error: {status.error}
        </p>
      )}

      {/* A send that was cut off mid-flight — a redeploy, or the free instance
          sleeping — leaves no finish time. Saying so beats a progress bar that
          sits at 60% forever with no explanation. */}
      {!status.running && !status.finishedAt && status.startedAt && (
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          This send did not record a finish time, which usually means the server restarted while it
          was running. {status.sent} message{status.sent === 1 ? '' : 's'} had gone out by then.
        </p>
      )}
    </div>
  );
}

/** A checkbox list over one content type. */
function PickList({ title, emptyLabel, loading, rows, keyFor, itemFor, picked, onToggle, disabled }) {
  return (
    <>
      <h2 style={{ marginTop: 22, marginBottom: 6 }}>{title}</h2>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">{emptyLabel}</p>
      ) : (
        <div className="list-card">
          {rows.map(row => {
            const key = keyFor(row);
            const item = itemFor(row);
            return (
              <label
                key={key}
                className="row"
                style={{ cursor: disabled ? 'default' : 'pointer', alignItems: 'flex-start' }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(picked[key])}
                  onChange={() => onToggle(key, item)}
                  disabled={disabled}
                  style={{ marginRight: 10, marginTop: 4, width: 16, height: 16, flexShrink: 0 }}
                />
                <span className="row-main">
                  <span className="row-title">{item.title}</span>
                  <span className="row-sub">{item.meta}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </>
  );
}
