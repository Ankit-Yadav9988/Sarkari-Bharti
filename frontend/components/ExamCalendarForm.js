import { useState } from 'react';
import { CATEGORIES } from '../lib/api';

/**
 * Shared form for admin "Add calendar entry" and "Edit calendar entry".
 *
 * There is no title field, unlike every other form here: a calendar row is
 * identified by its exam name and year, and a separate free-text title would
 * only give the same exam two names to disagree on. The table on the public page
 * renders examName directly for that reason.
 */
export default function ExamCalendarForm({ initial, onSubmit, submitLabel }) {
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

      <label className="field-label">Exam name *</label>
      <input className="input" required value={form.examName || ''}
             onChange={e => set('examName', e.target.value)}
             placeholder="e.g. SSC CGL 2026 Tier-1" />

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
          <label className="field-label">Exam year</label>
          <input className="input" type="number" min="1990" max="2100" value={form.examYear || ''}
                 onChange={e => set('examYear', e.target.value ? Number(e.target.value) : null)}
                 placeholder="e.g. 2026" />
        </div>
      </div>

      <div className="grid-2">
        <div>
          <label className="field-label">Notification date</label>
          <input className="input" type="date" value={form.notificationDate || ''}
                 onChange={e => set('notificationDate', e.target.value || null)} />
        </div>
        <div>
          <label className="field-label">Apply by</label>
          <input className="input" type="date" value={form.applicationWindowEnd || ''}
                 onChange={e => set('applicationWindowEnd', e.target.value || null)} />
        </div>
      </div>

      <label className="field-label">Exam date</label>
      <input className="input" type="date" value={form.examDate || ''}
             onChange={e => set('examDate', e.target.value || null)} />
      <p className="field-hint">
        Leave blank if the board has not announced it. The page prints “to be announced”
        for a blank date, which is a real answer; a wrong date is not.
      </p>

      {/* The one checkbox on this form that changes what the visitor is told. A
          tentative date shown as final is the mistake on this page that can cost
          someone an exam, so it is worth a line of its own rather than a corner
          of the note field. */}
      <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <input type="checkbox" checked={Boolean(form.tentative)}
               onChange={e => set('tentative', e.target.checked)} />
        Date is tentative / expected
      </label>
      <p className="field-hint">Adds a “tentative” label next to the date on the public calendar.</p>

      <label className="field-label">Official link</label>
      <input className="input" type="url" value={form.link || ''}
             onChange={e => set('link', e.target.value)} placeholder="https://..." />

      <label className="field-label">Related job ID</label>
      <input className="input" type="number" value={form.jobId || ''}
             onChange={e => set('jobId', e.target.value ? Number(e.target.value) : null)}
             placeholder="optional" />

      <label className="field-label">Note (optional)</label>
      <textarea className="input" rows={3} value={form.note || ''}
                onChange={e => set('note', e.target.value)}
                placeholder="e.g. Exam city slip expected 10 days before the exam." />

      <button type="submit" className="btn-primary btn-block" style={{ marginTop: 16 }} disabled={saving}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
