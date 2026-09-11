import { useState } from 'react';
import { CATEGORIES, STATES } from '../lib/api';

/**
 * Shared form for admin "Add cut off" and "Edit cut off".
 *
 * The marks box is a textarea, not a set of per-category number fields. Category
 * lists differ by exam, by state and by year — a fixed GEN/OBC/SC/ST grid would
 * block posting an exam with EWS, PwBD or ex-serviceman splits, and blocking the
 * post is a worse failure than untidy data on the highest-traffic page type here.
 */
export default function CutoffForm({ initial, onSubmit, submitLabel }) {
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
      <input className="input" required value={form.title || ''}
             onChange={e => set('title', e.target.value)}
             placeholder="e.g. SSC CGL 2025 Tier-1 Cut Off" />

      <div className="grid-2">
        <div>
          <label className="field-label">Exam name</label>
          <input className="input" value={form.examName || ''}
                 onChange={e => set('examName', e.target.value)} placeholder="e.g. SSC CGL" />
        </div>
        <div>
          <label className="field-label">Exam year</label>
          <input className="input" type="number" min="1990" max="2100" value={form.examYear || ''}
                 onChange={e => set('examYear', e.target.value ? Number(e.target.value) : null)}
                 placeholder="e.g. 2025" />
          <p className="field-hint">Drives the year filter and the sort order.</p>
        </div>
      </div>

      <label className="field-label">Organization</label>
      <input className="input" value={form.organization || ''}
             onChange={e => set('organization', e.target.value)}
             placeholder="e.g. Staff Selection Commission" />

      <div className="grid-2">
        <div>
          <label className="field-label">Category</label>
          <select className="input" value={form.category || ''}
                  onChange={e => set('category', e.target.value || null)}>
            <option value="">— select —</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">State</label>
          <select className="input" value={form.state || ''}
                  onChange={e => set('state', e.target.value || null)}>
            <option value="">All India / Central</option>
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <label className="field-label">Cut off marks</label>
      <textarea className="input" rows={4} value={form.marksSummary || ''}
                onChange={e => set('marksSummary', e.target.value)}
                placeholder={'GEN 148.20\nEWS 141.50\nOBC 142.60\nSC 129.40\nST 118.75'} />
      <p className="field-hint">
        Free text — one category per line, or slash-separated. This is printed on the
        page exactly as typed, so most visitors never open the PDF.
      </p>

      <label className="field-label">Official PDF link</label>
      <input className="input" type="url" value={form.link || ''}
             onChange={e => set('link', e.target.value)} placeholder="https://..." />
      <p className="field-hint">Optional, but it is what makes the numbers above believable.</p>

      <div className="grid-2">
        <div>
          <label className="field-label">Published date</label>
          <input className="input" type="date" value={form.publishedDate || ''}
                 onChange={e => set('publishedDate', e.target.value || null)} />
        </div>
        <div>
          <label className="field-label">Related job ID</label>
          <input className="input" type="number" value={form.jobId || ''}
                 onChange={e => set('jobId', e.target.value ? Number(e.target.value) : null)}
                 placeholder="optional" />
        </div>
      </div>

      <label className="field-label">Note (optional)</label>
      <textarea className="input" rows={3} value={form.note || ''}
                onChange={e => set('note', e.target.value)} />

      <button type="submit" className="btn-primary btn-block" style={{ marginTop: 16 }} disabled={saving}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
