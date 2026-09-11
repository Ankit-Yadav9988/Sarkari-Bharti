/**
 * CSV parsing and row validation for the admin bulk importer.
 *
 * Written by hand rather than pulled in as a dependency, because the hard part
 * here is not splitting on commas — it is deciding what counts as a valid row,
 * and that logic is specific to this data. A library would parse the file and
 * leave the actual work undone.
 *
 * No React, no fetch: this file is pure functions over strings so the harness
 * can exercise every branch without rendering anything.
 */

import { CATEGORIES, SECTIONS, STATES, NOTICE_TYPES } from './api';

const CATEGORY_VALUES = CATEGORIES.map(c => c.value);
const SECTION_VALUES = SECTIONS.map(s => s.value);
const FEE_CATEGORIES = ['GENERAL', 'OBC', 'EWS', 'SC_ST', 'PWBD'];
const RELAXATION_CATEGORIES = ['OBC', 'SC_ST', 'PWBD'];

/**
 * Splits CSV text into rows of raw strings.
 *
 * A regex-and-split approach breaks on the first quoted field containing a
 * comma, which in this data is the common case, not the exotic one:
 * "Junior Engineer (Civil, Electrical)" is an ordinary post name. So this walks
 * the text character by character and tracks whether it is inside quotes.
 *
 * Handles: quoted fields, commas and newlines inside quotes, "" as an escaped
 * quote, CRLF and LF line endings, and a trailing newline.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;

  // Excel writes a UTF-8 BOM. Left in place it becomes part of the first header
  // name, so "postName" silently fails to match and every row looks empty.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  while (i < src.length) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === ',') { endField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { endRow(); i++; continue; }
    field += c; i++;
  }

  // A file that does not end in a newline still has one last row in the buffer.
  if (field !== '' || row.length) endRow();

  // Drop rows that are entirely empty — a blank line between blocks, or the
  // trailing newline every editor adds.
  return rows.filter(r => r.some(f => f.trim() !== ''));
}

/**
 * The columns the importer understands. Everything is optional except postName
 * and organization, which are the two the backend rejects a job without.
 *
 * Header matching is case- and separator-insensitive, so "Post Name",
 * "post_name" and "postName" are the same column. The admin is pasting from a
 * spreadsheet somebody else made; making them rename headers first is how a
 * feature ends up unused.
 */
export const CSV_COLUMNS = [
  { key: 'postName', required: true, label: 'postName' },
  { key: 'organization', required: true, label: 'organization' },
  { key: 'advertisementNo' },
  { key: 'category', enum: CATEGORY_VALUES },
  { key: 'listingSection', enum: SECTION_VALUES },
  { key: 'state', enum: STATES },
  { key: 'totalPosts', number: true },
  { key: 'applicationStartDate', date: true },
  { key: 'lastDate', date: true },
  { key: 'admitCardDate', date: true },
  { key: 'examDate', date: true },
  { key: 'resultDate', date: true },
  { key: 'ageMin', number: true },
  { key: 'ageMax', number: true },
  { key: 'eligibility' },
  { key: 'selectionProcess' },
  { key: 'officialApplyLink', url: true },
  { key: 'notificationPdfUrl', url: true },
  { key: 'syllabusLink', url: true },
  ...FEE_CATEGORIES.map(c => ({ key: `fee${c}`, number: true, fee: c })),
  ...RELAXATION_CATEGORIES.map(c => ({ key: `relax${c}`, number: true, relax: c })),
];

const normaliseHeader = h => h.trim().toLowerCase().replace(/[\s_-]+/g, '');

/**
 * Header name → column, for one column list.
 *
 * `aliases` exists because the header an admin actually types is not always the
 * API field name: a spreadsheet of results says "exam" or "job", not "jobId".
 * Unmatched headers are only warned about, so an alias is the difference
 * between a column being used and a column being politely ignored.
 */
function headerIndex(columnList) {
  const map = new Map();
  for (const c of columnList) {
    map.set(normaliseHeader(c.key), c);
    for (const a of c.aliases || []) map.set(normaliseHeader(a), c);
  }
  return map;
}

