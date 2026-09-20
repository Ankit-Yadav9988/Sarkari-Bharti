import { useState, useEffect } from 'react';
import { CATEGORIES, SECTIONS, STATES } from '../lib/api';

const CATEGORY_VALUES = CATEGORIES.map(c => c.value);
const FEE_CATEGORIES = ['GENERAL', 'OBC', 'EWS', 'SC_ST', 'PWBD'];
const RELAXATION_CATEGORIES = ['OBC', 'SC_ST', 'PWBD'];

const emptyForm = {
  postName: '',
  organization: '',
  advertisementNo: '',
  category: 'CENTRAL_GOVT',
  listingSection: 'AUTO',
  state: '',
  totalPosts: '',
  applicationStartDate: '',
  lastDate: '',
  admitCardDate: '',
  examDate: '',
  resultDate: '',
  ageMin: '',
  ageMax: '',
  eligibility: '',
  selectionProcess: '',
  officialApplyLink: '',
  notificationPdfUrl: '',
  syllabusLink: '',
  fees: Object.fromEntries(FEE_CATEGORIES.map(c => [c, ''])),
  relaxations: Object.fromEntries(RELAXATION_CATEGORIES.map(c => [c, ''])),
};

function jobToFormState(job) {
  if (!job) return emptyForm;
  return {
    postName: job.postName || '',
    organization: job.organization || '',
    advertisementNo: job.advertisementNo || '',
    category: job.category || 'CENTRAL_GOVT',
    listingSection: job.listingSection || 'AUTO',
    state: job.state || '',
    totalPosts: job.totalPosts ?? '',
    applicationStartDate: job.applicationStartDate || '',
    lastDate: job.lastDate || '',
    admitCardDate: job.admitCardDate || '',
    examDate: job.examDate || '',
    resultDate: job.resultDate || '',
    ageMin: job.ageMin ?? '',
    ageMax: job.ageMax ?? '',
    eligibility: job.eligibility || '',
    selectionProcess: job.selectionProcess || '',
    officialApplyLink: job.officialApplyLink || '',
    notificationPdfUrl: job.notificationPdfUrl || '',
    syllabusLink: job.syllabusLink || '',
    fees: Object.fromEntries(FEE_CATEGORIES.map(c => [c, job.feeByCategory?.[c] ?? ''])),
    relaxations: Object.fromEntries(RELAXATION_CATEGORIES.map(c => [c, job.ageRelaxationByCategory?.[c] ?? ''])),
  };
}

