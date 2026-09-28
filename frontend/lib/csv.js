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
 * The columns the importer understands. Two are always required — postName and
 * organization. The two application dates are not: a row may arrive with
 * neither, with only a last date, or with both.
 *
 * That is not laxity, it is the shape of the source material. A notification is
 * routinely published weeks before its form dates are announced, so demanding a
 * date would mean inventing one. V6__upcoming_dates_optional.sql dropped the NOT
 * NULL these two columns used to carry, and Job.java no longer declares them
 * `nullable = false`, precisely so that case can be stored honestly. The one
 * combination the row-level rule still rejects is a start date with no last
 * date, because that job would compute as Active and never close; see the
 * `finish` block in mapRows for the full rule and its reasoning.
 *
 * Note the dates are deliberately NOT marked `required: true`. That flag is
 * unconditional and is checked against the header, before any row has been read
 * at all — it would reject a legitimate file of unopened notifications outright.
 * The conditional check in mapRows below is what implements the real rule.
 *
 * The rule lives in two places on purpose. JobService.validateDates is the
 * authority and answers a readable 400. The copy here runs in the browser, and
 * it earns its keep because import.js POSTs one row at a time: without it the
 * admin meets the error mid-batch, after the rows above it are already
 * committed, and is left with a half-imported file. Catching it here turns that
 * into a line in the "skipped" list naming the field.
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
    const warnings = [];
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

    finish(payload, errors, warnings);

    // +2: one for the header row, one because spreadsheets count from 1. The
    // number in the error list has to be the number in the admin's editor.
    //
    // `warnings` is things worth reading that do not stop the row importing.
    // Kept separate from `errors` rather than folded into it because callers
    // decide what to skip by asking whether `errors` is empty, so a warning in
    // that array would silently become a rejection. It is built before `finish`
    // runs and handed to it, so a cross-field rule can say "imported, but look
    // at this" instead of having only reject-or-stay-silent to choose from.
    return { line: idx + 2, payload, errors, warnings };
  });

  return { headerErrors, rows: mapped };
}

/**
 * The same normalisation the server uses, so "SSC  CGL" and "ssc-cgl" are one
 * name on both sides.
 *
 * This is deliberately the same function as normaliseHeader -- trim, lowercase,
 * collapse away spaces, underscores and hyphens -- but it is given its own name
 * because it is now doing a second, unrelated job. A future change to how
 * headers are matched must not silently change what counts as the same posting.
 */
const normaliseKey = value => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

/**
 * Same post, same organisation. Groups postings for review; never enough on its
 * own to reject one.
 *
 * Mirror of DuplicateKeys.looseKey in the backend. The two must agree, because
 * this one decides what the importer says and that one decides what the server
 * finds -- and an admin told "no duplicates" by one and shown a duplicate by the
 * other would rightly stop trusting both.
 */
export function jobLooseKey(postName, organization) {
  return `${normaliseKey(postName)}|${normaliseKey(organization)}`;
}

/**
 * Same post, same organisation, same last date. This is the one that means the
 * same notification was entered twice.
 *
 * The last date is what separates a mistake from a normal year-on-year repeat.
 * "Combined Graduate Level Exam" at the SSC is a real posting in 2025 and again
 * in 2026 with a different deadline; only a matching deadline makes two rows the
 * same notification. Mirror of DuplicateKeys.strictKey.
 */
export function jobStrictKey(postName, organization, lastDate) {
  return `${jobLooseKey(postName, organization)}|${lastDate || 'no-last-date'}`;
}

/**
 * Marks rows that repeat an earlier row in the same file.
 *
 * The paste-it-twice mistake, which the jobs importer had no defence against at
 * all -- the notices importer has had one since it was written, and jobs are the
 * half of the site where a duplicate is more visible.
 *
 * An exact repeat becomes an error, so only the first copy imports. A loose
 * match becomes a warning and still imports, because that is what next year's
 * recruitment for the same post looks like and refusing it would be wrong.
 */
