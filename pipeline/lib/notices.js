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
  // The city-intimation notice is the trap this list exists for. SSC publishes
  // "Information regarding the city of examination and Admission Certificate
  // for ..." weeks before the admit card itself, and the words "admission
  // certificate" in it are enough to file it as an ADMIT_CARD -- which sends a
  // candidate looking for a hall ticket that does not exist yet. 'exam city'
  // above does not catch it, because SSC writes it the long way round.
  'city of examination', 'city intimation', 'examination city',
  'declaration of result will', 'regarding result',
];

/**
 * Pages an aggregator links to that are the site, not a notice.
 *
 * An index or section page carries every notice on the site and belongs to
 * none of them, so publishing one gives a visitor a link titled "Admit Card"
 * that leads to a list. All five junk rows in the 2026-09-28 run were of this
 * kind. They were not caught by `looksLikeChrome`'s self-link test because that
 * compares against the *configured* source page -- `/latest-jobs/` -- and the
 * links were to `/`, `/result/`, `/admit-card/` and `/latest-posts/`.
 *
 * A list rather than a heuristic, and applied to aggregators only. On an
 * official board `ssc.gov.in/result` may well be the one page a result is
 * published on, and refusing it would lose real notices.
 */
export const AGGREGATOR_SECTIONS = new Set([
  'home', 'index', 'result', 'results', 'admit-card', 'admit-cards', 'admitcard',
  'answer-key', 'answer-keys', 'latest-job', 'latest-jobs', 'latest-post', 'latest-posts',
  'syllabus', 'admission', 'admissions', 'sarkari-result', 'sarkari-exam', 'sarkari-yojana',
  'certificate-verification', 'documents', 'important', 'others', 'notification', 'notifications',
  'job', 'jobs', 'category', 'tag', 'page', 'about', 'about-us', 'contact', 'contact-us',
  'privacy-policy', 'disclaimer', 'terms', 'sitemap',
]);

/** Words that, around a site's own name, still say only the site's own name. */
const BRAND_FILLER = /^(?:official|the|com|cm|co|in|net|org|www|home|homepage|website|portal|site|update|updates|latest|new|visit|welcome|to|sarkari)*$/;

/** The aggregator linking to its own home page or one of its section pages. */
export function isSectionPage(url) {
  let segments;
  try { segments = new URL(url).pathname.split('/').filter(Boolean); }
  catch { return false; }
  if (!segments.length) return true;
  return segments.every(segment => AGGREGATOR_SECTIONS.has(segment.toLowerCase()));
}

/** Anchor text that is the site's own name and nothing else. */
export function isOwnBrandText(text, source) {
  const flat = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!flat) return false;
  const brands = (source?.allowedHosts || [])
    .map(host => host.replace(/^www\./, '').split('.')[0].toLowerCase())
    .filter(token => token.length >= 5);
  return brands.some(brand => flat.includes(brand) && BRAND_FILLER.test(flat.split(brand).join('')));
}

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
 *
 * `source` is optional and only ever narrows the answer. Passing it switches on
 * the two aggregator rules below; leaving it out is the behaviour every official
 * board gets, and nothing an official source would have been given is taken
 * away by supplying it.
 */
