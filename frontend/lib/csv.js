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

import { CATEGORIES, SECTIONS, STATES } from './api';

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
const COLUMN_BY_HEADER = new Map(CSV_COLUMNS.map(c => [normaliseHeader(c.key), c]));

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
  return hit ? { value: hit } : { error: `must be one of: ${allowed.slice(0, 4).join(', ')}…` };
}

/**
 * Turns parsed rows into { payload, errors } per row.
 *
 * Every row is validated and returned, valid or not — the caller shows the
 * whole table with the bad rows marked, rather than aborting on the first
 * problem. An importer that stops at row 3 of 200 and tells you nothing about
 * rows 4 to 200 makes the admin run it repeatedly to find out what else is
 * wrong.
 */
export function mapRows(rows) {
  if (!rows.length) return { headerErrors: ['The file is empty.'], rows: [] };

  const headers = rows[0].map(normaliseHeader);
  const columns = headers.map(h => COLUMN_BY_HEADER.get(h) || null);
  const headerErrors = [];

  const unknown = rows[0].filter((h, i) => h.trim() !== '' && !columns[i]);
  if (unknown.length) headerErrors.push(`Ignored unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);

  for (const c of CSV_COLUMNS.filter(c => c.required)) {
    if (!columns.some(col => col && col.key === c.key)) {
      headerErrors.push(`Missing required column: ${c.key}`);
    }
  }

  const mapped = rows.slice(1).map((cells, idx) => {
    const errors = [];
    const payload = { feeByCategory: {}, ageRelaxationByCategory: {} };

    columns.forEach((col, i) => {
      if (!col) return;
      const raw = cells[i] ?? '';

      if (col.required && !raw.trim()) { errors.push(`${col.key} is required`); return; }
      if (!raw.trim()) return;

      if (col.number) {
        const n = Number(raw.trim().replace(/,/g, ''));
        if (!Number.isFinite(n) || n < 0) { errors.push(`${col.key}: "${raw.trim()}" is not a number`); return; }
        if (col.fee) payload.feeByCategory[col.fee] = n;
        else if (col.relax) payload.ageRelaxationByCategory[col.relax] = n;
        else payload[col.key] = n;
        return;
      }

      if (col.date) {
        const { value, error } = toIsoDate(raw);
        if (error) errors.push(`${col.key}: ${error}`);
        else if (value) payload[col.key] = value;
        return;
      }

      if (col.enum) {
        const { value, error } = matchEnum(raw, col.enum);
        if (error) errors.push(`${col.key}: ${error}`);
        else if (value) payload[col.key] = value;
        return;
      }

      if (col.url) {
        const v = raw.trim();
        // A link that is not a link is worse than a missing one: it renders as
        // an "Apply Online" button that goes nowhere.
        if (!/^https?:\/\/\S+$/i.test(v)) { errors.push(`${col.key}: must start with http:// or https://`); return; }
        payload[col.key] = v;
        return;
      }

      payload[col.key] = raw.trim();
    });

    // Dates that contradict each other. The backend accepts them; a visitor
    // seeing a last date before the start date will assume the whole listing is
    // wrong, which is the reputational cost this site cannot afford.
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

    // +2: one for the header row, one because spreadsheets count from 1. The
    // number in the error list has to be the number in the admin's editor.
    return { line: idx + 2, payload, errors };
  });

  return { headerErrors, rows: mapped };
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