function flagRepeatsWithinFile(rows) {
  const byStrict = new Map();
  const byLoose = new Map();

  for (const row of rows) {
    // A row that is already being skipped must not claim the first-copy slot.
    // If line 2 has a bad date and line 5 is the same posting entered correctly,
    // line 5 is the one that should import -- not the one rejected for matching
    // a row that never made it in.
    if (row.errors.length) continue;

    const { postName, organization, lastDate } = row.payload;
    if (!normaliseKey(postName)) continue;      // nothing to compare on

    const strict = jobStrictKey(postName, organization, lastDate);
    const loose = jobLooseKey(postName, organization);

    const strictAt = byStrict.get(strict);
    if (strictAt) {
      row.errors.push(
        `same posting as line ${strictAt} — same post name, organization and last date`
      );
      continue;                                  // leave the first copy registered
    }

    const looseAt = byLoose.get(loose);
    if (looseAt) {
      row.warnings.push(
        `line ${looseAt} has the same post name and organization but a different `
        + 'last date — fine if it is a different year, check it is not a typo'
      );
    }

    byStrict.set(strict, row.line);
    if (!byLoose.has(loose)) byLoose.set(loose, row.line);
  }
}

/**
 * Turns parsed job rows into { payload, errors, warnings } per row.
 *
 * The generic work is in validateRows; what lives here is everything specific
 * to a job posting — the two nested maps, the cross-field rules, and the
 * within-file duplicate pass.
 *
 * This catches duplicates *inside one file* only. It cannot see the database, so
 * a row that repeats a posting already on the site looks perfectly fine here;
 * that half of the problem is the importer's duplicate-check call to the server.
 */