export function classifyNotice({ text = '', context = '', url = '', source = null } = {}) {
  const anchor = lower(text);
  // The path, not the query string: `?id=result_2026` is a real pattern, but so
  // is a tracking parameter, and a URL is not something a human wrote as a
  // title. Only used to break a tie the anchor cannot.
  let pathname = '';
  try { pathname = lower(new URL(url).pathname); } catch { pathname = ''; }
  const around = `${anchor} ${lower(context)}`;

  if (!anchor.trim() && !pathname) return { type: null, reason: 'the link has no text at all' };

  /* Ankit asked for the aggregator to stay as a discovery source, so this
     refuses its furniture rather than the site. Both checks run before the
     wording checks: "Admit Card" pointing at /admit-card/ satisfies every
     signal test there is, and the only thing wrong with it is that it is a
     menu. */
  if (source?.kind === 'aggregator') {
    if (isSectionPage(url)) {
      return { type: null, reason: `points at the aggregator's own section page, which lists notices rather than being one` };
    }
    if (isOwnBrandText(text, source)) {
      return { type: null, reason: `the link text is just the site's own name ("${String(text).trim()}"), not the name of a notice` };
    }
  }

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

// ---------------------------------------------------------------------------
// Titles
//
// What a notice board prints on its home page is not a title. It is a filing
// reference with the post name buried in the middle:
//
//   03 Oct 2026 NOTICE REGARDING ADMIT CARD FOR ADVT.NO.D-6/E-1/2025,
//   VETERINARY OFFICER (SCREENING) EXAM-2025, (EXAM. DATED:-03/10/2026)
//
// Four of those five parts are noise on our page. The release date has its own
// column. "Notice regarding admit card" repeats the `type` column, which is how
// the row is filed and how the visitor got to the page. The advertisement number
// means nothing to someone who did not apply, and the exam date is not the
// release date. What is left -- "Veterinary Officer (Screening) Exam-2025" -- is
// the only part that answers "whose admit card is this".
//
// The shouting is stripped too. UPPSC writes in capitals because its board is
// plain HTML from 2009; a list of capitalised headlines on a modern page reads
// as an error.
// ---------------------------------------------------------------------------

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';

/** A date the board printed in front of the headline: "03 Oct 2026 ...". */
const LEADING_DATE = new RegExp(
  '^(?:'
  + `\\d{1,2}\\s*(?:st|nd|rd|th)?[\\s.,/-]*(?:${MONTHS})[a-z]*\\.?[\\s.,/-]*\\d{2,4}`
  + `|(?:${MONTHS})[a-z]*\\.?[\\s.,/-]*\\d{1,2}(?:st|nd|rd|th)?[\\s.,/-]*\\d{2,4}`
  + '|\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}'
  + ')\\s*[-–—:|,]*\\s*',
  'i',
);

/** "(EXAM. DATED:-03/10/2026)" -- the date of the exam, not of the notice. */
const TRAILING_EXAM_DATE = /[\s,;|(-]*\b(?:exam|examination)\.?\s*dat(?:e|ed|es)?\s*[:.\-–]*\s*\d[\d./\s-]*\)?\s*$/i;

/** The words that only repeat the `type` column. */
const TYPE_WORDS = 'admit\\s*cards?|e-?\\s*call\\s*letters?|call\\s*letters?|hall\\s*tickets?'
  + '|admission\\s*certificates?|final\\s*results?|results?|merit\\s*lists?|selection\\s*lists?'
  + '|score\\s*cards?|scorecards?';

/**
 * "NOTICE REGARDING ADMIT CARD FOR", "CLICK HERE TO DOWNLOAD ADMIT CARD FOR",
 * "RESULT OF" -- a lead-in, the type word, and a connector.
 *
 * The connector is required. Without it "Admit Card" on its own would be cut to
 * nothing, and a row whose whole title is the type word should be reported as
 * having no usable title rather than quietly emptied.
 */
const BOILERPLATE_PREFIX = new RegExp(
  '^(?:click\\s*here\\s*)?(?:to\\s*)?(?:download|view|see|check|get|obtain)?\\s*'
  + '(?:notice\\s*(?:regarding|for|of|about)\\s*)?(?:the\\s*)?'
  + `(?:${TYPE_WORDS})\\s*(?:for|of|:|–|—|-)\\s*`,
  'i',
);

/** "ADVT. NO. D-6/E-1/2025", "ADVT.NO.D-6/E-1/2025", "Advertisement No 5/2026". */
const ADVERT_NUMBER = /\b(?:advt|advertisement|adv|notification)\.?\s*(?:no|number)?\.?\s*:?\s*[A-Za-z]{0,4}[-–]?\s?\d+(?:\s*\/\s*[A-Za-z0-9.()-]+)*\s*\/\s*\d{2,4}\s*[,;:.-]*\s*/gi;

/**
 * The same code with the words left off: "RESULT OF D-1/E-1/2026, MEDICAL ...".
 *
 * UPPSC writes it both ways on the same board, so one rule cannot cover both.
 * Anchored to the start, and only after the boilerplate has gone, because that
 * is the one position where a bare code cannot be anything else. A code in the
 * middle of a title is usually the post's own serial ("S-08/19"), which is part
 * of the name and distinguishes two otherwise identical postings.
 */
const BARE_ADVERT_CODE = /^[A-Za-z]{1,4}[-–]\d+(?:\s*\/\s*[A-Za-z0-9.()-]+)*\s*\/\s*\d{2,4}\s*[,;:.-]*\s*/;

/**
 * The mark a board leaves when it cuts a headline to fit its ticker.
 *
 * Two or more dots, or an ellipsis. One dot is an abbreviation ("EXAM-2025.")
 * and must not be read as truncation -- that distinction is the whole reason
 * `collapseTruncatedTitles` can be trusted to drop a row.
 */
const TRUNCATION_MARK = /(?:\.{2,}|…)\s*$/;

/* Letter groups that stay capitalised when the shouting is undone. Only
   abbreviations a reader would find odd in Title Case; anything not listed is
   title-cased, which is the safe direction -- "Ntpc" is ugly, but "TOWN" left
   shouting in the middle of a sentence looks like a bug. */
const ACRONYMS = new Set([
  'ssc', 'cgl', 'chsl', 'mts', 'gd', 'cpo', 'je', 'ae', 'jht', 'upsc', 'psc', 'uppsc', 'bpsc', 'rpsc',
  'mppsc', 'ukpsc', 'wbpsc', 'tnpsc', 'kpsc', 'appsc', 'tspsc', 'hpsc', 'hppsc', 'jpsc', 'cgpsc', 'opsc',
  'rrb', 'rrc', 'ntpc', 'alp', 'ibps', 'sbi', 'rbi', 'lic', 'esic', 'epfo', 'nvs', 'kvs', 'ncert', 'aiims',
  'iti', 'anm', 'gnm', 'pgt', 'tgt', 'prt', 'ldc', 'udc', 'cbt', 'pet', 'pst', 'cpt', 'tet', 'ctet', 'net',
  'jrf', 'phd', 'mbbs', 'bams', 'bhms', 'bds', 'llb', 'llm', 'btech', 'mtech', 'mba', 'mca', 'bca', 'bsc',
  'msc', 'bcom', 'mcom', 'ews', 'obc', 'pwd', 'pwbd', 'ncc', 'nic', 'ib', 'cisf', 'crpf', 'bsf', 'itbp',
  'ssb', 'nia', 'cbi', 'drdo', 'isro', 'ongc', 'bhel', 'ntpcl', 'drm', 'hq',
]);

/* Words that stay lowercase inside a title, as in ordinary English headline
   case. Never applied to the first word. */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'cum', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with']);

const ROMAN_NUMERAL = /^(?:i{1,3}|iv|vi{0,3}|ix|xi{0,3}|xiv|xv|x)$/;

/** "U.P.", "S.S.C." -- dotted initials keep their capitals and their dots. */
const DOTTED_INITIALS = /^[A-Za-z](?:\.[A-Za-z])+\.?$/;

/**
 * Is this written in capitals? Then it was the board's stylesheet talking.
 *
 * Counted per word rather than per letter, over words of four letters or more.
 * A letter ratio gets this wrong in both directions: "SSC CGL Tier-1 Result
 * 2026" is half capitals and must be left exactly as it is, while "UTTAR
 * PRADESH AYUSH (AYURVEDA) DEPARTMENT, Reader Rachna Shareer, S-9/04" -- one
 * real UPPSC heading -- is only 71% capital letters because the board typed
 * three words of it properly, and it plainly is shouting.
 *
 * Short words are excluded because they are where the abbreviations live: SSC,
 * CGL, RRB, U.P.. Counting those as shouting would make every ordinary title
 * that names a commission look like a board heading. Two qualifying words are
 * the minimum, so a one-word anchor is never re-cased on a sample of one.
 */
export function isShouting(value) {
  const words = String(value || '').match(/[A-Za-z]{4,}/g) || [];
  if (words.length < 2) return false;
  const shouted = words.filter(word => word === word.toUpperCase()).length;
  return shouted / words.length >= 0.6;
}

/** ALL CAPS -> Title Case, leaving acronyms and dotted initials alone. */
export function toTitleCase(value) {
  let tokenIndex = -1;
  return String(value || '').replace(/\S+/g, token => {
    tokenIndex += 1;
    const core = token.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9.]+$/, '');
    if (DOTTED_INITIALS.test(core)) return token;
    const firstToken = tokenIndex === 0;
    let runIndex = -1;
    return token.replace(/[A-Za-z]+/g, run => {
      runIndex += 1;
      const lowered = run.toLowerCase();
      if (ACRONYMS.has(lowered) || (run.length > 1 && ROMAN_NUMERAL.test(lowered))) return run.toUpperCase();
      if (!firstToken && runIndex === 0 && SMALL_WORDS.has(lowered)) return lowered;
      return lowered.charAt(0).toUpperCase() + lowered.slice(1);
    });
  });
}

