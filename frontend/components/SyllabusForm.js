import { useState } from 'react';
import { CATEGORIES } from '../lib/api';

// Shared form for admin "Add syllabus" and "Edit syllabus" pages.
// initial: existing syllabus (edit) or {} (add)
// onSubmit: receives the form payload, performs the POST/PUT and navigation
export default function SyllabusForm({ initial, onSubmit, submitLabel }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try { await onSubmit(form); }
    catch (err) { setError(err.message); setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 8 }}>{error}</p>}

      <label className="field-label">Title *</label>
      <input className="input" required value={form.title || ''} onChange={e => set('title', e.target.value)} placeholder="e.g. SSC CGL 2026 Syllabus" />

      <div className="grid-2">
        <div>
          <label className="field-label">Exam name</label>
          <input className="input" value={form.examName || ''} onChange={e => set('examName', e.target.value)} placeholder="e.g. SSC CGL" />
        </div>
        <div>
          <label className="field-label">Category</label>
          <select className="input" value={form.category || ''} onChange={e => set('category', e.target.value || null)}>
            <option value="">— select —</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <label className="field-label">Organization</label>
      <input className="input" value={form.organization || ''} onChange={e => set('organization', e.target.value)} placeholder="e.g. Staff Selection Commission" />

      <label className="field-label">Link (PDF or official page) *</label>
      <input className="input" required type="url" value={form.link || ''} onChange={e => set('link', e.target.value)} placeholder="https://..." />

      <div className="grid-2">
        <div>
          <label className="field-label">Updated date</label>
          <input className="input" type="date" value={form.updatedDate || ''} onChange={e => set('updatedDate', e.target.value || null)} />
        </div>
        <div>
          <label className="field-label">Related job ID</label>
          <input className="input" type="number" value={form.jobId || ''} onChange={e => set('jobId', e.target.value || null)} placeholder="optional" />
        </div>
      </div>

      <label className="field-label">Note (optional)</label>
      <textarea className="input" rows={3} value={form.note || ''} onChange={e => set('note', e.target.value)} />

      <button type="submit" className="btn-primary btn-block" style={{ marginTop: 16 }} disabled={saving}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
