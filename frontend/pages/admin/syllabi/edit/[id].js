import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Header from '../../../../components/Header';
import Footer from '../../../../components/Footer';
import AdminGuard from '../../../../components/AdminGuard';
import AdminNav from '../../../../components/AdminNav';
import SyllabusForm from '../../../../components/SyllabusForm';
import { authFetch } from '../../../../lib/auth';
import { API_URL } from '../../../../lib/api';

export default function EditSyllabus() {
  const router = useRouter();
  const { id } = router.query;
  const [syllabus, setSyllabus] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`${API_URL}/syllabi/${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setSyllabus)
      .catch(() => setNotFound(true));
  }, [id]);

  async function handleSubmit(payload) {
    const res = await authFetch(`${API_URL}/syllabi/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to save. Check required fields.');
    router.push('/admin/syllabi');
  }

  return (
    <AdminGuard>
      <div>
        <Header />
        <div className="container" style={{ paddingTop: 16, paddingBottom: 40, maxWidth: 640 }}>
          <AdminNav />
          <h1>Edit syllabus</h1>
          {notFound ? (
            <p className="muted">Syllabus not found.</p>
          ) : !syllabus ? (
            <p className="muted">Loading…</p>
          ) : (
            <SyllabusForm initial={syllabus} onSubmit={handleSubmit} submitLabel="Save changes" />
          )}
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
