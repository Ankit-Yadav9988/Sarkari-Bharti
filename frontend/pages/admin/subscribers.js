import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import AdminGuard from '../../components/AdminGuard';
import AdminNav from '../../components/AdminNav';
import Pagination from '../../components/Pagination';
import { authFetch } from '../../lib/auth';
import { API_URL } from '../../lib/api';

/** The endpoint allows up to 500; 100 keeps the page quick to render. */
const PAGE_SIZE = 100;

/** Tolerates both the paged envelope and a bare array from an older backend. */
function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.content)) return payload.content;
  return [];
}

export default function ManageSubscribers() {
  const [subscribers, setSubscribers] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copying, setCopying] = useState(false);

  const load = useCallback(async (uiPage) => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/subscribers?page=${uiPage - 1}&size=${PAGE_SIZE}`);
      if (!res.ok) throw new Error('Could not load subscribers.');
      const data = await res.json();
      setSubscribers(rowsOf(data));
      setTotalPages(Math.max(1, data.totalPages || 1));
      setTotal(data.totalElements ?? rowsOf(data).length);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load subscribers.');
      setSubscribers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  async function handleDelete(id) {
    if (!confirm('Remove this subscriber?')) return;
    const res = await authFetch(`${API_URL}/subscribers/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert('Could not remove that subscriber.');
      return;
    }
    // Reload instead of splicing: removing a row pulls one up from the next
    // page, and the total in the heading has to come down with it.
    const lastRowOnPage = subscribers.length === 1 && page > 1;
    if (lastRowOnPage) setPage(p => p - 1); else load(page);
  }

  /**
   * Copies every address, not just this page.
   *
   * The button used to read from whatever was in memory, which was the whole
   * list; now that the list arrives a page at a time, "copy all" has to walk the
   * pages or it quietly copies the first hundred and looks like it worked.
   */
  async function copyEmails() {
    setCopying(true);
    try {
      const all = [];
      let uiPage = 1;
      let pages = 1;
      do {
        const res = await authFetch(`${API_URL}/subscribers?page=${uiPage - 1}&size=500`);
        if (!res.ok) throw new Error('Could not read the full list.');
        const data = await res.json();
        all.push(...rowsOf(data).map(s => s.email));
        pages = Math.max(1, data.totalPages || 1);
        uiPage += 1;
      } while (uiPage <= pages);

      await navigator.clipboard.writeText(all.join(', '));
      alert(`${all.length} email ${all.length === 1 ? 'address' : 'addresses'} copied to clipboard`);
    } catch (err) {
      alert(err.message || 'Could not copy the addresses.');
    } finally {
      setCopying(false);
    }
  }

  return (
    <AdminGuard>
      <div>
        <Header />
        <div className="container" style={{ paddingTop: 16, paddingBottom: 40 }}>
          <AdminNav />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>Email Subscribers ({total})</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {total > 0 && (
                <Link href="/admin/send-alert" className="btn-primary">Send alert</Link>
              )}
              {total > 0 && (
                <button onClick={copyEmails} className="btn-ghost" disabled={copying}>
                  {copying ? 'Copying…' : 'Copy all emails'}
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</p>
          )}

          {loading ? (
            <p className="muted">Loading...</p>
          ) : subscribers.length === 0 ? (
            <p className="muted">No subscribers yet.</p>
          ) : (
            <>
              <div className="list-card">
                {subscribers.map(s => (
                  <div key={s.id} className="row">
                    <span className="row-main">
                      <span className="row-title">{s.email}</span>
                      <span className="row-sub">
                        {s.interest && `Interested in: ${s.interest} · `}
                        Subscribed {new Date(s.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="row-meta">
                      <button onClick={() => handleDelete(s.id)} className="btn-primary btn-secondary" style={{ background: '#C62828', color: '#fff', border: 'none', cursor: 'pointer' }}>Remove</button>
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
