import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import AdminGuard from '../../../components/AdminGuard';
import AdminNav from '../../../components/AdminNav';
import NoticeForm from '../../../components/NoticeForm';
import { authFetch } from '../../../lib/auth';
import { API_URL, NOTICE_TYPES, noticeTypeLabel, fetchAllJobs } from '../../../lib/api';

// The separate posting template: /admin/notices/new?type=ADMIT_CARD or ?type=RESULT.
// Used whenever a recruiting body releases an admit card / result / answer key,
// which is always LATER than (and independent of) the job posting itself.
export default function NewNotice() {
  const router = useRouter();
  const type = NOTICE_TYPES.some(t => t.value === router.query.type) ? router.query.type : 'ADMIT_CARD';

  const [jobs, setJobs] = useState([]);

  // Every job, not the first page: the dropdown is how a notice gets attached to
  // its posting, and a job missing from it is a notice filed under the wrong one.
  useEffect(() => {
    fetchAllJobs().then(res => setJobs(res.items));
  }, []);

  async function handleSubmit(payload) {
    const res = await authFetch(`${API_URL}/notices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 401 || res.status === 403) throw new Error('Session expired. Please log in again.');
    if (!res.ok) throw new Error('Server rejected the request. Check required fields.');
    router.push(`/admin/notices?type=${type}`);
  }

  return (
    <AdminGuard>
      <div>
        <Header />
        <div className="container" style={{ paddingTop: 16, paddingBottom: 40, maxWidth: 640 }}>
          <AdminNav />
          <h1>Post {noticeTypeLabel(type).toLowerCase()}</h1>
          <p className="muted small">
            This publishes straight to the {type === 'ADMIT_CARD' ? 'Admit card' : 'Result'} page —
            double-check the link opens the right page before submitting.
          </p>
          <NoticeForm noticeType={type} jobs={jobs} initialData={null} onSubmit={handleSubmit}
                      submitLabel={`Publish ${noticeTypeLabel(type).toLowerCase()}`} />
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
