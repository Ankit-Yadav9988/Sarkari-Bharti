import { useRouter } from 'next/router';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import AdminGuard from '../../../components/AdminGuard';
import AdminNav from '../../../components/AdminNav';
import SyllabusForm from '../../../components/SyllabusForm';
import { authFetch } from '../../../lib/auth';
import { API_URL } from '../../../lib/api';

export default function NewSyllabus() {
  const router = useRouter();

  async function handleSubmit(payload) {
    const res = await authFetch(`${API_URL}/syllabi`, {
      method: 'POST',
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
          <h1>Add syllabus</h1>
          <SyllabusForm initial={{}} onSubmit={handleSubmit} submitLabel="Publish syllabus" />
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
