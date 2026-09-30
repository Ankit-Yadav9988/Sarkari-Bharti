import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import AdminGuard from '../../../components/AdminGuard';
import AdminNav from '../../../components/AdminNav';
import Pagination from '../../../components/Pagination';
import { authFetch } from '../../../lib/auth';
import { API_URL, NOTICE_TYPES, noticeTypeLabel, categoryLabel, formatDate, fetchNotices } from '../../../lib/api';
import { deleteNotices, describeDeleteResult } from '../../../lib/adminNotices';

const PAGE_SIZE = 25;

/** How many titles to list in the confirmation before summarising the rest. */
const TITLES_IN_CONFIRM = 8;

export default function ManageNotices() {
  const router = useRouter();
  const type = NOTICE_TYPES.some(t => t.value === router.query.type) ? router.query.type : 'ADMIT_CARD';

  const [notices, setNotices] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Ids ticked for a bulk delete. Cleared on every refetch, below.
  const [selected, setSelected] = useState(() => new Set());

  const load = useCallback(async (uiPage) => {
    setLoading(true);
    const res = await fetchNotices({ type, page: uiPage, size: PAGE_SIZE });
    if (res.backendError) {
      setError('Could not load. Is the backend running?');
    } else {
      setError('');
      setNotices(res.items);
      setTotalPages(res.totalPages);
      setTotal(res.totalItems);
      if (res.page !== uiPage) setPage(res.page);
    }
    // Cleared whenever the rows change, which is a safety rule rather than
    // tidiness: the checkboxes only exist for the page on screen, so keeping a
    // selection across a page turn or a type switch would let one click delete
    // rows the admin can no longer see.
    setSelected(new Set());
    setLoading(false);
  }, [type]);

  // Switching type is a URL change, so reset to the first page with it.
  useEffect(() => { setPage(1); }, [type]);

  useEffect(() => { if (router.isReady) load(page); }, [router.isReady, load, page]);

  const allSelected = notices.length > 0 && notices.every(n => selected.has(n.id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggleOne(id) {
    setNotice('');
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** Selects or clears the current page only, which is all the boxes there are. */
  function toggleAll() {
    setNotice('');
    setSelected(allSelected ? new Set() : new Set(notices.map(n => n.id)));
  }

  /** Titles, not a number: the count is the part that is wrong when this goes wrong. */
  function describe(titles) {
    const shown = titles.slice(0, TITLES_IN_CONFIRM);
    const rest = titles.length - shown.length;
    const list = shown.map(title => `• ${title}`).join('\n');
    return rest > 0 ? `${list}\n• ...and ${rest} more` : list;
  }

  async function handleBulkDelete() {
    // Titles are read off the rows on screen rather than out of the selection
    // set, so the confirmation describes what the admin is looking at.
    const chosen = notices.filter(n => selected.has(n.id));
    if (chosen.length === 0 || busy) return;

    const label = noticeTypeLabel(type).toLowerCase();
    const noun = chosen.length === 1 ? label : `${label}s`;
    const ok = confirm(
      `Delete ${chosen.length} ${noun}?\n\n`
      + `${describe(chosen.map(n => n.title))}\n\n`
      + 'This cannot be undone. There is no trash for notices — unlike job '
      + 'postings, these cannot be restored afterwards.'
    );
    if (!ok) return;

    setBusy(true);
    setNotice('');
    try {
      const result = await deleteNotices(chosen.map(n => n.id));
      setNotice(describeDeleteResult(result));
    } catch (err) {
      // Stopped early. Whatever got through still got through, and saying so is
      // the difference between the admin retrying the rest and retrying all of
      // it on top of a half-finished delete.
      const done = err.progress && err.progress.changed;
      alert(done ? `${err.message}\n\n${done} were deleted before it stopped.` : err.message);
    } finally {
      setBusy(false);
      // Refetch either way: rows leaving shift every page after them, and the
      // count in the heading would go stale.
      load(page);
    }
  }

  async function handleDelete(id, title) {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    try {
      const res = await authFetch(`${API_URL}/notices/${id}`, { method: 'DELETE' });
      if (res.status === 401 || res.status === 403) throw new Error('Session expired. Please log in again.');
      if (!res.ok) throw new Error('Delete failed.');
      load(page);     // a row leaving shifts every page after it
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <AdminGuard>
      <div>
        <Header />
        <div className="container" style={{ paddingTop: 16, paddingBottom: 40 }}>
          <AdminNav />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <h1 style={{ margin: 0 }}>
              Manage {noticeTypeLabel(type).toLowerCase()}s
              {!loading && !error && (
                <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 400, marginLeft: 8 }}>{total}</span>
              )}
            </h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href={`/admin/import-notices?type=${type}`} className="btn-ghost">Import CSV</Link>
              <Link href={`/admin/notices/new?type=${type}`} className="btn-primary">+ Post {noticeTypeLabel(type).toLowerCase()}</Link>
            </div>
          </div>

          {/* Type switcher */}
          <div className="chip-row" style={{ marginTop: 16 }}>
            {NOTICE_TYPES.map(t => (
              <Link key={t.value} href={`/admin/notices?type=${t.value}`}
                    className={type === t.value ? 'chip chip-active' : 'chip'}>
                {t.label}
              </Link>
            ))}
          </div>

          {error && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 16 }}>{error}</p>}
          {notice && <p className="pill-green" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 16 }}>{notice}</p>}
          {loading && <p className="muted" style={{ marginTop: 16 }}>Loading…</p>}

          {/* Only rendered when something is ticked, so the destructive button is
              not sitting on screen waiting to be clicked by accident. */}
          {!loading && !error && selected.size > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
              marginTop: 16, padding: '10px 14px', borderRadius: 8,
              background: '#FFF6F6', border: '1px solid #E8C9C9',
            }}>
              <strong>{selected.size} selected</strong>
              <span className="muted" style={{ fontSize: '0.85rem' }}>on this page</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => setSelected(new Set())} className="btn-ghost" disabled={busy}>
                Clear
              </button>
              <button onClick={handleBulkDelete} disabled={busy}
                      style={{
                        background: '#A32D2D', color: '#fff', border: 'none',
                        padding: '8px 14px', borderRadius: 6, fontWeight: 600,
                        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                      }}>
                {busy ? 'Deleting…' : `Delete ${selected.size}`}
              </button>
            </div>
          )}

          {!loading && !error && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      {/* indeterminate is not an attribute, only a property, so
                          it has to be set on the node itself. */}
                      <input type="checkbox"
                             aria-label={`Select all ${noticeTypeLabel(type).toLowerCase()}s on this page`}
                             checked={allSelected}
                             ref={el => { if (el) el.indeterminate = someSelected; }}
                             onChange={toggleAll}
                             disabled={busy || notices.length === 0} />
                    </th>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Released</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {notices.map(n => (
                    <tr key={n.id} style={selected.has(n.id) ? { background: '#FFF9F9' } : undefined}>
                      <td>
                        {/* Frozen while a delete runs. `handleBulkDelete` took
                            its list of rows before starting, so a tick made now
                            would not join the delete in progress — it would only
                            make the "N selected" count above disagree with what
                            is actually being deleted. */}
                        <input type="checkbox"
                               aria-label={`Select ${n.title}`}
                               checked={selected.has(n.id)}
                               onChange={() => toggleOne(n.id)}
                               disabled={busy} />
                      </td>
                      <td>{n.title}</td>
                      <td className="muted">{categoryLabel(n.category)}</td>
                      <td className="muted">{formatDate(n.releaseDate) || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link href={`/admin/notices/edit/${n.id}`} style={{ marginRight: 12 }}>Edit</Link>
                        <button onClick={() => handleDelete(n.id, n.title)} disabled={busy}
                                style={{ background: 'none', border: 'none', color: '#A32D2D', cursor: busy ? 'default' : 'pointer', padding: 0, font: 'inherit' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {notices.length === 0 && (
                <p className="muted" style={{ marginTop: 16 }}>Nothing posted here yet.</p>
              )}

              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
