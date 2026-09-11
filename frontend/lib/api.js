// Shared constants + tiny fetch helpers used by every public page.

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

export const CATEGORIES = [
  { value: 'CENTRAL_GOVT', label: 'Central Govt' },
  { value: 'UPSC', label: 'UPSC' },
  { value: 'SSC', label: 'SSC' },
  { value: 'NTA', label: 'NTA' },
  { value: 'STATE_GOVT', label: 'State Govt' },
  { value: 'STATE_PSC', label: 'State PSC' },
  { value: 'BANKING', label: 'Banking' },
  { value: 'RAILWAY', label: 'Railway' },
  { value: 'DEFENCE', label: 'Defence' },
  { value: 'POLICE', label: 'Police' },
  { value: 'TEACHING', label: 'Teaching' },
  { value: 'PSU', label: 'PSU' },
  { value: 'ADMISSION', label: 'Admission' },
];

// How the admin can place a job in the listings.
export const SECTIONS = [
  { value: 'AUTO', label: 'Auto (decide from dates) — recommended' },
  { value: 'LATEST', label: 'Latest jobs (applications open now)' },
  { value: 'UPCOMING', label: 'Upcoming (notification out, not open yet)' },
];

// Indian states + UTs for the job "state" field. A job with no state is
// treated as Central / all-India.
export const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

export const NOTICE_TYPES = [
  { value: 'ADMIT_CARD', label: 'Admit Card' },
  { value: 'RESULT', label: 'Result' },
  { value: 'ANSWER_KEY', label: 'Answer Key' },
];

/**
 * Common exam stages, offered as suggestions rather than enforced as an enum.
 *
 * Stored as free text in the database on purpose: every recruiting board names
 * its stages differently ("Tier 1", "Paper I", "Prelims", "CBT 1", "PET"), and a
 * fixed list would stop the admin filing a paper whose stage was not foreseen.
 * These are just the ones frequent enough to be worth a datalist.
 */
export const PAPER_STAGES = [
  'Prelims', 'Mains', 'Tier 1', 'Tier 2', 'Tier 3',
  'Paper I', 'Paper II', 'CBT 1', 'CBT 2', 'Interview', 'Skill Test',
];

export const PAPER_LANGUAGES = ['Bilingual', 'English', 'Hindi'];


export const DATE_COLORS = {
  start: '#2E7D32',
  last: '#C62828',
  admitCard: '#1565C0',
  exam: '#6A1B9A',
  result: '#00695C',
};

export function categoryLabel(value) {
  return CATEGORIES.find(c => c.value === value)?.label || value;
}

export function noticeTypeLabel(value) {
  return NOTICE_TYPES.find(t => t.value === value)?.label || value;
}

/**
 * The canonical path for a job.
 *
 * The backend derives `slug` from the post name with the id on the end
 * ("sbi-clerk-recruitment-2026-5"), and resolves either form, so a bare id URL
 * that was already shared keeps working. Everything this site *emits* should use
 * the slug: it is the difference between a search result reading
 * "rojgarhub.in/jobs/5" and one reading the name of the exam, and the words in
 * the URL are a ranking signal on top of that.
 *
 * Falls back to the id when the field is absent -- an older backend, or a
 * response shape that predates it -- because a link that is ugly still works and
 * a link that is `/jobs/undefined` does not.
 */
export function jobHref(job) {
  if (!job) return '/jobs';
  return `/jobs/${job.slug || job.id}`;
}

