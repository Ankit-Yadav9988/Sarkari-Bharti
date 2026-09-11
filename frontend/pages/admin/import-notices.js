import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import AdminGuard from '../../components/AdminGuard';
import AdminNav from '../../components/AdminNav';
import { authFetch } from '../../lib/auth';
import { API_URL, NOTICE_TYPES, noticeTypeLabel, fetchAllJobs } from '../../lib/api';
import { parseCsv, mapNoticeRows, noticeCsvTemplate, NOTICE_CSV_COLUMNS } from '../../lib/csv';

/**
 * Bulk import for results, admit cards and answer keys.
 *
 * The same shape as the job importer, for the half of the site that actually
 * arrives in batches: a board releases forty district-wise result links on one
 * afternoon, and typing those into a form one at a time is the job this page
 * exists to delete.
 *
 * Posts one row at a time to the existing POST /notices rather than adding a
 * batch endpoint, so every row goes through the same validation and auth as a
 * row typed into the form.
 */
export default function ImportNotices() {
  const router = useRouter();

  // The type a row gets when it does not name one. Seeded from the URL so the
  // "Import CSV" button on the results page lands here already set to results.
  const [type, setType] = useState('RESULT');
  useEffect(() => {
    if (NOTICE_TYPES.some(t => t.value === router.query.type)) setType(router.query.type);
  }, [router.query.type]);

  // Every job, not the first page: this list is how a result gets attached to
  // its posting, and a job missing from it is a result that imports unlinked.
  //
  // Three states, not two. `jobs === null` after loading means the list could
  // not be fetched at all, which is different from a site that has no jobs yet —
  // the first cannot resolve a name, the second can say for certain that nothing
  // matches. A partial list (some pages failed) is kept and warned about, since
  // most rows will still resolve against it.
  const [jobs, setJobs] = useState(null);
  const [jobsReady, setJobsReady] = useState(false);
  const [jobsFailed, setJobsFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllJobs()
      .then(res => {
        if (cancelled) return;
        const items = res.items || [];
        setJobs(res.backendError && items.length === 0 ? null : items);
        setJobsFailed(Boolean(res.backendError));
      })
      .catch(() => { if (!cancelled) { setJobs(null); setJobsFailed(true); } })
      .finally(() => { if (!cancelled) setJobsReady(true); });
    return () => { cancelled = true; };
  }, []);

  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null); // { ok: [], failed: [{line, message}] }

  // Waits for the job list before validating anything, so that a row naming its
  // job is never briefly told that no job matches simply because the fetch had
  // not landed yet. A failed fetch still lets the preview through — `jobs` is
  // null there, and mapNoticeRows says "could not be loaded" instead of lying
  // about no match.
  const parsed = useMemo(() => {
    if (!text.trim() || !jobsReady) return null;
    try {
      return mapNoticeRows(parseCsv(text), { defaultType: type, jobs });
    } catch (e) {
      return { headerErrors: [`Could not read that file: ${e.message}`], rows: [] };
    }
  }, [text, type, jobs, jobsReady]);

  const valid = parsed ? parsed.rows.filter(r => !r.errors.length) : [];
  const invalid = parsed ? parsed.rows.filter(r => r.errors.length) : [];
  const blocked = parsed ? parsed.headerErrors.some(e => /Missing required column|empty/.test(e)) : false;

  const jobName = useMemo(() => {
    const byId = new Map((jobs || []).map(j => [Number(j.id), j.postName]));
    return id => byId.get(Number(id)) || `#${id}`;
  }, [jobs]);

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
    const blob = new Blob([noticeCsvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sarkari-bharti-results-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!valid.length) return;
    if (!confirm(`Publish ${valid.length} notice${valid.length === 1 ? '' : 's'} to the live site?`)) return;

    setRunning(true);
    const ok = [];
    const failed = [];

    for (const row of valid) {
      try {
        const res = await authFetch(`${API_URL}/notices`, {
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
        ok.push({ line: row.line, title: row.payload.title });
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
          <h1 style={{ margin: 0 }}>Import results &amp; admit cards from CSV</h1>
          <p className="muted small">
            Every row is checked before anything is sent. Rows with problems are listed and skipped —
            the rest still import, so one bad link does not cost you the whole file.
          </p>

          <label className="field-label" style={{ marginTop: 14 }}>These rows are</label>
          <select
            className="input"
            value={type}
            onChange={e => { setType(e.target.value); setResults(null); }}
            style={{ maxWidth: 280 }}
          >
            {NOTICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}s</option>)}
          </select>
          <p className="field-hint">
            Applies to every row that leaves the <code>type</code> column blank. A file can still mix
            them by filling that column in per row.
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
            placeholder={NOTICE_CSV_COLUMNS.slice(0, 6).map(c => c.key).join(',')}
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }}
          />

          <p className="field-hint">
            <strong>jobId</strong> is optional and attaches the notice to a posting already on this
            site, which is what makes it show up on that job&apos;s page. Put the job&apos;s exact post
            name, its advertisement number, or its id — whichever your sheet already has.
          </p>

          {!jobsReady && <p className="muted" style={{ marginTop: 12 }}>Loading the job list…</p>}

          {jobsReady && jobsFailed && (
            <div className="pill-amber" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 12 }}>
              {jobs === null
                ? <>Could not load the job list, so a <code>jobId</code> given as a post name cannot be
                    looked up. Numeric ids still work. Reload to try again.</>
                : <>Only part of the job list loaded ({jobs.length} job{jobs.length === 1 ? '' : 's'}), so a
                    row naming a job that is missing from it will be flagged as unmatched. Reload to try again.</>}
            </div>
          )}

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
                  {running ? 'Importing…' : `Publish ${valid.length} notice${valid.length === 1 ? '' : 's'}`}
                </button>
              </div>

              {invalid.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="data">
                    <thead><tr><th style={{ width: 70 }}>Line</th><th>Title</th><th>Why it was skipped</th></tr></thead>
                    <tbody>
                      {invalid.map(r => (
                        <tr key={r.line}>
                          <td>{r.line}</td>
                          <td className="muted">{r.payload.title || <em>blank</em>}</td>
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
                    <thead>
                      <tr>
                        <th style={{ width: 70 }}>Line</th><th>Type</th><th>Title</th>
                        <th>Released</th><th>Attached to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {valid.map(r => (
                        <tr key={r.line}>
                          <td>{r.line}</td>
                          <td className="muted">{noticeTypeLabel(r.payload.type)}</td>
                          <td>{r.payload.title}</td>
                          <td>{r.payload.releaseDate || <span className="muted">—</span>}</td>
                          <td className="muted">
                            {r.payload.jobId ? jobName(r.payload.jobId) : <span className="muted">—</span>}
                          </td>
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
                <Link href={`/admin/notices?type=${type}`}>Review what was published →</Link>
              </p>
            </div>
          )}
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