const tidyEdges = value => String(value || '')
  .replace(/\s+/g, ' ')
  .replace(/\s*,(\s*,)+/g, ',')
  .replace(/\s+,/g, ',')
  .replace(/^[\s\-–—:|•·»>,;.()/\\]+/, '')
  .replace(/[\s\-–—:|•·«<,;/\\(]+$/, '')
  .trim();

/**
 * A board headline -> the name of the thing the notice is about.
 *
 * Order matters and is not arbitrary. The leading date goes first so the
 * boilerplate test starts at the real first word. The trailing exam date goes
 * before the advertisement number, because both end in a year and removing the
 * advertisement number first would leave a stray parenthesis for the date rule
 * to anchor on. Title Case is last, on what survives, so the acronym list is
 * only ever asked about words a reader will see.
 *
 * Returns `{ value, truncated, changed }`. `truncated` is not cosmetic: it is
 * what lets `collapseTruncatedTitles` drop a ticker entry in favour of the full
 * one instead of publishing the same notice twice.
 */
/**
 * Filler is every word a notice headline spends on saying that it *is* a
 * notice. What survives the strips has to say more than that.
 *
 * Without this test the strips can turn a headline into a true fragment rather
 * than into a name: "Result of 2026 Exam" loses "Result of" to the boilerplate
 * rule and lands on "2026 Exam", which is nine characters and so clears both of
 * the other guards while telling a reader nothing. The length test cannot catch
 * it and `GENERIC_TEXT` is a whole-string match, so neither of them will.
 *
 * Any run of Devanagari counts as naming something. The list below is English,
 * every strip rule that can produce a fragment is English, and a Hindi headline
 * therefore reaches here unstripped -- there is nothing for this test to judge.
 */
const FILLER_WORDS = new Set([
  'admit', 'card', 'cards', 'call', 'letter', 'letters', 'hall', 'ticket', 'tickets',
  'admission', 'certificate', 'certificates', 'result', 'results', 'final', 'merit',
  'list', 'lists', 'selection', 'score', 'scorecard', 'scorecards', 'notice', 'notices',
  'regarding', 'download', 'click', 'here', 'view', 'exam', 'exams', 'examination',
  'examinations', 'date', 'dated', 'dates', 'advt', 'advertisement', 'number', 'the',
  'for', 'and', 'of', 'no', 'year', 'new', 'link', 'pdf', 'out', 'declared', 'released',
]);

export function namesSomething(value) {
  if (/[ऀ-ॿ]{3,}/.test(String(value || ''))) return true;
  const words = String(value || '').match(/[A-Za-z]{3,}/g) || [];
  return words.some(word => !FILLER_WORDS.has(word.toLowerCase()));
}

export function cleanNoticeTitle(raw) {
  let value = tidyEdges(raw);
  if (!value) return { value: '', truncated: false, changed: false };
  const before = value;

  const truncated = TRUNCATION_MARK.test(value);
  if (truncated) value = value.replace(TRUNCATION_MARK, '');

  value = value.replace(LEADING_DATE, '');
  value = value.replace(TRAILING_EXAM_DATE, '');
  value = value.replace(BOILERPLATE_PREFIX, '');
  value = value.replace(ADVERT_NUMBER, '');
  value = value.replace(BARE_ADVERT_CODE, '');
  value = tidyEdges(value);

  if (isShouting(value)) value = toTitleCase(value);

  return { value, truncated, changed: value !== before };
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
 * <b>The candidate is judged before it is cleaned, and kept if cleaning empties
 * it.</b> Those are two separate guards against the same failure. "Click Here"
 * is refused on the raw text, so a cleaning rule can never rescue a generic
 * anchor into something that looks specific. And a headline that is *entirely*
 * boilerplate falls back to the board's own words rather than to a fragment --
 * an over-eager strip should produce an ugly title, never a wrong one.
 *
 * 255 is the column width. Truncation cuts on a word boundary and appends
 * nothing -- an ellipsis would read as part of the title.
 */
export function noticeTitle({ text = '', context = '' } = {}) {
  for (const raw of [text, context]) {
    const candidate = tidyEdges(raw);
    if (!candidate || candidate.length < 8 || GENERIC_TEXT.test(candidate)) continue;

    const cleaned = cleanNoticeTitle(candidate);
    /* No character-count floor. There was one, and it was dead weight:
       `namesSomething` already requires a surviving word of three letters or
       more, which is a stronger test than any length can be -- it rejects "AE"
       and "2026" while accepting "Peon", a real four-letter post name that a
       floor of five would have thrown away. */
    const usable = !GENERIC_TEXT.test(cleaned.value) && namesSomething(cleaned.value);
    const value = usable ? cleaned.value : candidate;
    const trimmedNote = usable && cleaned.changed
      ? 'the board\'s date, "notice regarding" wording and advertisement number were trimmed off the title'
      : null;

    if (value.length <= 255) {
      // Flagged on the raw headline, not on the cleaned one. The ".." is
      // something the board did, and it is still there in the fallback value,
      // so a human should be told about it either way.
      return { value, truncated: cleaned.truncated, reason: trimmedNote };
    }
    const cut = value.slice(0, 255);
    const boundary = cut.lastIndexOf(' ');
    return {
      value: (boundary > 200 ? cut.slice(0, boundary) : cut).trim(),
      // A title cut by us is truncated in exactly the sense the collapse rule
      // cares about, whatever the board did.
      truncated: true,
      reason: `title was ${value.length} characters and the column holds 255, so it was cut short`,
    };
  }
  return { value: null, truncated: false, reason: 'no usable title: the link text is generic and its row gave nothing better' };
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
  const classification = classifyNotice({ text: link.text, context: link.context, url: link.url, source });
  if (!classification.type) return { skipped: true, ...classification };

  const title = noticeTitle({ text: link.text, context: link.context });
  if (!title.value) return { skipped: true, type: classification.type, reason: title.reason };

  const origin = inferOrigin(title.value, source, sources);
  const release = releaseDateFrom({ text: link.text, context: link.context }, now);

  return {
    skipped: false,
    type: classification.type,
    // Not a column: `noticeRowToLine` refuses keys the CSV does not have, and
    // this is a fact about how the board printed the headline, not about the
    // notice. `collapseTruncatedTitles` is its only reader.
    truncated: title.truncated,
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
    notes: [
      classification.reason,
      origin.reason,
      release.reason,
      title.reason,
      // Said out loud because a clipped heading that has no full twin in the
      // run is kept, and it will go on the site missing its last few words.
      // The report is the only place that can be noticed before import.
      title.truncated ? 'the board cut this heading short — open the link and check the full name before importing' : null,
    ].filter(Boolean),
  };
}

/**
 * The same notice, listed twice by one board, under a cut-short heading and a
 * full one.
 *
 * UPPSC does this on every notice: the scrolling ticker carries the headline
 * clipped to eighty characters with ".." on the end, pointing at
 * `Open_PDF_DB.aspx`, and the table below carries the whole thing pointing at
 * `Open_PDF.aspx`. Different URL, different title, so neither the link rule nor
 * the `noticeKey` rule in `createNoticeDuplicateFilter` sees a duplicate, and
 * both halves reach the site.
 *
 * <b>Why this is a pass over the whole run and not another case in the
 * duplicate filter.</b> That filter decides one row at a time in page order,
 * and the ticker comes first. Asked about the clipped row it has not yet seen
 * the full one, so the only row it could drop is the good one. The answer has
 * to be computed when every row is known.
 *
 * Matching is on the normalised title being a strict prefix, within one type
 * and one source. Cross-source is deliberately not attempted: two boards
 * wording the same result differently is the existing key rule's job, and a
 * prefix match across sites would collapse "Assistant Professor" from one board
 * into "Assistant Professor (Mains) 2025" from another.
 *
 * Returns one entry per input, `null` to keep and `{ reason, keptTitle }` to
 * drop.
 */
export function collapseTruncatedTitles(entries = []) {
  const flatten = value => String(value || '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, '');
  const prepared = entries.map(entry => ({ entry, flat: flatten(entry.title) }));
  return prepared.map(({ entry, flat }) => {
    if (!entry.truncated || !flat) return null;
    const fuller = prepared.find(other => other.entry !== entry
      && other.entry.type === entry.type
      && other.entry.sourceId === entry.sourceId
      && other.flat.length > flat.length
      && other.flat.startsWith(flat));
    if (!fuller) return null;
    return {
      reason: `the board cut this heading short; the same notice is in this run in full as "${fuller.entry.title}"`,
      keptTitle: fuller.entry.title,
    };
  });
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
