import { useState } from 'react';
import { CATEGORIES, PAPER_STAGES, PAPER_LANGUAGES } from '../lib/api';

/**
 * Shared form for admin "Add paper" and "Edit paper".
 *
 * Stage and language are <datalist> inputs, not <select>s. The lists in lib/api.js
 * cover the stages and languages that come up constantly, and typing "Tier 2" for
 * the hundredth time is the thing worth removing — but they are not exhaustive
 * (state boards invent their own stage names, and some papers are trilingual), and
 * a closed dropdown would make those rows unpostable. Suggestion, not enforcement.
 */
export default function PaperForm({ initial, onSubmit, submitLabel }) {
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
             placeholder="e.g. SSC CGL 2024 Tier-1 Question Paper" />

      <div className="grid-2">
        <div>
          <label className="field-label">Exam name</label>
          <input className="input" value={form.examName || ''}
                 onChange={e => set('examName', e.target.value)} placeholder="e.g. SSC CGL" />
          <p className="field-hint">
            Matched exactly (ignoring case) by the ?exam= filter, so keep it consistent
            across years — “SSC CGL” and “SSC CGL Exam” are two different filters.
          </p>
        </div>
        <div>
          <label className="field-label">Exam year</label>
          <input className="input" type="number" min="1990" max="2100" value={form.examYear || ''}
                 onChange={e => set('examYear', e.target.value ? Number(e.target.value) : null)}
                 placeholder="e.g. 2024" />
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
          <label className="field-label">Stage</label>
          <input className="input" list="paper-stages" value={form.paperStage || ''}
                 onChange={e => set('paperStage', e.target.value || null)}
                 placeholder="e.g. Tier 1" />
          <datalist id="paper-stages">
            {PAPER_STAGES.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
      </div>

      <label className="field-label">Language</label>
      <input className="input" list="paper-languages" value={form.language || ''}
             onChange={e => set('language', e.target.value || null)}
             placeholder="e.g. Bilingual" />
      <datalist id="paper-languages">
        {PAPER_LANGUAGES.map(l => <option key={l} value={l} />)}
      </datalist>

      <label className="field-label">Question paper link *</label>
      <input className="input" required type="url" value={form.link || ''}
             onChange={e => set('link', e.target.value)} placeholder="https://..." />

      <label className="field-label">Answer key link</label>
      <input className="input" type="url" value={form.answerKeyLink || ''}
             onChange={e => set('answerKeyLink', e.target.value)} placeholder="https://..." />
      <p className="field-hint">
        Optional. When present the row shows a second button, so the key is not buried
        behind the paper.
      </p>

      <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <input type="checkbox" checked={Boolean(form.hasSolution)}
               onChange={e => set('hasSolution', e.target.checked)} />
        Paper includes worked solutions
      </label>
      <p className="field-hint">Shows a “with solutions” tag — the reason someone picks one paper over another.</p>

      <label className="field-label">Related job ID</label>
      <input className="input" type="number" value={form.jobId || ''}
             onChange={e => set('jobId', e.target.value ? Number(e.target.value) : null)}
             placeholder="optional" />

      <label className="field-label">Note (optional)</label>
      <textarea className="input" rows={3} value={form.note || ''}
                onChange={e => set('note', e.target.value)} />

      <button type="submit" className="btn-primary btn-block" style={{ marginTop: 16 }} disabled={saving}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
