import { useState, useEffect } from 'react';
import { CATEGORIES } from '../lib/api';

// The dedicated template for posting an Admit Card or a Result (or Answer Key).
// Deliberately much shorter than the job form - when a result comes out the
// admin just needs: what is it, who released it, and the link. Optionally
// attach it to an existing job so the job's detail page shows it too.
//
// noticeType: 'ADMIT_CARD' | 'RESULT' | 'ANSWER_KEY' (fixed by the page that renders this)
// jobs: list of jobs for the "related job" dropdown
// initialData: existing notice (edit) or null (new)

const emptyForm = {
  title: '',
  organization: '',
  category: 'CENTRAL_GOVT',
  link: '',
  releaseDate: '',
  jobId: '',
  note: '',
};

function noticeToFormState(notice) {
  if (!notice) return emptyForm;
  return {
    title: notice.title || '',
    organization: notice.organization || '',
    category: notice.category || 'CENTRAL_GOVT',
    link: notice.link || '',
    releaseDate: notice.releaseDate || '',
    jobId: notice.jobId ?? '',
    note: notice.note || '',
  };
}

const TYPE_PLACEHOLDERS = {
  ADMIT_CARD: {
    title: 'e.g. SSC CGL 2026 Tier-1 Admit Card',
    link: 'Direct link to the admit card download page',
  },
  RESULT: {
    title: 'e.g. RRB NTPC 2026 CBT-1 Result',
    link: 'Direct link to the result PDF / result page',
  },
  ANSWER_KEY: {
    title: 'e.g. SSC CHSL 2026 Provisional Answer Key',
    link: 'Direct link to the answer key page',
  },
};

export default function NoticeForm({ noticeType, jobs, initialData, onSubmit, submitLabel }) {
  const [form, setForm] = useState(() => noticeToFormState(initialData));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) setForm(noticeToFormState(initialData));
  }, [initialData]);

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // Picking a job pre-fills organization + category so the admin types less.
  function handleJobPick(jobIdValue) {
    updateField('jobId', jobIdValue);
    const job = jobs.find(j => String(j.id) === jobIdValue);
    if (job) {
      setForm(prev => ({
        ...prev,
        jobId: jobIdValue,
        organization: prev.organization || job.organization,
        category: job.category,
        title: prev.title || job.postName,
      }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const payload = {
      type: noticeType,
      title: form.title,
      organization: form.organization,
      category: form.category,
      link: form.link,
      releaseDate: form.releaseDate || null,
      jobId: form.jobId ? Number(form.jobId) : null,
      note: form.note,
    };

    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err.message || 'Something went wrong. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  }

  const ph = TYPE_PLACEHOLDERS[noticeType] || TYPE_PLACEHOLDERS.RESULT;

  return (
    <div>
      {error && (
        <div className="pill-red" style={{ padding: '12px 14px', borderRadius: 8, marginTop: 12, fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label className="field-label">Related job (optional)</label>
        <select className="input" value={form.jobId} onChange={e => handleJobPick(e.target.value)}>
          <option value="">— Not linked to a job on this site —</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.postName}</option>)}
        </select>
        <p className="field-hint">
          Pick the job this belongs to and the title/organization fill in automatically.
          It will also appear on that job's page under "Latest updates".
        </p>

        <label className="field-label">Title *</label>
        <input className="input" required value={form.title}
               onChange={e => updateField('title', e.target.value)}
               placeholder={ph.title} />

        <label className="field-label">Organization</label>
        <input className="input" value={form.organization}
               onChange={e => updateField('organization', e.target.value)}
               placeholder="e.g. Staff Selection Commission" />

        <div className="grid-2">
          <div>
            <label className="field-label">Category</label>
            <select className="input" value={form.category}
                    onChange={e => updateField('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Release date</label>
            <input className="input" type="date" value={form.releaseDate}
                   onChange={e => updateField('releaseDate', e.target.value)} />
          </div>
        </div>

        <label className="field-label">Link *</label>
        <input className="input" required type="url" value={form.link}
               onChange={e => updateField('link', e.target.value)}
               placeholder={ph.link} />

        <label className="field-label">Note (optional)</label>
        <textarea className="input" style={{ minHeight: 60 }} value={form.note}
                  onChange={e => updateField('note', e.target.value)}
                  placeholder="Any instruction, e.g. login with registration number and DOB" />

        <button type="submit" className="btn-primary btn-block" disabled={submitting} style={{ marginTop: 24 }}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </form>
    </div>
  );
}
