import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import AdminGuard from '../../components/AdminGuard';
import AdminNav from '../../components/AdminNav';
import Pagination from '../../components/Pagination';
import { authFetch } from '../../lib/auth';
import { API_URL, CATEGORIES, categoryLabel, formatDate, fetchJobs } from '../../lib/api';

const STATUS_PILL = {
  ACTIVE: 'pill-green',
  UPCOMING: 'pill-amber',
  CLOSED: 'pill-grey',
};

/** Denser than the public pages: this is a work queue, not something to read. */
const PAGE_SIZE = 25;

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

  async function handleDelete(id, postName) {
    if (!confirm(`Delete "${postName}"? This can't be undone.`)) return;
    try {
      const res = await authFetch(`${API_URL}/jobs/${id}`, { method: 'DELETE' });
      if (res.status === 401 || res.status === 403) throw new Error('Session expired. Please log in again.');
      if (!res.ok) throw new Error('Delete failed.');
      // Refetch rather than splice the row out: one row leaving shifts every
      // page after it, and the count in the heading would go stale.
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
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
          {loading && <p className="muted" style={{ marginTop: 16 }}>Loading jobs…</p>}

          {!loading && !error && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Post name</th>
                    <th>Category</th>
                    <th style={{ color: 'var(--red)' }}>Last date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(job => (
                    <tr key={job.id}>
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