// "2026-07-20" -> "20 Jul 2026" (what job seekers are used to reading)
export function formatDate(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00');
  if (isNaN(d)) return isoDate;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Days from today until the given date (negative = already passed).
export function daysUntil(isoDate) {
  if (!isoDate) return null;
  const target = new Date(isoDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// "New" = posted on this site within the last 48 hours.
export function isNew(job) {
  if (!job.createdAt) return false;
  const created = new Date(job.createdAt);
  if (isNaN(created)) return false;
  return Date.now() - created.getTime() < 48 * 60 * 60 * 1000;
}

// 2300 -> "2.3k", 1200000 -> "1.2M" (social-proof view counter)
export function formatViews(n) {
  if (n == null) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

// --- List fetching ----------------------------------------------------
// Every list endpoint answers with the same envelope:
//   { content, page, size, totalElements, totalPages, first, last }
// where `page` is zero-based. Pages in this app are one-based because that
// is what appears in a URL, so the translation happens here and nowhere
// else.
//
// These helpers also accept a bare JSON array. That is not defensive
// padding: a frontend deploy can land before the matching backend one, and
// the difference should be client-side slicing rather than an empty site.
//
// Nothing here throws. A page renders its "backend unreachable" state
// instead of returning a 500 to a visitor.

export const PAGE_SIZE = 20;

/** Jobs. Accepts category, status, search, state, sort, page, size. */
export async function fetchJobs(params = {}) {
  return fetchList('/jobs', params);
}

/** Admit cards / results / answer keys. Accepts type, category, search, jobId, page, size. */
export async function fetchNotices(params = {}) {
  return fetchList('/notices', params);
}

/** Syllabi. Accepts category, search, jobId, page, size. */
export async function fetchSyllabi(params = {}) {
  return fetchList('/syllabi', params);
}

/** Cut-offs. Accepts category, examYear, state, search, jobId, page, size. */
export async function fetchCutoffs(params = {}) {
  return fetchList('/cutoffs', params);
}

/** Exam calendar. Accepts category, examYear, upcoming, search, jobId, page, size. */
export async function fetchExamCalendar(params = {}) {
  return fetchList('/exam-calendar', params);
}

/** Previous-year papers. Accepts category, examYear, examName, stage, search, jobId, page, size. */
export async function fetchPapers(params = {}) {
  return fetchList('/papers', params);
}

/**
 * The years a content type actually has rows for, for the year filter.
 *
 * Asked of the server rather than generated from a range: a dropdown offering
 * 2015 when there is nothing from 2015 sends people to an empty page, and the
 * years with data are not contiguous. Returns [] rather than throwing, so a
 * page whose year filter cannot load still renders its rows.
 */
export async function fetchExamYears(type) {
  const { data, backendError } = await safeGet(`/${type}/years`);
  if (backendError || !Array.isArray(data)) return [];
  return data.filter(y => Number.isFinite(y));
}

/** The server's ceiling on rows per request. Asking for more is clamped there. */
const MAX_REQUEST_SIZE = 100;

/**
 * Every job, for the admin forms that offer "link this notice to a job".
 *
 * A dropdown is the one place a page really does need the whole list -- an
 * option that is missing because it fell on page two is a notice attached to the
 * wrong job. Capped all the same: past 2,000 postings a select element is the
 * wrong control and it should become a search field.
 */
export async function fetchAllJobs({ maxPages = 20 } = {}) {
  const first = await fetchJobs({ page: 1, size: MAX_REQUEST_SIZE });
  if (first.backendError) return { items: [], backendError: true };

  const pages = Math.min(first.totalPages, maxPages);
  if (pages <= 1) return { items: first.items, backendError: false };

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => fetchJobs({ page: i + 2, size: MAX_REQUEST_SIZE }))
  );

  return {
    items: first.items.concat(...rest.map(r => r.items)),
    backendError: rest.some(r => r.backendError),
  };
}

async function fetchList(path, params = {}) {
  const { page: rawPage, size, ...filters } = params;
  const uiPage = coercePage(rawPage);
  const pageSize = size || PAGE_SIZE;

  const first = await safeGet(path, { ...filters, page: uiPage - 1, size: pageSize });
  if (first.backendError) {
    return { items: [], page: 1, totalPages: 1, totalItems: 0, backendError: true };
  }

  let result = normaliseList(first.data, uiPage, pageSize);

  // A page past the end: a stale bookmark, or rows deleted since the link was
  // shared. Serve the last real page instead of an empty list, which reads as
  // a broken site to a visitor and as a thin page to a crawler.
  if (result.items.length === 0 && result.page > result.totalPages) {
    const last = await safeGet(path, { ...filters, page: result.totalPages - 1, size: pageSize });
    if (!last.backendError) result = normaliseList(last.data, result.totalPages, pageSize);
  }

  return { ...result, backendError: false };
}

function normaliseList(data, uiPage, pageSize) {
  if (data && Array.isArray(data.content)) {
    return {
      items: data.content,
      page: (data.page ?? uiPage - 1) + 1,
      totalPages: Math.max(1, data.totalPages || 1),
      totalItems: data.totalElements ?? data.content.length,
    };
  }
  // Backend still returning whole lists: slice here so paging keeps working.
  const list = Array.isArray(data) ? data : [];
  const sliced = paginate(list, uiPage, pageSize);
  return {
    items: sliced.items,
    page: sliced.page,
    totalPages: sliced.totalPages,
    totalItems: list.length,
  };
}

async function safeGet(path, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();

  try {
    const res = await fetch(`${API_URL}${path}${query ? `?${query}` : ''}`);
    if (!res.ok) return { data: null, backendError: true };
    return { data: await res.json(), backendError: false };
  } catch {
    return { data: null, backendError: true };
  }
}

// --- Pagination -------------------------------------------------------
// Paging is the backend's job now. paginate() survives as the fallback
// normaliseList uses when it is handed a bare array, and for the few admin
// screens that hold a full list in memory.
export function paginate(list, rawPage, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil((list?.length || 0) / pageSize));
  const page = Math.min(coercePage(rawPage), totalPages);
  return {
    items: (list || []).slice((page - 1) * pageSize, page * pageSize),
    page,
    totalPages,
  };
}

/** A query-string page number as a 1-based integer; anything odd becomes 1. */
export function coercePage(rawPage) {
  const page = parseInt(rawPage, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}
