import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Header from './Header';
import Footer from './Footer';
import AdminGuard from './AdminGuard';
import AdminNav from './AdminNav';
import { authFetch } from '../lib/auth';
import { API_URL } from '../lib/api';

/**
 * The admin add/edit screen, shared by cut-offs, the exam calendar and papers.
 *
 * One component for both modes, chosen by whether an `id` is present. Add and edit
 * differ only in POST vs PUT and in the heading, and keeping them together is what
 * guarantees a field added to the form is saved by both — the classic version of
 * this bug is a new column that the add page writes and the edit page silently
 * drops.
 *
 * The existing row is fetched with a plain fetch rather than authFetch because
 * these GETs are public (SecurityConfig permits them); only the write needs the
 * token.
 *
 *   endpoint    API path segment, e.g. 'cutoffs'
 *   listHref    where to go after saving
 *   renderForm  ({ initial, onSubmit, submitLabel }) -> the type's own form
 */
export default function AdminResourceEditor({
  endpoint, listHref, renderForm, addHeading, editHeading, notFoundText,
  addSubmitLabel = 'Publish', editSubmitLabel = 'Save changes',
}) {
  const router = useRouter();
  const { id } = router.query;
  const editing = Boolean(id);

  const [existing, setExisting] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`${API_URL}/${endpoint}/${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { if (!cancelled) setExisting(data); })
      .catch(() => { if (!cancelled) setNotFound(true); });
    // The admin can hit Edit on another row before this resolves. Without the
    // guard the late response overwrites the form they are now looking at.
    return () => { cancelled = true; };
  }, [id, endpoint]);

  async function handleSubmit(payload) {
    const res = await authFetch(`${API_URL}/${endpoint}${editing ? `/${id}` : ''}`, {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('Session expired. Please log in again.');
    }
    if (!res.ok) throw new Error('Failed to save. Check the required fields.');
    router.push(listHref);
  }

  // Waiting for the fetch rather than mounting an empty form first: the forms seed
  // their state once on mount, so a form that appeared blank and filled in a
  // moment later would discard anything typed in between.
  const body = !editing
    ? renderForm({ initial: {}, onSubmit: handleSubmit, submitLabel: addSubmitLabel })
    : notFound
      ? <p className="muted">{notFoundText}</p>
      : !existing
        ? <p className="muted">Loading…</p>
        : renderForm({ initial: existing, onSubmit: handleSubmit, submitLabel: editSubmitLabel });

  return (
    <AdminGuard>
      <div>
        <Header />
        <div className="container" style={{ paddingTop: 16, paddingBottom: 40, maxWidth: 640 }}>
          <AdminNav />
          <h1>{editing ? editHeading : addHeading}</h1>
          {body}
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
