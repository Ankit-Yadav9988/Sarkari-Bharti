import { useState, useMemo } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import AdminGuard from '../../components/AdminGuard';
import AdminNav from '../../components/AdminNav';
import { authFetch } from '../../lib/auth';
import { API_URL } from '../../lib/api';
import { parseCsv, mapRows, csvTemplate, CSV_COLUMNS } from '../../lib/csv';

/**
 * Bulk import from CSV.
 *
 * Posts one row at a time to the existing POST /jobs rather than adding a
 * batch endpoint. That is a deliberate trade: it is slower, but every row goes
 * through exactly the same validation, slug generation and auth as a row typed
 * into the form, so a bulk import cannot create a job the form could not. A
 * batch endpoint would be a second, less-tested path to the same table.
 *
 * Sequential, not Promise.all: twenty parallel writes would trip the rate
 * limiter added in task #11, and a half-imported file is harder to reason about
 * than a slow one.
 */
export default function ImportJobs() {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null); // { ok: [], failed: [{line, message}] }

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return mapRows(parseCsv(text));
    } catch (e) {
      return { headerErrors: [`Could not read that file: ${e.message}`], rows: [] };
    }
  }, [text]);

  const valid = parsed ? parsed.rows.filter(r => !r.errors.length) : [];
  const invalid = parsed ? parsed.rows.filter(r => r.errors.length) : [];
  const blocked = parsed ? parsed.headerErrors.some(e => /Missing required column|empty/.test(e)) : false;

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults(null);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const blob = new Blob([csvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rojgarhub-jobs-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!valid.length) return;
    if (!confirm(`Publish ${valid.length} posting${valid.length === 1 ? '' : 's'} to the live site?`)) return;

    setRunning(true);
    const ok = [];
    const failed = [];

    for (const row of valid) {
      try {
        const res = await authFetch(`${API_URL}/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(row.payload),
        });
        if (res.status === 401 || res.status === 403) {
          failed.push({ line: row.line, message: 'Session expired — log in again and re-run the rest.' });
          break; // Every remaining row would fail the same way.
        }
        if (res.status === 429) {
          failed.push({ line: row.line, message: 'Rate limited. Wait a minute, then import the remaining rows.' });
          break;
        }
        if (!res.ok) { failed.push({ line: row.line, message: `Server rejected it (${res.status}).` }); continue; }
        ok.push({ line: row.line, postName: row.payload.postName });
      } catch (err) {
        failed.push({ line: row.line, message: err.message || 'Network error.' });
      }
    }

    setResults({ ok, failed });
    setRunning(false);
  }

  return (
    <AdminGuard>
      <div>
        <Header />
        <div className="container" style={{ paddingTop: 16, paddingBottom: 40 }}>
          <AdminNav />
          <h1 style={{ margin: 0 }}>Import jobs from CSV</h1>
          <p className="muted small">
            Every row is checked before anything is sent. Rows with problems are listed and skipped —
            the rest still import, so one bad date does not cost you the whole file.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} className="input" style={{ marginTop: 0, width: 'auto' }} />
            <button type="button" onClick={downloadTemplate} className="btn-ghost">Download template</button>
            {fileName && <span className="muted small">{fileName}</span>}
          </div>

          <label className="field-label" style={{ marginTop: 16 }}>…or paste the rows here</label>
          <textarea
            className="input"
            rows={8}
            value={text}
            onChange={e => { setText(e.target.value); setResults(null); }}
            placeholder={CSV_COLUMNS.slice(0, 6).map(c => c.key).join(',')}
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }}
          />

          {parsed?.headerErrors?.length > 0 && (
            <div className={blocked ? 'pill-red' : 'pill-amber'} style={{ padding: '10px 14px', borderRadius: 8, marginTop: 12 }}>
              {parsed.headerErrors.map(e => <div key={e}>{e}</div>)}
            </div>
          )}

          {parsed && !blocked && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
                <p style={{ margin: 0 }}>
                  <strong>{valid.length}</strong> ready to import
                  {invalid.length > 0 && <> · <span style={{ color: '#A32D2D' }}>{invalid.length} skipped</span></>}
                </p>
                <button type="button" className="btn-primary" onClick={handleImport} disabled={running || !valid.length}>
                  {running ? 'Importing…' : `Publish ${valid.length} posting${valid.length === 1 ? '' : 's'}`}
                </button>
              </div>

              {invalid.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="data">
                    <thead><tr><th style={{ width: 70 }}>Line</th><th>Post name</th><th>Why it was skipped</th></tr></thead>
                    <tbody>
                      {invalid.map(r => (
                        <tr key={r.line}>
                          <td>{r.line}</td>
                          <td className="muted">{r.payload.postName || <em>blank</em>}</td>
                          <td style={{ color: '#A32D2D' }}>{r.errors.join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {valid.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="data">
                    <thead><tr><th style={{ width: 70 }}>Line</th><th>Post name</th><th>Organization</th><th>Category</th><th>Last date</th></tr></thead>
                    <tbody>
                      {valid.map(r => (
                        <tr key={r.line}>
                          <td>{r.line}</td>
                          <td>{r.payload.postName}</td>
                          <td className="muted">{r.payload.organization}</td>
                          <td className="muted">{r.payload.category}</td>
                          <td>{r.payload.lastDate || <span className="muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {results && (
            <div style={{ marginTop: 20 }}>
              <h2 style={{ marginBottom: 6 }}>Import finished</h2>
              <p className="pill-green" style={{ padding: '10px 14px', borderRadius: 8, display: 'inline-block' }}>
                {results.ok.length} published
              </p>
              {results.failed.length > 0 && (
                <div className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 10 }}>
                  {results.failed.map(f => <div key={f.line}>Line {f.line}: {f.message}</div>)}
                </div>
              )}
              <p style={{ marginTop: 12 }}>
                <Link href="/admin/manage">Review what was published →</Link>
              </p>
            </div>
          )}
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
