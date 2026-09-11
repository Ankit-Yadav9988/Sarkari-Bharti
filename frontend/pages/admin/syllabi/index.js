import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import AdminGuard from '../../../components/AdminGuard';
import AdminNav from '../../../components/AdminNav';
import Pagination from '../../../components/Pagination';
import { authFetch } from '../../../lib/auth';
import { API_URL, categoryLabel, formatDate, fetchSyllabi } from '../../../lib/api';

const PAGE_SIZE = 25;

export default function ManageSyllabi() {
  const [syllabi, setSyllabi] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (uiPage) => {
    setLoading(true);
    const res = await fetchSyllabi({ page: uiPage, size: PAGE_SIZE });
    if (res.backendError) {
      setError('Could not load. Is the backend running?');
      setSyllabi([]);
    } else {
      setError('');
      setSyllabi(res.items);
      setTotalPages(res.totalPages);
      setTotal(res.totalItems);
      if (res.page !== uiPage) setPage(res.page);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  async function handleDelete(id, title) {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    try {
      const res = await authFetch(`${API_URL}/syllabi/${id}`, { method: 'DELETE' });
      if (res.status === 401 || res.status === 403) throw new Error('Session expired. Please log in again.');
      if (!res.ok) throw new Error('Delete failed.');
      // Reload rather than splice the row out: a deletion pulls a row up from
      // the next page and drops the count in the heading.
      const lastRowOnPage = syllabi.length === 1 && page > 1;
      if (lastRowOnPage) setPage(p => p - 1); else load(page);
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>
              Syllabi
              {!loading && !error && (
                <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 400, marginLeft: 8 }}>{total}</span>
              )}
            </h1>
            <Link href="/admin/syllabi/new" className="btn-primary">+ Add syllabus</Link>
          </div>

          {error && (
            <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</p>
          )}

          {loading ? (
            <p className="muted">Loading…</p>
          ) : syllabi.length === 0 ? (
            !error && <p className="muted">No syllabi posted yet.</p>
          ) : (
            <>
              <div className="list-card">
                {syllabi.map(s => (
                  <div key={s.id} className="row">
                    <span className="row-main">
                      <span className="row-title">{s.title}</span>
                      <span className="row-sub">
                        {[s.organization, categoryLabel(s.category), s.updatedDate ? formatDate(s.updatedDate) : null]
                          .filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="row-meta">
                      <Link href={`/admin/syllabi/edit/${s.id}`} className="btn-primary btn-secondary">Edit</Link>
                      <button onClick={() => handleDelete(s.id, s.title)} className="btn-primary btn-secondary"
                              style={{ background: '#C62828', color: '#fff', border: 'none', cursor: 'pointer' }}>
                        Delete
                      </button>
                    </span>
                  </div>
                ))}
              </div>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