export function mapRows(rows) {
  const result = validateRows(rows, CSV_COLUMNS, {
    newPayload: () => ({ feeByCategory: {}, ageRelaxationByCategory: {} }),

    // fee* and relax* columns are flat in the CSV and nested in the payload,
    // because a spreadsheet cannot hold a map but the API expects one.
    assign: (payload, col, value) => {
      if (col.fee) payload.feeByCategory[col.fee] = value;
      else if (col.relax) payload.ageRelaxationByCategory[col.relax] = value;
      else payload[col.key] = value;
    },

    finish: (payload, errors, warnings) => {
      if (!payload.category) payload.category = 'CENTRAL_GOVT';
      if (!payload.listingSection) payload.listingSection = 'AUTO';

      // What each section actually needs in order to behave on the site.
      //
      // This rule used to be "anything except UPCOMING needs both dates", and it
      // was the single biggest reason real notifications never got published. A
      // notification is very often out weeks before the form dates are
      // announced, and the pipeline writes listingSection=AUTO on every row it
      // produces -- so every dateless vacancy was rejected outright rather than
      // listed as upcoming.
      //
      // The rejection was not even protecting anything. AUTO means "work the
      // status out from the dates", and both halves of that calculation already
      // read a missing start date as Upcoming: JobService.computeStatus returns
      // UPCOMING when applicationStartDate is null, and the UPCOMING branch of
      // JobSpecifications.hasStatus matches an AUTO row whose start date is null
      // and whose last date is null or still ahead. A dateless AUTO job lands in
      // Upcoming by itself; there was nothing left for the validator to prevent.
      //
      // So: UPCOMING asks for nothing (unchanged). LATEST is a hand-made pin
      // meaning "this is open now", which needs a real window or it sits on the
      // homepage for ever. AUTO rejects exactly one combination -- a start date
      // with no last date -- because that row computes as ACTIVE and then never
      // closes, which is the "everything says Active" complaint all over again.
      //
      // JobService.validateDates is the server-side twin of this block. They
      // have to agree: if the file passes here and fails there, the importer
      // stops part-way through a batch with some rows published and some not.
      if (payload.listingSection === 'LATEST') {
        if (!payload.applicationStartDate || !payload.lastDate) {
          errors.push(
            'applicationStartDate and lastDate are both needed to pin a row to LATEST. '
            + 'Either fill both dates in, or leave listingSection blank so it is decided '
            + 'from the dates, or put UPCOMING if the form has not opened yet.'
          );
        }
      } else if (payload.listingSection !== 'UPCOMING') {
        if (payload.applicationStartDate && !payload.lastDate) {
          errors.push(
            'lastDate is missing. With a start date and no last date this job would show '
            + 'as Active for ever, because nothing tells the site when it closed. Add the '
            + 'last date, or clear applicationStartDate to list it as upcoming.'
          );
        } else if (!payload.applicationStartDate && !payload.lastDate) {
          warnings.push(
            'no application dates, so this is listed under Upcoming. '
            + 'It moves to Latest on its own once you add the dates.'
          );
        } else if (!payload.applicationStartDate) {
          warnings.push(
            'no applicationStartDate, so this is listed under Upcoming even though the '
            + 'last date is filled in. Add the start date to have it counted as open.'
          );
        }
      }

      // Dates that contradict each other, refused in every section including
      // UPCOMING. An estimated date may be missing or already past -- that is
      // why UPCOMING needs no dates at all -- but a last date before the start
      // date is not an estimate, it is a misread, and a visitor who sees one
      // will assume the whole listing is wrong.
      //
      // JobService.validateDates refuses the same pair, so a row that slips past
      // the browser is caught server-side rather than published. It did not
      // always: it used to return early for UPCOMING and never reach this check.
      if (payload.applicationStartDate && payload.lastDate && payload.lastDate < payload.applicationStartDate) {
        errors.push('lastDate is before applicationStartDate');
      }

      // A maximum age below the minimum is not a borderline call, it is a
      // misread -- the age pattern reaching past the age sentence into a fee, a
      // post count or a relaxation table. Age is an optional field, so throwing
      // the whole vacancy away over it traded the thing students need for a
      // detail they can live without. Both numbers go instead, with a note. Not
      // swapped: a swap would be inventing a range nobody wrote down.
      if (payload.ageMin != null && payload.ageMax != null && payload.ageMax < payload.ageMin) {
        warnings.push(
          `age range ignored: maximum ${payload.ageMax} is below minimum ${payload.ageMin}, `
          + 'which cannot be right, so both were left blank. Fill them in by hand if you want them.'
        );
        delete payload.ageMin;
        delete payload.ageMax;
      }

      if (payload.category === 'STATE_GOVT' && !payload.state) {
        errors.push('state is required for a STATE_GOVT posting');
      }

      if (!Object.keys(payload.feeByCategory).length) delete payload.feeByCategory;
      if (!Object.keys(payload.ageRelaxationByCategory).length) delete payload.ageRelaxationByCategory;
    },
  });

  flagRepeatsWithinFile(result.rows);
  return result;
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

/**
 * Same notice, entered twice. Type plus title, normalised.
 *
 * Exported for the same reason `jobStrictKey` is: the notice collector in
 * `pipeline/` has to decide whether a result it just found is already on the
 * site, and if it answered that question with its own copy of this rule the two
 * could disagree. Then the pipeline would say "new" about something the importer
 * calls a duplicate, or -- far worse -- the other way round, and the same result
 * would be published twice with nothing but a manual delete to fix it.
 *
 * Unlike a job, a notice has no date to separate a legitimate repeat from a
 * mistake. "SSC CGL Tier-1 Result" is published once; there is no next year's
 * sitting under the same title, because the year is part of how these are
 * titled. So the key is deliberately blunt, and the first occurrence wins.
 *
 * Built on `normaliseKey`, not `normaliseHeader`: this is a duplicate-detection
 * rule, and it must not change because someone adjusts how CSV headers are
 * matched.
 */
export function noticeKey(type, title) {
  return `${type || ''}|${normaliseKey(title)}`;
}

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
    const key = noticeKey(row.payload.type, row.payload.title);
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
