/**
 * Finding results and admit cards, and turning them into rows the existing
 * notice importer can read.
 *
 * This is the other half of the pipeline. `run.js` collects vacancies; this
 * collects the two things people come back for after they have applied. It
 * writes `out/notices-YYYY-MM-DD.csv` against `NOTICE_CSV_COLUMNS` and never
 * touches the database -- the admin imports it through
 * `/admin/import-notices`, exactly as with jobs.
 *
 * <b>Why it is a separate collector and not a flag on the job one.</b> The two
 * want different schedules (a result appears the morning it is declared; a
 * vacancy list is worth reading once a day), they want different duplicate rules
 * (a job repeats legitimately next year under the same name, a result does not),
 * and they want different state. Sharing one run would also mean sharing one
 * committed `seen.json`, which two workflows on two schedules would fight over.
 *
 * <b>Answer keys are deliberately not collected.</b> The importer supports the
 * type and the site has a page for it; this collector does not produce them,
 * because an answer key is the one notice where being wrong is expensive -- a
 * provisional key, a revised key and a final key all share a title, and the
 * objection window closes in days. Those go in by hand. Answer-key wording is
 * still recognised, and used to *reject* a link rather than guess at it.
 */
import { NOTICE_CSV_COLUMNS, mapNoticeRows, noticeKey, parseCsv } from './columns.js';
import { datesInText } from './dates.js';
import { SOURCES } from './sources.js';

/**
 * The wording that identifies each type, and the wording that disqualifies a
 * link entirely.
 *
 * Only what a notice is actually called. "Cut off" is not in the result list:
 * boards publish a cut-off list days after the result, as its own PDF, and it is
 * not the result. "Exam city" and "intimation slip" are not in the admit-card
 * list for the same reason -- they are a separate, earlier document, and calling
 * one an admit card would send people looking for a hall ticket that is not
 * there yet.
 *
 * `DISQUALIFY` is the important half. Most links on a government notice board
 * are neither a result nor an admit card, and several of them contain the word
 * "result" while being something else entirely: a corrigendum to a result, a
 * counselling schedule published after one, a notice about when a result will
 * come. Each of those, published as a result, is a wrong answer on a public
 * page.
 */
export const NOTICE_SIGNALS = {
  RESULT: [
    'result', 'results', 'final result', 'merit list', 'selection list', 'scorecard', 'score card',
    'marks sheet', 'marksheet', 'shortlisted candidates', 'list of selected candidates',
    'परिणाम', 'रिजल्ट', 'मेरिट सूची', 'चयन सूची',
  ],
  ADMIT_CARD: [
    'admit card', 'admit cards', 'call letter', 'e-call letter', 'e call letter', 'hall ticket',
    'admission certificate', 'प्रवेश पत्र', 'एडमिट कार्ड',
  ],
};

/** Wording that means "do not treat this link as a result or an admit card". */
export const DISQUALIFY = [
  // Answer keys are out of scope by decision, not by accident.
  'answer key', 'answer keys', 'उत्तर कुंजी', 'objection', 'representation against',
  // Documents *about* a result, which are not the result.
  'corrigendum', 'addendum', 'postponed', 'postponement', 'cancelled', 'cancellation',
  'counselling', 'counseling', 'document verification', 'dv schedule', 'joining', 'appointment letter',
  'syllabus', 'exam scheme', 'exam pattern', 'question paper', 'model paper', 'previous year',
  'exam date notice', 'date of exam notice', 'time table', 'timetable', 'exam city', 'intimation slip',
  'declaration of result will', 'regarding result',
];

/**
 * Wording that means the link is a vacancy, which the job collector handles.
 *
 * Checked against the anchor text only, and it is what keeps the two collectors
 * from both claiming the same link. `discover.isCandidate` already refuses an
 * aggregator link whose text says "result" unless it also says "online form";
 * this is the mirror of that rule, so a link cannot satisfy both.
 */
export const APPLICATION_WORDS = ['online form', 'apply online', 'recruitment', 'vacanc', 'bharti', 'भर्ती', 'notification for recruitment'];

/** Anchor text that says nothing. A notice titled "Click Here" is worse than none. */
const GENERIC_TEXT = /^(?:click\s*here|click|here|view|view\s*details?|details?|download|download\s*(?:here|pdf|now)?|link|open|read\s*more|more|pdf|new|see|check|check\s*here|apply|login|register|home|next|previous|\d+|[^a-zऀ-ॿ]*)$/i;

