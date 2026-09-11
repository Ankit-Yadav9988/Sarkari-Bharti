import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import JobForm from '../../../components/JobForm';
import AdminGuard from '../../../components/AdminGuard';
import AdminNav from '../../../components/AdminNav';
import { authFetch } from '../../../lib/auth';
import { API_URL, jobHref } from '../../../lib/api';

export default function EditJob() {
  const router = useRouter();
  const { id } = router.query;
  const [job, setJob] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`${API_URL}/jobs/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Job not found.');
        return res.json();
      })
      .then(setJob)
      .catch(err => setLoadError(err.message));
  }, [id]);

  async function handleSubmit(payload) {
    const res = await authFetch(`${API_URL}/jobs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 401 || res.status === 403) throw new Error('Session expired. Please log in again.');
    if (!res.ok) throw new Error('Server rejected the update. Check required fields.');
    // The response carries the slug rebuilt from the new post name, so an edit
    // that changed the title lands on the title's URL rather than bouncing
    // through a redirect from the old one.
    const saved = await res.json().catch(() => null);
    router.push(jobHref(saved || { id }));
  }

  return (
    <AdminGuard>
      <div>
        <Header />
        <div className="container" style={{ paddingTop: 16, paddingBottom: 40, maxWidth: 640 }}>
          <AdminNav />
          <h1>Edit job</h1>

          {loadError && (
            <div className="pill-red" style={{ padding: '12px 14px', borderRadius: 8, marginTop: 12 }}>
              {loadError}
            </div>
          )}

          {!job && !loadError && <p className="muted">Loading job…</p>}

          {job && (
            <JobForm initialData={job} onSubmit={handleSubmit} submitLabel="Save changes" />
          )}
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
