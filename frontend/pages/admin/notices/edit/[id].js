import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Header from '../../../../components/Header';
import Footer from '../../../../components/Footer';
import AdminGuard from '../../../../components/AdminGuard';
import AdminNav from '../../../../components/AdminNav';
import NoticeForm from '../../../../components/NoticeForm';
import { authFetch } from '../../../../lib/auth';
import { API_URL, noticeTypeLabel, fetchAllJobs } from '../../../../lib/api';

export default function EditNotice() {
  const router = useRouter();
  const { id } = router.query;
  const [notice, setNotice] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`${API_URL}/notices/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Post not found.');
        return res.json();
      })
      .then(setNotice)
      .catch(err => setLoadError(err.message));

    // The whole list: if the job this notice is already linked to were missing
    // from the dropdown, saving the form would silently detach it.
    fetchAllJobs().then(res => setJobs(res.items));
  }, [id]);

  async function handleSubmit(payload) {
    const res = await authFetch(`${API_URL}/notices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 401 || res.status === 403) throw new Error('Session expired. Please log in again.');
    if (!res.ok) throw new Error('Server rejected the update. Check required fields.');
    router.push(`/admin/notices?type=${payload.type}`);
  }

  return (
    <AdminGuard>
      <div>
        <Header />
        <div className="container" style={{ paddingTop: 16, paddingBottom: 40, maxWidth: 640 }}>
          <AdminNav />
          <h1>Edit {notice ? noticeTypeLabel(notice.type).toLowerCase() : 'post'}</h1>

          {loadError && (
            <div className="pill-red" style={{ padding: '12px 14px', borderRadius: 8, marginTop: 12 }}>
              {loadError}
            </div>
          )}

          {!notice && !loadError && <p className="muted">Loading…</p>}

          {notice && (
            <NoticeForm noticeType={notice.type} jobs={jobs} initialData={notice}
                        onSubmit={handleSubmit} submitLabel="Save changes" />
          )}
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