const lower = value => String(value || '').toLowerCase();
const hasAny = (haystack, words) => words.some(word => haystack.includes(lower(word)));

/**
 * Which of the two types a link is, or why it is neither.
 *
 * <b>The anchor text decides, not the surrounding row.</b> Context is read to
 * *reject* (a row that mentions an answer key is not safe to call a result) and
 * to fill in a title when the anchor says "Click Here", but a type signal found
 * only in the context is not enough to publish on. On an aggregator's front page
 * every link sits in a block that mentions results, admit cards and forms
 * together; trusting context there would label everything a result.
 *
 * Returns `{ type, reason }`. `type` is null when the link is not one of the two
 * collected kinds, and `reason` always says which rule decided, because that
 * column in the report is how a missing result gets diagnosed.
 */
export function classifyNotice({ text = '', context = '', url = '' } = {}) {
  const anchor = lower(text);
  // The path, not the query string: `?id=result_2026` is a real pattern, but so
  // is a tracking parameter, and a URL is not something a human wrote as a
  // title. Only used to break a tie the anchor cannot.
  let pathname = '';
  try { pathname = lower(new URL(url).pathname); } catch { pathname = ''; }
  const around = `${anchor} ${lower(context)}`;

  if (!anchor.trim() && !pathname) return { type: null, reason: 'the link has no text at all' };

  if (hasAny(around, DISQUALIFY)) {
    const hit = DISQUALIFY.find(word => around.includes(lower(word)));
    return { type: null, reason: `mentions "${hit}", which is not a result or an admit card` };
  }
  if (hasAny(anchor, APPLICATION_WORDS)) {
    const hit = APPLICATION_WORDS.find(word => anchor.includes(lower(word)));
    return { type: null, reason: `reads as a vacancy ("${hit}") — the job collector handles these` };
  }

  const matched = Object.entries(NOTICE_SIGNALS)
    .map(([type, words]) => {
      const inAnchor = words.find(word => anchor.includes(lower(word)));
      const inPath = words.find(word => pathname.includes(lower(word).replace(/\s+/g, '-')) || pathname.includes(lower(word).replace(/\s+/g, '')));
      return { type, word: inAnchor || inPath, fromAnchor: Boolean(inAnchor) };
    })
    .filter(entry => entry.word);

  if (!matched.length) return { type: null, reason: 'no result or admit-card wording in the link text' };
  if (matched.length > 1) {
    /* "Result and Admit Card" happens -- a board links a combined page, or an
       aggregator writes one row for both. There is no honest way to pick, and
       picking wrongly publishes an admit card on the result page. It goes in the
       report as needing a person instead. */
    return { type: null, reason: `says both ${matched.map(m => `"${m.word}"`).join(' and ')}, so which it is cannot be decided from the link` };
  }

  const [only] = matched;
  return {
    type: only.type,
    reason: only.fromAnchor
      ? `the link text says "${only.word}"`
      : `the link text is uninformative; "${only.word}" comes from the URL path`,
    evidence: only.word,
  };
}

/**
 * The title as it will appear on the public page.
 *
 * The anchor text first, its table row second, and nothing at all third. There
 * is no fallback to the URL or to a constructed string like "Result from
 * ssc.gov.in": a title is the only field the Result page has to describe a row,
 * and an invented one is indistinguishable from a real one once it is published.
 * A link with no usable title is reported as skipped, with its URL, which takes
 * one click to resolve by hand.
 *
 * 255 is the column width. Truncation cuts on a word boundary and appends
 * nothing -- an ellipsis would read as part of the title.
 */
export function noticeTitle({ text = '', context = '' } = {}) {
  const clean = value => String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:|•·»>]+/, '')
    .replace(/[\s\-–—:|•·«<]+$/, '')
    .trim();

  for (const candidate of [clean(text), clean(context)]) {
    if (!candidate || candidate.length < 8 || GENERIC_TEXT.test(candidate)) continue;
    if (candidate.length <= 255) return { value: candidate, reason: null };
    const cut = candidate.slice(0, 255);
    const boundary = cut.lastIndexOf(' ');
    return {
      value: (boundary > 200 ? cut.slice(0, boundary) : cut).trim(),
      reason: `title was ${candidate.length} characters and the column holds 255, so it was cut short`,
    };
  }
  return { value: null, reason: 'no usable title: the link text is generic and its row gave nothing better' };
}

