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

const PAGE_SIZE = 25;

export default function ManageNotices() {
  const router = useRouter();
  const type = NOTICE_TYPES.some(t => t.value === router.query.type) ? router.query.type : 'ADMIT_CARD';

  const [notices, setNotices] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    setLoading(false);
  }, [type]);

  // Switching type is a URL change, so reset to the first page with it.
  useEffect(() => { setPage(1); }, [type]);

  useEffect(() => { if (router.isReady) load(page); }, [router.isReady, load, page]);

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
            <Link href={`/admin/notices/new?type=${type}`} className="btn-primary">+ Post {noticeTypeLabel(type).toLowerCase()}</Link>
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
          {loading && <p className="muted" style={{ marginTop: 16 }}>Loading…</p>}

          {!loading && !error && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Released</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {notices.map(n => (
                    <tr key={n.id}>
                      <td>{n.title}</td>
                      <td className="muted">{categoryLabel(n.category)}</td>
                      <td className="muted">{formatDate(n.releaseDate) || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link href={`/admin/notices/edit/${n.id}`} style={{ marginRight: 12 }}>Edit</Link>
                        <button onClick={() => handleDelete(n.id, n.title)}
                                style={{ background: 'none', border: 'none', color: '#A32D2D', cursor: 'pointer', padding: 0, font: 'inherit' }}>
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