// initialData: existing job (for edit) or null (for add)
// onSubmit: receives the built payload, should perform the POST/PUT and handle navigation
// submitLabel: text shown on the button
export default function JobForm({ initialData, onSubmit, submitLabel }) {
  const [form, setForm] = useState(() => jobToFormState(initialData));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) setForm(jobToFormState(initialData));
  }, [initialData]);

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }
  function updateFee(category, value) {
    setForm(prev => ({ ...prev, fees: { ...prev.fees, [category]: value } }));
  }
  function updateRelaxation(category, value) {
    setForm(prev => ({ ...prev, relaxations: { ...prev.relaxations, [category]: value } }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const feeByCategory = {};
    Object.entries(form.fees).forEach(([cat, val]) => {
      if (val !== '') feeByCategory[cat] = Number(val);
    });

    const ageRelaxationByCategory = {};
    Object.entries(form.relaxations).forEach(([cat, val]) => {
      if (val !== '') ageRelaxationByCategory[cat] = Number(val);
    });

    const payload = {
      postName: form.postName,
      organization: form.organization,
      advertisementNo: form.advertisementNo,
      category: form.category,
      listingSection: form.listingSection,
      state: form.state || null,
      totalPosts: form.totalPosts ? Number(form.totalPosts) : null,
      applicationStartDate: form.applicationStartDate || null,
      lastDate: form.lastDate || null,
      admitCardDate: form.admitCardDate || null,
      examDate: form.examDate || null,
      resultDate: form.resultDate || null,
      ageMin: form.ageMin ? Number(form.ageMin) : null,
      ageMax: form.ageMax ? Number(form.ageMax) : null,
      eligibility: form.eligibility,
      selectionProcess: form.selectionProcess,
      officialApplyLink: form.officialApplyLink,
      notificationPdfUrl: form.notificationPdfUrl,
      syllabusLink: form.syllabusLink,
      feeByCategory,
      ageRelaxationByCategory,
    };

    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err.message || 'Something went wrong. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="pill-red" style={{ padding: '12px 14px', borderRadius: 8, marginTop: 12, fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label className="field-label">Post name *</label>
        <input className="input" required value={form.postName}
               onChange={e => updateField('postName', e.target.value)}
               placeholder="e.g. SBI Clerk (Junior Associate) recruitment 2026" />

        <label className="field-label">Organization *</label>
        <input className="input" required value={form.organization}
               onChange={e => updateField('organization', e.target.value)}
               placeholder="e.g. State Bank of India" />

        <label className="field-label">Advertisement / notification number</label>
        <input className="input" value={form.advertisementNo}
               onChange={e => updateField('advertisementNo', e.target.value)} />

        <div className="grid-2">
          <div>
            <label className="field-label">Category *</label>
            <select className="input" value={form.category}
                    onChange={e => updateField('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Show in section *</label>
            <select className="input" value={form.listingSection}
                    onChange={e => updateField('listingSection', e.target.value)}>
              {SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <p className="field-hint">
          "Auto" moves the job to Latest once applications open and to Closed after the last date.
          Choose Latest or Upcoming to place it manually. Either way, the job is marked Closed once
          the last date has passed — pinning controls placement, not whether the form is still open.
          It appears under "All jobs" throughout.
        </p>

        <label className="field-label">State (leave blank for Central / all-India jobs)</label>
        <select className="input" value={form.state}
                onChange={e => updateField('state', e.target.value)}>
          <option value="">All India / Central</option>
          {STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <label className="field-label">Total posts / vacancies</label>
        <input className="input" type="number" value={form.totalPosts}
               onChange={e => updateField('totalPosts', e.target.value)} />

        <div className="grid-2">
          <div>
            <label className="field-label" style={{ color: 'var(--green)' }}>
              {form.listingSection === 'UPCOMING' ? 'Expected application start date' : 'Application start date *'}
            </label>
            <input className="input" type="date" required={form.listingSection !== 'UPCOMING'} value={form.applicationStartDate}
                   onChange={e => updateField('applicationStartDate', e.target.value)} />
          </div>
          <div>
            <label className="field-label" style={{ color: 'var(--red)' }}>
              {form.listingSection === 'UPCOMING' ? 'Expected last date to apply' : 'Last date to apply *'}
            </label>
            <input className="input" type="date" required={form.listingSection !== 'UPCOMING'} value={form.lastDate}
                   onChange={e => updateField('lastDate', e.target.value)} />
          </div>
          <div>
            <label className="field-label" style={{ color: 'var(--blue)' }}>Admit card date (expected)</label>
            <input className="input" type="date" value={form.admitCardDate}
                   onChange={e => updateField('admitCardDate', e.target.value)} />
          </div>
          <div>
            <label className="field-label" style={{ color: 'var(--purple)' }}>Exam date</label>
            <input className="input" type="date" value={form.examDate}
                   onChange={e => updateField('examDate', e.target.value)} />
          </div>
          <div>
            <label className="field-label" style={{ color: 'var(--teal)' }}>Result date (expected)</label>
            <input className="input" type="date" value={form.resultDate}
                   onChange={e => updateField('resultDate', e.target.value)} />
          </div>
        </div>
        <p className="field-hint">
          {form.listingSection === 'UPCOMING'
            ? 'Upcoming dates are optional estimates. Leave them blank when the official application window has not been confirmed; these expected dates will not automatically close the notice.'
            : 'Confirmed application start and last dates are required for live application sections.'}
          {' '}
          Admit card / result dates here are just the expected dates shown on the job page.
          When they're actually released, post them from "Admit cards" / "Results" in the admin menu.
        </p>

        <div className="grid-2">
          <div>
            <label className="field-label">Minimum age</label>
            <input className="input" type="number" value={form.ageMin}
                   onChange={e => updateField('ageMin', e.target.value)} />
          </div>
          <div>
            <label className="field-label">Maximum age</label>
            <input className="input" type="number" value={form.ageMax}
                   onChange={e => updateField('ageMax', e.target.value)} />
          </div>
        </div>

        <h3>Application fee by category (₹)</h3>
        <div className="grid-2">
          {FEE_CATEGORIES.map(cat => (
            <div key={cat}>
              <label className="field-label">{cat.replace('_', '/')}</label>
              <input className="input" type="number" value={form.fees[cat]}
                     onChange={e => updateFee(cat, e.target.value)} placeholder="0" />
            </div>
          ))}
        </div>

        <h3>Age relaxation by category (years)</h3>
        <div className="grid-2">
          {RELAXATION_CATEGORIES.map(cat => (
            <div key={cat}>
              <label className="field-label">{cat.replace('_', '/')}</label>
              <input className="input" type="number" value={form.relaxations[cat]}
                     onChange={e => updateRelaxation(cat, e.target.value)} placeholder="0" />
            </div>
          ))}
        </div>

        <label className="field-label">Eligibility</label>
        <textarea className="input" style={{ minHeight: 80 }} value={form.eligibility}
                  onChange={e => updateField('eligibility', e.target.value)} />

        <label className="field-label">Selection process</label>
        <textarea className="input" style={{ minHeight: 70 }} value={form.selectionProcess}
                  onChange={e => updateField('selectionProcess', e.target.value)}
                  placeholder="e.g. Prelims exam, Mains exam, Interview" />

        <label className="field-label">Official apply link *</label>
        <input className="input" required type="url" value={form.officialApplyLink}
               onChange={e => updateField('officialApplyLink', e.target.value)} />

        <label className="field-label">Notification PDF link *</label>
        <input className="input" required type="url" value={form.notificationPdfUrl}
               onChange={e => updateField('notificationPdfUrl', e.target.value)} />

        <label className="field-label">Syllabus / exam pattern link</label>
        <input className="input" type="url" value={form.syllabusLink}
               onChange={e => updateField('syllabusLink', e.target.value)} />

        <button type="submit" className="btn-primary btn-block" disabled={submitting} style={{ marginTop: 24 }}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </form>
    </div>
  );
}