/**
 * Organisation and category, taken from the configured sources or left blank.
 *
 * For an official source both are already known -- they are declared in
 * `sources.js` next to the URL. The aggregator is the hard case: it carries
 * notices from every board in the country under one roof, so its own
 * configuration says nothing about any individual row.
 *
 * Rather than keep a table of abbreviations (which would be wrong the first time
 * a new board appears, and wrong silently), the only evidence accepted is the
 * id of a source this pipeline already watches, appearing as a whole word in the
 * title: "SSC CGL 2026 Result" names the SSC. `\b` matters -- "BSSC" is the
 * Bihar commission and must not be read as "SSC". Two matches mean no match,
 * following `buildJobIndex`: a collision is reported, never resolved.
 *
 * When nothing matches, both fields are left blank. `mapNoticeRows` then
 * defaults the category to CENTRAL_GOVT, which is the same thing that happens
 * when the admin types a notice in without choosing one.
 */
export function inferOrigin(title, source, sources = SOURCES) {
  if (source && source.kind !== 'aggregator' && source.organization) {
    return { organization: source.organization, category: source.category || '', reason: `declared for ${source.name}` };
  }
  const haystack = String(title || '');
  const hits = sources.filter(candidate => {
    if (candidate.kind === 'aggregator' || !candidate.organization) return false;
    return new RegExp(`\\b${candidate.id}\\b`, 'i').test(haystack);
  });
  if (hits.length === 1) {
    return { organization: hits[0].organization, category: hits[0].category || '', reason: `the title names ${hits[0].id.toUpperCase()}` };
  }
  return {
    organization: '',
    category: '',
    reason: hits.length > 1
      ? `the title names ${hits.map(h => h.id.toUpperCase()).join(' and ')}, so the organisation is ambiguous and was left blank`
      : 'no configured organisation is named in the title, so it was left for the admin to fill in',
  };
}

/** How far back a date in a notice row is still plausibly its release date. */
export const RELEASE_DATE_WINDOW_DAYS = 90;

/**
 * The release date, if the row states one plainly, and otherwise nothing.
 *
 * A result's release date is in the recent past. A date in the future is
 * something else -- the exam it relates to, the closing date of the vacancy it
 * came from, the start of a counselling round -- and writing one into
 * `releaseDate` would put a result on the site dated next March. So future dates
 * are refused outright, and anything older than ninety days is refused too,
 * because a notice board lists last year's results below this morning's and the
 * first date in a flattened table row is frequently the wrong row's.
 *
 * Within that window the *latest* date wins. A row reading "Exam 12/08/2026,
 * Result 26/09/2026" has both, and the result is the later of the two.
 *
 * A blank is a perfectly good answer here: `releaseDate` is nullable, the public
 * page renders without it, and `datesInText` finding two candidates is not
 * evidence that either is the release date.
 */
