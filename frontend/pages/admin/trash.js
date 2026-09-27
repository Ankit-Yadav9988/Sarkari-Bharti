import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import AdminGuard from '../../components/AdminGuard';
import AdminNav from '../../components/AdminNav';
import { categoryLabel, formatDate } from '../../lib/api';
import { fetchTrash, restoreJobs, purgeJobs, formatWhen } from '../../lib/adminJobs';

/** As on the manage screen: enough names to catch a wrong selection, not a wall. */
const NAMES_IN_CONFIRM = 8;

/**
 * Deleted job postings, with a way back.
 *
 * Nothing on this screen is visible on the public site -- that is what being in
 * the trash means. The two actions are Restore (put it back) and Delete forever
 * (the only irreversible operation in the application).
 *
 * There is no automatic expiry. A trash that empties itself after thirty days
 * would mean the safety net silently disappears exactly when someone finally
 * notices the mistake, which is the opposite of the point.
 */
export default function AdminTrash() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchTrash()
      .then(list => {
        if (cancelled) return;
        setRows(Array.isArray(list) ? list : []);
        setError('');
        setSelected(new Set());
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [reloadToken]);

  const allSelected = rows.length > 0 && rows.every(row => selected.has(row.id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggleOne(id) {
    setNotice('');
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setNotice('');
    setSelected(allSelected ? new Set() : new Set(rows.map(row => row.id)));
  }

  function describe(names) {
    const shown = names.slice(0, NAMES_IN_CONFIRM);
    const rest = names.length - shown.length;
    const list = shown.map(name => `• ${name}`).join('\n');
    return rest > 0 ? `${list}\n• ...and ${rest} more` : list;
  }

  /**
   * Runs one bulk action and reports honestly.
   *
   * `changed` can be lower than `requested` without anything being wrong -- a
   * second tab, or a row someone already restored -- so the difference is
   * spelled out instead of being rounded up into "Done".
   */
  async function run(action, chosen, verb, done) {
    setBusy(true);
    setNotice('');
    try {
      const result = await action(chosen.map(row => row.id));
      const noun = result.changed === 1 ? 'posting' : 'postings';
      setNotice(
        result.skipped > 0
          ? `${done} ${result.changed} of ${result.requested}. ${result.skipped} were no longer in the trash.`
          : `${done} ${result.changed} ${noun}.`
      );
      setReloadToken(n => n + 1);
    } catch (err) {
      alert(`Could not ${verb}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function handleRestore() {
    const chosen = rows.filter(row => selected.has(row.id));
    if (chosen.length === 0 || busy) return;

    const noun = chosen.length === 1 ? 'posting' : 'postings';
    const ok = confirm(
      `Put ${chosen.length} ${noun} back on the site?\n\n`
      + `${describe(chosen.map(row => row.postName))}\n\n`
      + 'They will be visible to visitors again straight away.'
    );
    if (!ok) return;
    run(restoreJobs, chosen, 'restore', 'Restored');
  }

  function handlePurge() {
    const chosen = rows.filter(row => selected.has(row.id));
    if (chosen.length === 0 || busy) return;

    const noun = chosen.length === 1 ? 'posting' : 'postings';
    // The one place in this application where "cannot be undone" is true, so it
    // is stated plainly and the names are always listed.
    const ok = confirm(
      `Permanently delete ${chosen.length} ${noun}?\n\n`
      + `${describe(chosen.map(row => row.postName))}\n\n`
      + 'This cannot be undone. There is no backup of these rows. '
      + 'Choose Restore instead if you are not sure.'
    );
    if (!ok) return;
    run(purgeJobs, chosen, 'delete', 'Permanently deleted');
  }

  return (
    <AdminGuard>
      <div>
        <Header />
        <div className="container" style={{ paddingTop: 16, paddingBottom: 40 }}>
          <AdminNav />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <h1 style={{ margin: 0 }}>
              Trash
              {!loading && !error && (
                <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 400, marginLeft: 8 }}>
                  {rows.length} {rows.length === 1 ? 'posting' : 'postings'}
                </span>
              )}
            </h1>
            <Link href="/admin/manage" className="btn-ghost">Back to jobs</Link>
          </div>

          <p className="muted" style={{ marginTop: 8, maxWidth: 640 }}>
            These postings are hidden from the site but still in the database.
            Restore puts one back exactly as it was, on the same web address.
            Nothing here is removed automatically.
          </p>

          {error && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 16 }}>{error}</p>}
          {notice && <p className="pill-green" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 16 }}>{notice}</p>}
          {loading && <p className="muted" style={{ marginTop: 16 }}>Loading trash…</p>}

          {!loading && !error && selected.size > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
              marginTop: 16, padding: '10px 14px', borderRadius: 8,
              background: '#F6F8FF', border: '1px solid #C9D2E8',
            }}>
              <strong>{selected.size} selected</strong>
              <span style={{ flex: 1 }} />
              <button onClick={() => setSelected(new Set())} className="btn-ghost" disabled={busy}>
                Clear
              </button>
              <button onClick={handleRestore} disabled={busy} className="btn-primary">
                {busy ? 'Working…' : `Restore ${selected.size}`}
              </button>
              <button onClick={handlePurge} disabled={busy}
                      style={{
                        background: 'none', border: '1px solid #A32D2D', color: '#A32D2D',
                        padding: '8px 14px', borderRadius: 6, fontWeight: 600,
                        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                      }}>
                Delete forever
              </button>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <p className="muted" style={{ marginTop: 24 }}>
              The trash is empty. Deleted postings will appear here.
            </p>
          )}

          {!loading && !error && rows.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      <input type="checkbox"
                             aria-label="Select everything in the trash"
                             checked={allSelected}
                             ref={el => { if (el) el.indeterminate = someSelected; }}
                             onChange={toggleAll} />
                    </th>
                    <th>Post name</th>
                    <th>Organization</th>
                    <th>Category</th>
                    <th style={{ color: 'var(--red)' }}>Last date</th>
                    <th>Deleted</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id} style={selected.has(row.id) ? { background: '#F9FAFF' } : undefined}>
                      <td>
                        <input type="checkbox"
                               aria-label={`Select ${row.postName}`}
                               checked={selected.has(row.id)}
                               onChange={() => toggleOne(row.id)} />
                      </td>
                      <td>{row.postName}</td>
                      <td className="muted">{row.organization || '—'}</td>
                      <td className="muted">{categoryLabel(row.category)}</td>
                      <td style={{ color: 'var(--red)', fontWeight: 600 }}>{formatDate(row.lastDate) || '—'}</td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatWhen(row.deletedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
