import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Header from './Header';
import Footer from './Footer';
import AdminGuard from './AdminGuard';
import AdminNav from './AdminNav';
import Pagination from './Pagination';
import { authFetch } from '../lib/auth';
import { API_URL } from '../lib/api';

const PAGE_SIZE = 25;

/**
 * The admin list-and-delete screen, shared by cut-offs, the exam calendar and
 * previous-year papers.
 *
 * Written once because the three were otherwise the same file three times: load a
 * page, show rows, confirm a delete, reload. The parts that actually differ are
 * the endpoint, the heading and how a row reads — so those are props and nothing
 * else is.
 *
 * The delete path is the part worth being careful about, and it is the reason this
 * is shared rather than copied: reloading after a delete instead of splicing the
 * row out of local state, stepping back a page when the last row on it goes, and
 * turning a 401 into "log in again" rather than a silent failure are three things
 * that are easy to get right once and easy to forget in a copy.
 *
 *   endpoint   API path segment, e.g. 'cutoffs' — used for DELETE
 *   fetcher    the lib/api list function for this type
 *   describe   item -> { title, sub } for the row body
 *   editHref   item -> the edit URL
 */
export default function AdminResourceList({
  heading, endpoint, fetcher, describe, editHref, newHref, newLabel, emptyText,
}) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (uiPage) => {
    setLoading(true);
    const res = await fetcher({ page: uiPage, size: PAGE_SIZE });
    if (res.backendError) {
      setError('Could not load. Is the backend running?');
      setItems([]);
    } else {
      setError('');
      setItems(res.items);
      setTotalPages(res.totalPages);
      setTotal(res.totalItems);
      if (res.page !== uiPage) setPage(res.page);
    }
    setLoading(false);
  }, [fetcher]);

  useEffect(() => { load(page); }, [load, page]);

  async function handleDelete(id, label) {
    if (!confirm(`Delete "${label}"? This can't be undone.`)) return;
    try {
      const res = await authFetch(`${API_URL}/${endpoint}/${id}`, { method: 'DELETE' });
      if (res.status === 401 || res.status === 403) throw new Error('Session expired. Please log in again.');
      if (!res.ok) throw new Error('Delete failed.');
      // Reload rather than splice: a deletion pulls a row up from the next page
      // and changes the count in the heading.
      const lastRowOnPage = items.length === 1 && page > 1;
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
              {heading}
              {!loading && !error && (
                <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 400, marginLeft: 8 }}>{total}</span>
              )}
            </h1>
            <Link href={newHref} className="btn-primary">{newLabel}</Link>
          </div>

          {error && (
            <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</p>
          )}

          {loading ? (
            <p className="muted">Loading…</p>
          ) : items.length === 0 ? (
            !error && <p className="muted">{emptyText}</p>
          ) : (
            <>
              <div className="list-card">
                {items.map(item => {
                  const { title, sub } = describe(item);
                  return (
                    <div key={item.id} className="row">
                      <span className="row-main">
                        <span className="row-title">{title}</span>
                        {sub && <span className="row-sub">{sub}</span>}
                      </span>
                      <span className="row-meta">
                        <Link href={editHref(item)} className="btn-primary btn-secondary">Edit</Link>
                        <button
                          onClick={() => handleDelete(item.id, title)}
                          className="btn-primary btn-secondary"
                          style={{ background: '#C62828', color: '#fff', border: 'none', cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                  );
                })}
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