export function releaseDateFrom({ text = '', context = '' } = {}, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const earliest = new Date(now.getTime() - RELEASE_DATE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const found = datesInText(`${text} ${context}`, { now })
    .filter(value => value <= today && value >= earliest)
    .sort();
  if (!found.length) return { value: '', reason: 'no plainly stated date within the last 90 days; left blank rather than guessed' };
  return { value: found[found.length - 1], reason: found.length > 1 ? `the latest of ${found.length} dates in the row` : 'the only recent date in the row' };
}

/**
 * One discovered link -> one row shaped for NOTICE_CSV_COLUMNS, or a skip.
 *
 * Two columns are deliberately always blank, and both are decisions rather than
 * omissions:
 *
 *   - <b>jobId.</b> Attaching a result to the wrong posting is the failure
 *     `buildJobIndex` already refuses to risk, and it is not visible afterwards
 *     -- the result shows up under a job nobody was expecting. The admin screen
 *     resolves this column by post name against the live job list, with
 *     collision detection, which is the right place for it.
 *   - <b>note.</b> It renders on the public page. The obvious thing to put
 *     there is provenance ("found via sarkariresult.com.cm"), which is exactly
 *     the thing that must not be shown to visitors and exactly the thing the
 *     report is for.
 */
export function buildNoticeRow({ link, source, now = new Date(), sources = SOURCES }) {
  const classification = classifyNotice({ text: link.text, context: link.context, url: link.url });
  if (!classification.type) return { skipped: true, ...classification };

  const title = noticeTitle({ text: link.text, context: link.context });
  if (!title.value) return { skipped: true, type: classification.type, reason: title.reason };

  const origin = inferOrigin(title.value, source, sources);
  const release = releaseDateFrom({ text: link.text, context: link.context }, now);

  return {
    skipped: false,
    type: classification.type,
    row: {
      type: classification.type,
      title: title.value,
      organization: origin.organization,
      category: origin.category,
      link: link.url,
      releaseDate: release.value,
      jobId: '',
      note: '',
    },
    notes: [classification.reason, origin.reason, release.reason, title.reason].filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Writing the file
//
// Same shape as csv-out.js and for the same reasons: the header is generated
// from the imported column list rather than typed, and an unknown key is an
// error instead of a silent drop.
// ---------------------------------------------------------------------------

export function cell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const noticeHeader = () => NOTICE_CSV_COLUMNS.map(c => c.key).join(',');

export function noticeRowToLine(row) {
  const known = new Set(NOTICE_CSV_COLUMNS.map(c => c.key));
  const unknown = Object.keys(row).filter(k => !known.has(k) && !k.startsWith('_'));
  if (unknown.length) {
    throw new Error(`Not a notice CSV column: ${unknown.join(', ')}. Known columns: ${[...known].join(', ')}`);
  }
  return NOTICE_CSV_COLUMNS.map(c => cell(row[c.key])).join(',');
}

export function toNoticeCsv(rows) {
  return [noticeHeader(), ...rows.map(noticeRowToLine)].join('\n') + '\n';
}

/**
 * Run the importer's own validator over the file before writing it.
 *
 * `jobs: null` on purpose. The importer resolves the `jobId` column against the
 * live job list, and this collector writes that column blank, so there is
 * nothing to resolve -- and passing a job list here would mean this preview and
 * the admin screen were validating different things.
 *
 * As in `previewValidation`, nothing is rejected. A row the importer will skip
 * is still written, because the admin screen shows skipped rows with their links
 * and that is how a half-read notice reaches a person.
 */
export function previewNoticeValidation(csvText, { defaultType = 'RESULT' } = {}) {
  const { headerErrors, rows } = mapNoticeRows(parseCsv(csvText), { defaultType, jobs: null });
  const invalid = rows.filter(r => r.errors.length > 0);
  const describe = r => ({ line: r.line, title: r.payload.title || '(no title)', type: r.payload.type || defaultType });
  return {
    total: rows.length,
    valid: rows.length - invalid.length,
    invalid: invalid.length,
    headerErrors,
    problems: invalid.map(r => ({ ...describe(r), errors: r.errors })),
    notes: rows.filter(r => (r.warnings || []).length > 0).map(r => ({ ...describe(r), warnings: r.warnings })),
  };
}

/**
 * The duplicate rule for notices: already on the site, or already in this run.
 *
 * Both identities are checked, and they catch different mistakes. The link
 * catches the same PDF listed under two different headings on the same board.
 * The key -- type plus normalised title, `noticeKey` from the app itself --
 * catches the same result reached through two different URLs, which is the usual
 * case when the aggregator and the issuing body both carry it.
 *
 * Unlike jobs there is no "different date, so it is next year's" exemption. A
 * result is published once. If two rows share a type and a title, one of them is
 * redundant, and the first wins -- matching the importer, where the earliest
 * line is the keeper.
 */
export function createNoticeDuplicateFilter({ publishedLinks = new Set(), publishedKeys = new Set() } = {}) {
  const seenThisRun = new Map();
  return {
    reasonToDrop(row) {
      if (row.link && publishedLinks.has(row.link)) {
        return { published: true, reason: 'already on the site — same link' };
      }
      const key = noticeKey(row.type, row.title);
      if (publishedKeys.has(key)) {
        return { published: true, reason: 'already on the site — same type and title' };
      }
      const earlier = seenThisRun.get(key);
      if (earlier) return { published: false, reason: `same notice as "${earlier}" earlier in this run` };
      if (row.link && seenThisRun.has(`link:${row.link}`)) {
        return { published: false, reason: `same link as "${seenThisRun.get(`link:${row.link}`)}" earlier in this run` };
      }
      return null;
    },
    remember(row) {
      seenThisRun.set(noticeKey(row.type, row.title), row.title);
      if (row.link) seenThisRun.set(`link:${row.link}`, row.title);
    },
  };
}
