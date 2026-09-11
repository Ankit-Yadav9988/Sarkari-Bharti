import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import JobForm from '../../components/JobForm';
import AdminGuard from '../../components/AdminGuard';
import AdminNav from '../../components/AdminNav';
import { authFetch } from '../../lib/auth';
import { API_URL, jobHref } from '../../lib/api';
import { jobToDuplicate, DUPLICATE_CLEARED_FIELDS } from '../../lib/csv';

export default function AddJob() {
  const router = useRouter();

  // ?duplicate=<id> prefills the form from an existing posting. Deliberately a
  // query parameter on this page rather than a separate route or a backend
  // "clone" endpoint: what gets created is an ordinary new job, so it should go
  // through the same form, the same validation and the same POST. A clone
  // endpoint would be a second way to create a job that could drift from the
  // first.
  const duplicateId = router.query.duplicate;
  const [prefill, setPrefill] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!duplicateId) return;
    let cancelled = false;
    fetch(`${API_URL}/jobs/${duplicateId}`)
      .then(res => {
        if (!res.ok) throw new Error('Could not load that posting to copy from.');
        return res.json();
      })
      .then(job => { if (!cancelled) setPrefill(jobToDuplicate(job)); })
      .catch(err => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [duplicateId]);

  async function handleSubmit(payload) {
    const res = await authFetch(`${API_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 401 || res.status === 403) throw new Error('Session expired. Please log in again.');
    if (!res.ok) throw new Error('Server rejected the request. Check required fields.');
    const saved = await res.json();
    // Straight to the live page, at its canonical slug URL, so the admin
    // proof-reads what a visitor will actually see.
    router.push(jobHref(saved));
  }

  // Waiting for the fetch instead of mounting an empty form first: JobForm
  // seeds its state once on mount, so a form that appears blank and fills in a
  // moment later would lose anything typed in between.
  const waiting = duplicateId && !prefill && !loadError;

  return (
    <AdminGuard>
      <div>
        <Header />
        <div className="container" style={{ paddingTop: 16, paddingBottom: 40, maxWidth: 640 }}>
          <AdminNav />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ margin: 0 }}>{duplicateId ? 'Duplicate a posting' : 'Add a new job'}</h1>
            <Link href="/admin/import" className="small">Import several from CSV →</Link>
          </div>

          {duplicateId ? (
            <p className="muted small">
              Copied the organisation, category, eligibility and fee table.{' '}
              <strong>Cleared on purpose:</strong> {DUPLICATE_CLEARED_FIELDS.join(', ')} — those change
              every cycle, and last year&apos;s apply link on this year&apos;s posting is worse than a blank one.
            </p>
          ) : (
            <p className="muted small">
              This saves directly to the live site — double check dates and the official link before submitting.
            </p>
          )}

          {loadError && (
            <div className="pill-red" style={{ padding: '12px 14px', borderRadius: 8, marginTop: 12 }}>
              {loadError} <Link href="/admin/add-job">Start from a blank form instead.</Link>
            </div>
          )}

          {waiting
            ? <p className="muted">Loading the posting to copy…</p>
            : <JobForm initialData={prefill} onSubmit={handleSubmit} submitLabel="Publish job" />}
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
