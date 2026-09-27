import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import AdminGuard from '../../components/AdminGuard';
import AdminNav from '../../components/AdminNav';
import Pagination from '../../components/Pagination';
import { authFetch } from '../../lib/auth';
import { API_URL, CATEGORIES, categoryLabel, formatDate, fetchJobs } from '../../lib/api';
import { trashJobs, fetchTrashCount } from '../../lib/adminJobs';

const STATUS_PILL = {
  ACTIVE: 'pill-green',
  UPCOMING: 'pill-amber',
  CLOSED: 'pill-grey',
};

/** Denser than the public pages: this is a work queue, not something to read. */
const PAGE_SIZE = 25;

/**
 * How many post names a confirmation dialog spells out before it gives up and
 * counts the rest.
 *
 * The point of naming them is so the admin can catch a wrong selection before
 * it happens. Past roughly this many, a wall of text in a native confirm() stops
 * being read, and an unread list is worse than a count because it looks like
 * due diligence.
 */
const NAMES_IN_CONFIRM = 8;

export default function ManageJobs() {
  const [jobs, setJobs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  // Ids ticked for a bulk action. Deliberately reset on every refetch -- see
  // the fetch effect below.
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [trashCount, setTrashCount] = useState(null);

  // Filtering moved to the server, so a keystroke is now a query. Wait for a
  // pause in typing instead of firing one per character.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchJobs({
      category: categoryFilter === 'ALL' ? null : categoryFilter,
      status: statusFilter === 'ALL' ? null : statusFilter,
      search: appliedSearch || null,
      page,
      size: PAGE_SIZE,
    }).then(res => {
      if (cancelled) return;

      // Clearing the selection whenever the visible rows change is a safety
      // rule, not tidiness. Selection is a set of ids and the checkboxes only
      // ever show one page, so a selection that survived a page change or a
      // filter change would let a bulk delete act on rows the admin can no
      // longer see -- and the confirmation would name them, which is no help
      // when the mistake is that they were never meant to be chosen.
      setSelected(new Set());

      if (res.backendError) {
        setError('Could not load jobs. Is the backend running?');
      } else {
        setError('');
        setJobs(res.items);
        setTotalPages(res.totalPages);
        setTotal(res.totalItems);
        // Deleting the last row on the last page leaves this state pointing
        // past the end. The fetch already fell back to the last real page, so
        // follow it; that settles in one step because the value it returns is
        // always in range.
        if (res.page !== page) setPage(res.page);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [categoryFilter, statusFilter, appliedSearch, page, reloadToken]);

  // The trash count is decoration on a link, so a failure here is swallowed.
  // Losing the number is not worth an error banner on a screen whose actual job
  // -- the list above -- loaded fine.
  useEffect(() => {
    let cancelled = false;
    fetchTrashCount()
      .then(n => { if (!cancelled) setTrashCount(n); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reloadToken]);

  const allSelected = jobs.length > 0 && jobs.every(job => selected.has(job.id));
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
    setSelected(allSelected ? new Set() : new Set(jobs.map(job => job.id)));
  }

  /**
   * Builds the body of a confirmation so the admin reads post names rather than
   * a number. The count comes first because that is the part that is wrong when
   * something has gone wrong.
   */
  function describe(names) {
    const shown = names.slice(0, NAMES_IN_CONFIRM);
    const rest = names.length - shown.length;
    const list = shown.map(name => `• ${name}`).join('\n');
    return rest > 0 ? `${list}\n• ...and ${rest} more` : list;
  }

  /** "Moved 3 of 4..." only when the two numbers differ, which they rarely do. */
  function reportBulk(result) {
    const noun = result.changed === 1 ? 'posting' : 'postings';
    if (result.skipped > 0) {
      return `Moved ${result.changed} of ${result.requested} to the trash. `
        + `${result.skipped} were already gone -- another tab may have removed them.`;
    }
    return `Moved ${result.changed} ${noun} to the trash. You can restore them from Trash.`;
  }

  async function handleBulkTrash() {
    // Read the names off the rows on screen, not out of the selection set: the
    // confirmation has to describe what the admin is looking at.
    const chosen = jobs.filter(job => selected.has(job.id));
    if (chosen.length === 0 || busy) return;

    const noun = chosen.length === 1 ? 'posting' : 'postings';
    const ok = confirm(
      `Move ${chosen.length} ${noun} to the trash?\n\n`
      + `${describe(chosen.map(job => job.postName))}\n\n`
      + 'They will disappear from the site straight away. Nothing is erased -- '
      + 'you can put them back from the Trash screen.'
    );
    if (!ok) return;

    setBusy(true);
    setNotice('');
    try {
      const result = await trashJobs(chosen.map(job => job.id));
      setNotice(reportBulk(result));
      // Refetch rather than splice the rows out: rows leaving shift every page
      // after them, and the count in the heading would go stale.
      setReloadToken(n => n + 1);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id, postName) {
    // Wording matters here. This used to say "This can't be undone", which has
    // been untrue since delete became recoverable; a warning the admin learns
    // to distrust is worse than no warning.
    if (!confirm(`Move "${postName}" to the trash?\n\nYou can restore it from the Trash screen.`)) return;
    try {
      const res = await authFetch(`${API_URL}/jobs/${id}`, { method: 'DELETE' });
      if (res.status === 401 || res.status === 403) throw new Error('Session expired. Please log in again.');
      if (!res.ok) throw new Error('Delete failed.');
      setNotice(`"${postName}" moved to the trash.`);
      setReloadToken(n => n + 1);
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
              Manage jobs
              {!loading && !error && (
                <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 400, marginLeft: 8 }}>
                  {total} {total === 1 ? 'posting' : 'postings'}
                </span>
              )}
            </h1>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href="/admin/duplicates" className="btn-ghost">Find duplicates</Link>
              <Link href="/admin/trash" className="btn-ghost">
                Trash{typeof trashCount === 'number' && trashCount > 0 ? ` (${trashCount})` : ''}
              </Link>
              <Link href="/admin/import" className="btn-ghost">Import CSV</Link>
              <Link href="/admin/add-job" className="btn-primary">+ Add job</Link>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="input" style={{ marginTop: 0, width: 'auto' }} value={categoryFilter}
                    onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}>
              <option value="ALL">All categories</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>

            <select className="input" style={{ marginTop: 0, width: 'auto' }} value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="ALL">All status</option>
              <option value="ACTIVE">Active</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="CLOSED">Closed</option>
            </select>

            <input className="input" style={{ marginTop: 0, flex: 1, minWidth: 180 }}
                   placeholder="Search post or organization"
                   value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {error && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 16 }}>{error}</p>}
          {notice && <p className="pill-green" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 16 }}>{notice}</p>}
          {loading && <p className="muted" style={{ marginTop: 16 }}>Loading jobs…</p>}

          {/* Only rendered when something is ticked, so the destructive button
              is not sitting on screen waiting to be clicked by accident. */}
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
              <button onClick={handleBulkTrash} disabled={busy}
                      style={{
                        background: '#A32D2D', color: '#fff', border: 'none',
                        padding: '8px 14px', borderRadius: 6, fontWeight: 600,
                        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                      }}>
                {busy ? 'Moving…' : `Move ${selected.size} to trash`}
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
                             aria-label="Select all jobs on this page"
                             checked={allSelected}
                             ref={el => { if (el) el.indeterminate = someSelected; }}
                             onChange={toggleAll}
                             disabled={jobs.length === 0} />
                    </th>
                    <th>Post name</th>
                    <th>Category</th>
                    <th style={{ color: 'var(--red)' }}>Last date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(job => (
                    <tr key={job.id} style={selected.has(job.id) ? { background: '#FFF9F9' } : undefined}>
                      <td>
                        <input type="checkbox"
                               aria-label={`Select ${job.postName}`}
                               checked={selected.has(job.id)}
                               onChange={() => toggleOne(job.id)} />
                      </td>
                      <td>{job.postName}</td>
                      <td className="muted">{categoryLabel(job.category)}</td>
                      <td style={{ color: 'var(--red)', fontWeight: 600 }}>{formatDate(job.lastDate)}</td>
                      <td><span className={`pill ${STATUS_PILL[job.status] || 'pill-grey'}`}>{job.status}</span></td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link href={`/admin/edit-job/${job.id}`} style={{ marginRight: 12 }}>Edit</Link>
                        {/* Most new postings are last year's posting with new
                            dates. This is the shortcut for that, and it is a
                            plain link so it can be middle-clicked into a new
                            tab while this queue stays open. */}
                        <Link href={`/admin/add-job?duplicate=${job.id}`} style={{ marginRight: 12 }}>Duplicate</Link>
                        <button onClick={() => handleDelete(job.id, job.postName)}
                                style={{ background: 'none', border: 'none', color: '#A32D2D', cursor: 'pointer', padding: 0, font: 'inherit' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {jobs.length === 0 && (
                <p className="muted" style={{ marginTop: 16 }}>No jobs match these filters.</p>
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