/** A downloadable template, so the admin never has to guess a column name. */
export function csvTemplate() {
  const header = CSV_COLUMNS.map(c => c.key).join(',');
  const example = [
    'Combined Graduate Level Exam 2026', 'Staff Selection Commission', 'SSC/CGL/2026-27',
    'SSC', 'AUTO', '', '17727', '2026-09-15', '2026-10-14', '', '2026-12-05', '',
    '18', '32', 'Bachelor degree in any discipline from a recognised university',
    'Tier 1 (CBT), Tier 2 (CBT), Document Verification',
    'https://ssc.gov.in/apply', 'https://ssc.gov.in/notice.pdf', '',
    '100', '0', '100', '0', '0', '5', '5', '10',
  ];
  // Quote any field containing a comma, matching what parseCsv reads back.
  const cell = v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `${header}\n${example.map(cell).join(',')}\n`;
}

// Accepts 2026-10-14 and the two formats a spreadsheet is likely to emit,
// 14/10/2026 and 14-10-2026, then normalises to ISO because that is what the
// backend parses. Day-first, not month-first: this is an Indian audience and
// 14/10 is unambiguous while 10/14 would be read wrong half the time.
function toIsoDate(raw) {
  const v = raw.trim();
  if (!v) return { value: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return isRealDate(v) ? { value: v } : { error: 'not a real date' };
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (!m) return { error: 'use YYYY-MM-DD or DD/MM/YYYY' };
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isRealDate(iso) ? { value: iso } : { error: 'not a real date' };
}

// new Date('2026-02-31') rolls over to March 3 rather than failing, so the
// only reliable check is to build it and see whether it came back unchanged.
function isRealDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function matchEnum(raw, allowed) {
  const v = raw.trim();
  if (!v) return { value: null };
  const hit = allowed.find(a => a.toLowerCase().replace(/[\s_-]+/g, '') === v.toLowerCase().replace(/[\s_-]+/g, ''));
  if (hit) return { value: hit };
  // The ellipsis is only honest when something is actually being withheld.
  // The listing sections and the notice types are short enough to show in full,
  // and "one of A, B, C…" sends the admin hunting for a fourth value that does
  // not exist. The category and state lists really are truncated.
  const shown = allowed.slice(0, 4);
  const more = allowed.length > shown.length ? '…' : '';
  return { error: `must be one of: ${shown.join(', ')}${more}` };
}

/**
 * Reads one non-blank cell according to its column's type.
 *
 * Returns `{ value }` or `{ error }`, where the error is the half of the
 * sentence that follows the column name — the caller prefixes it. Splitting it
 * this way is what lets two different importers (jobs, and results/admit cards)
 * share every rule without either one owning the message format.
 *
 * `ctx` carries whatever a column type needs to resolve against live data;
 * today that is only the job index used by `jobRef`.
 */
function readCell(col, raw, ctx) {
  const v = raw.trim();

  // Length first, and for text columns only: the backing columns are
  // VARCHAR(255), so an over-long title is a 500 from the database rather than
  // a row the admin can see and fix. Catching it here turns an opaque server
  // error into "line 14: title is too long".
  if (col.max && v.length > col.max) {
    return { error: `must be ${col.max} characters or fewer (this one is ${v.length})` };
  }

  if (col.number || col.jobRef) {
    const n = Number(v.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) {
      // jobRef falls through to a name lookup instead: "SSC CGL 2026" is not a
      // number, and for that column that is the normal case, not an error.
      if (!col.jobRef) return { error: `"${v}" is not a number` };
    } else {
      if (col.integer && !Number.isInteger(n)) return { error: `"${v}" is not a whole number` };
      if (col.min != null && n < col.min) return { error: `must be ${col.min} or more` };
      if (col.jobRef) return resolveJobRef(v, n, ctx);
      return { value: n };
    }
  }

  if (col.jobRef) return resolveJobRef(v, null, ctx);

  if (col.date) return toIsoDate(raw);

  if (col.enum) return matchEnum(raw, col.enum);

  if (col.url) {
    // A link that is not a link is worse than a missing one: it renders as
    // an "Apply Online" button that goes nowhere.
    if (!/^https?:\/\/\S+$/i.test(v)) return { error: 'must start with http:// or https://' };
    return { value: v };
  }

  return { value: v };
}

/**
 * The generic half of importing: match headers, then read and check every cell.
 *
 * Both importers call this. What stays specific to each is supplied as hooks —
 * `newPayload` for the starting shape, `assign` for columns that do not map
 * one-to-one onto a field (the job fee table, a job reference), and `finish`
 * for the cross-field rules, which are where the interesting mistakes live.
 *
 * Every row is validated and returned, valid or not — the caller shows the
 * whole table with the bad rows marked, rather than aborting on the first
 * problem. An importer that stops at row 3 of 200 and tells you nothing about
 * rows 4 to 200 makes the admin run it repeatedly to find out what else is
 * wrong.
 */
function validateRows(rows, columnList, opts = {}) {
  const {
    newPayload = () => ({}),
    assign = (payload, col, value) => { payload[col.key] = value; },
    finish = () => {},
    ctx = null,
  } = opts;

  if (!rows.length) return { headerErrors: ['The file is empty.'], rows: [] };

  const byHeader = headerIndex(columnList);
  const headers = rows[0].map(normaliseHeader);
  const columns = headers.map(h => byHeader.get(h) || null);
  const headerErrors = [];

  const unknown = rows[0].filter((h, i) => h.trim() !== '' && !columns[i]);
  if (unknown.length) headerErrors.push(`Ignored unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);

  for (const c of columnList.filter(c => c.required)) {
    if (!columns.some(col => col && col.key === c.key)) {
      headerErrors.push(`Missing required column: ${c.key}`);
    }
  }

  const mapped = rows.slice(1).map((cells, idx) => {
    const errors = [];
    const payload = newPayload();

    columns.forEach((col, i) => {
      if (!col) return;
      const raw = cells[i] ?? '';

      if (col.required && !raw.trim()) { errors.push(`${col.key} is required`); return; }
      if (!raw.trim()) return;

      const { value, error } = readCell(col, raw, ctx);
      if (error) errors.push(`${col.key}: ${error}`);
      else if (value !== null && value !== undefined) assign(payload, col, value);
    });

    finish(payload, errors);

    // +2: one for the header row, one because spreadsheets count from 1. The
    // number in the error list has to be the number in the admin's editor.
    return { line: idx + 2, payload, errors };
  });

  return { headerErrors, rows: mapped };
}

/**
 * Turns parsed job rows into { payload, errors } per row.
 *
 * The generic work is in validateRows; what lives here is everything specific
 * to a job posting — the two nested maps, and the cross-field rules.
 */
export function mapRows(rows) {
  return validateRows(rows, CSV_COLUMNS, {
    newPayload: () => ({ feeByCategory: {}, ageRelaxationByCategory: {} }),

    // fee* and relax* columns are flat in the CSV and nested in the payload,
    // because a spreadsheet cannot hold a map but the API expects one.
    assign: (payload, col, value) => {
      if (col.fee) payload.feeByCategory[col.fee] = value;
      else if (col.relax) payload.ageRelaxationByCategory[col.relax] = value;
      else payload[col.key] = value;
    },

    finish: (payload, errors) => {
      // Dates that contradict each other. The backend accepts them; a visitor
      // seeing a last date before the start date will assume the whole listing
      // is wrong, which is the reputational cost this site cannot afford.
      if (payload.applicationStartDate && payload.lastDate && payload.lastDate < payload.applicationStartDate) {
        errors.push('lastDate is before applicationStartDate');
      }
      if (payload.ageMin != null && payload.ageMax != null && payload.ageMax < payload.ageMin) {
        errors.push('ageMax is below ageMin');
      }
      if (payload.category === 'STATE_GOVT' && !payload.state) {
        errors.push('state is required for a STATE_GOVT posting');
      }

      if (!payload.category) payload.category = 'CENTRAL_GOVT';
      if (!payload.listingSection) payload.listingSection = 'AUTO';
      if (!Object.keys(payload.feeByCategory).length) delete payload.feeByCategory;
      if (!Object.keys(payload.ageRelaxationByCategory).length) delete payload.ageRelaxationByCategory;
    },
  });
}

// ---------------------------------------------------------------------------
// Results, admit cards and answer keys
//
// The same importer, for the other half of the site. Results arrive in batches —
// one board releases forty district-wise result links on the same afternoon —
// which is exactly the case where typing them one at a time into a form is the
// bottleneck.
// ---------------------------------------------------------------------------

const NOTICE_TYPE_VALUES = NOTICE_TYPES.map(t => t.value);

/**
 * Builds the lookup that lets a CSV reference a job by something a human
 * actually has.
 *
 * The database id is an internal detail that appears nowhere the admin can copy
 * from, so a `jobId` column alone would go unused and every imported result
 * would end up unlinked. Advertisement number and post name are what a working
 * spreadsheet already contains.
 *
 * Names that appear twice are recorded as collisions rather than resolved.
 * "Combined Graduate Level Exam" is the same post name in 2025 and 2026, and
 * quietly attaching this year's result to last year's posting is a worse
 * outcome than asking the admin to use the id.
 */
export function buildJobIndex(jobs) {
  const byId = new Map();
  const byName = new Map();
  const collisions = new Set();

  const add = (key, job) => {
    const k = normaliseHeader(key);
    if (!k) return;
    if (byName.has(k) && byName.get(k).id !== job.id) collisions.add(k);
    else byName.set(k, job);
  };

  for (const job of jobs || []) {
    if (job.id == null) continue;
    byId.set(Number(job.id), job);
    add(job.advertisementNo || '', job);
    add(job.postName || '', job);
  }

  return { byId, byName, collisions, size: byId.size };
}

/**
 * Resolves one `jobId` cell to a numeric id, or explains why it cannot.
 *
 * `ctx.jobIndex` is null when the page has no list to match against — the
 * backend was unreachable. That is distinct from a list that loaded and is
 * empty, and the two get different messages, because "could not be loaded" sent
 * to someone whose site simply has no jobs yet is a wild goose chase.
 */
function resolveJobRef(raw, numeric, ctx) {
  const index = ctx && ctx.jobIndex;

  // A numeric id is what the API stores either way, so it passes through
  // unchecked rather than failing every row over a lookup table that never
  // arrived.
  if (!index) {
    return numeric != null
      ? { value: numeric }
      : { error: `"${raw}" is not a job id, and the job list could not be loaded to look it up by name` };
  }

  if (numeric != null) {
    return index.byId.has(numeric)
      ? { value: numeric }
      : { error: `there is no job with id ${numeric} on this site` };
  }

  const key = normaliseHeader(raw);
  if (index.collisions.has(key)) {
    return { error: `"${raw}" matches more than one job — use the job's id instead so it attaches to the right one` };
  }
  const hit = index.byName.get(key);
  return hit
    ? { value: Number(hit.id) }
    : { error: `no job on this site matches "${raw}" — use its exact post name, its advertisement number, or leave this blank` };
}

/**
 * The columns for a result / admit card / answer key import.
 *
 * Only title and link are required, mirroring the entity: those two are the
 * NOT NULL columns, and everything else the site can render without. `type` is
 * left optional on purpose — the page supplies it, so a file exported from a
 * list of results does not need the word "RESULT" repeated on all forty rows.
 *
 * The 255s are not arbitrary: title, organization and link are VARCHAR(255).
 */
export const NOTICE_CSV_COLUMNS = [
  { key: 'type', enum: NOTICE_TYPE_VALUES },
  { key: 'title', required: true, max: 255 },
  { key: 'organization', max: 255 },
  { key: 'category', enum: CATEGORY_VALUES },
  { key: 'link', required: true, url: true, max: 255 },
  { key: 'releaseDate', date: true },
  { key: 'jobId', jobRef: true, aliases: ['job', 'relatedJob', 'jobName', 'postName', 'advertisementNo'] },
  { key: 'note' },
];

/** A downloadable template, one example row per type. */
export function noticeCsvTemplate() {
  const header = NOTICE_CSV_COLUMNS.map(c => c.key).join(',');
  const examples = [
    ['RESULT', 'SSC CGL 2026 Tier-1 Result', 'Staff Selection Commission', 'SSC',
      'https://ssc.gov.in/result/cgl-2026-tier1', '2026-09-08',
      'Combined Graduate Level Exam 2026', 'Cut-off marks are in the same PDF'],
    ['ADMIT_CARD', 'RRB NTPC 2026 CBT-1 Admit Card', 'Railway Recruitment Board', 'RAILWAY',
      'https://rrbcdg.gov.in/admit-card', '2026-09-02', '',
      'Log in with registration number and date of birth'],
    ['ANSWER_KEY', 'SSC CHSL 2026 Provisional Answer Key', 'Staff Selection Commission', 'SSC',
      'https://ssc.gov.in/answer-key/chsl-2026', '2026-09-05', '',
      'Objections close 7 days after release'],
  ];
  const cell = v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `${header}\n${examples.map(r => r.map(cell).join(',')).join('\n')}\n`;
}

/**
 * Turns parsed notice rows into { payload, errors } per row.
 *
 * `defaultType` fills in the rows that do not name one; `jobs` is the list the
 * jobId column resolves against. Both come from the page, because both are
 * live state rather than properties of the file.
 */
export function mapNoticeRows(rows, { defaultType = 'RESULT', jobs = null } = {}) {
  const jobIndex = jobs ? buildJobIndex(jobs) : null;

  const result = validateRows(rows, NOTICE_CSV_COLUMNS, {
    ctx: { jobIndex },
    finish: (payload) => {
      // Matches what the posting form sends, so a row imported here and a row
      // typed there produce the same record.
      if (!payload.type) payload.type = defaultType;
      if (!payload.category) payload.category = 'CENTRAL_GOVT';
      if (payload.jobId == null) payload.jobId = null;
      if (payload.releaseDate == null) payload.releaseDate = null;
    },
  });

  // Duplicates *within the file* — the paste-it-twice mistake. Nothing in the
  // database stops two identical results being published, and once they are
  // both live the only fix is deleting one by hand from the public list. The
  // first occurrence still imports; only the repeats are held back.
  const seen = new Map();
  for (const row of result.rows) {
    if (row.errors.length || !row.payload.title) continue;
    const key = `${row.payload.type}|${normaliseHeader(row.payload.title)}`;
    if (seen.has(key)) row.errors.push(`line ${seen.get(key)} already has this title and type`);
    else seen.set(key, row.line);
  }

  return result;
}

/**
 * Fields that must NOT carry over when duplicating a posting.
 *
 * Duplicating copies the shape of a posting — the organisation, the category,
 * the eligibility text, the fee table — because those are what stay the same
 * when SSC advertises the same post next year. It deliberately does not copy
 * the specifics: the advertisement number, the dates, the apply link, the PDF,
 * the post count. Those change every cycle, and an inherited one is not a blank
 * to be filled in but a wrong answer that looks like a right one. A stale apply
 * link on a live posting sends thousands of people to last year's closed form.
 */
export const DUPLICATE_CLEARED_FIELDS = [
  'advertisementNo', 'totalPosts',
  'applicationStartDate', 'lastDate', 'admitCardDate', 'examDate', 'resultDate',
  'officialApplyLink', 'notificationPdfUrl',
];

/** Strips a fetched job down to a safe prefill for a new posting. */
export function jobToDuplicate(job) {
  if (!job) return null;
  const copy = { ...job };
  for (const f of DUPLICATE_CLEARED_FIELDS) copy[f] = null;
  // id and slug in particular: leaving id would make JobForm's parent think it
  // is editing, and the slug is derived from the post name on save anyway.
  delete copy.id;
  delete copy.slug;
  delete copy.views;
  delete copy.status;
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy;
}
