import { datesInText, extractApplicationDates, extractMilestoneDates } from './dates.js';
import { textFromHtml, linksFromHtml, headingsFromHtml } from './html.js';

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
/**
 * A field and the evidence behind it.
 *
 * Zero is a value, not an absence. SC/ST and PWBD fees are waived on a large
 * share of notices, so `0` is one of the most common correct answers this file
 * can give -- and a plain `value || null` turned every one of them into a blank
 * cell that the admin then had to fill in by hand. Empty strings still collapse
 * to null, because an extractor returning `''` found nothing.
 */
const result = (value, confidence, reason) => ({
  value: value === 0 ? 0 : (value || null),
  confidence,
  ...(reason ? { reason } : {}),
});

/**
 * How much evidence stood behind a value, ordered so a floor can be a
 * comparison.
 *
 *   certain — the value is the thing itself, not a reading of it (the URL we
 *             fetched, a PDF link taken verbatim from an anchor).
 *   high    — a label said what it was and the text needed no repair.
 *   medium  — a label said what it was, or the pattern is unambiguous in
 *             context ("Last Date: 30/11/2026", "Rs. 500").
 *   low     — the shape matched but nothing named it. A guess that happens to
 *             be right most of the time.
 *   none    — not found.
 */
export const CONFIDENCE_RANK = { none: 0, low: 1, medium: 2, high: 3, certain: 4 };

/**
 * The floor for writing a value into the CSV.
 *
 * Every extractor has always returned a confidence, and until now nothing read
 * it: `low` and `medium` were written to the file identically, which made the
 * whole scale decoration. The plan this pipeline was built from says "never
 * guess, leave blank", and this constant is where that sentence becomes code.
 *
 * Setting the floor at `medium` means "a label told us, or the pattern leaves
 * no room for doubt". It will visibly lower the fill rate -- the run that
 * prompted this had a totalPosts on 93 of 93 rows, which is not a sign of a
 * good extractor but of one matching noise -- and that is the intended trade.
 * A blank cell costs the admin thirty seconds of typing. A wrong closing date
 * costs a reader the job.
 */
export const MIN_PUBLISHABLE = 'medium';

const isPublishable = field => CONFIDENCE_RANK[field?.confidence] >= CONFIDENCE_RANK[MIN_PUBLISHABLE];

/**
 * Replaces every under-evidenced value with a blank and a reason.
 *
 * The reason matters as much as the blank. It is what the report's "Fields
 * deliberately left blank" section prints, so a withheld value shows up as a
 * line telling the admin what was read and why it was not trusted -- rather
 * than as a mysteriously empty cell, which is indistinguishable from an
 * extractor that simply failed.
 */
export function gateFields(fields) {
  const gated = {};
  for (const [key, field] of Object.entries(fields)) {
    if (!field || field.value == null || field.value === '' || isPublishable(field)) { gated[key] = field; continue; }
    const seen = String(field.value).slice(0, 60);
    gated[key] = {
      value: null,
      confidence: field.confidence,
      withheld: field.value,
      reason: `withheld "${seen}" — ${field.reason || `only ${field.confidence} confidence, and the floor is ${MIN_PUBLISHABLE}`}`,
    };
  }
  return gated;
}

/** Four digits in a plausible year range, which is not a vacancy count. */
const LOOKS_LIKE_A_YEAR = /^(?:19|20)\d{2}$/;

export function extractAdvertisementNo(text) {
  const match = /(?:advertisement|advt\.?|centralised employment notification|cen)\s*(?:(?:no\.?|number)\s*)?[:#-]?\s*(?=[A-Z0-9][A-Z0-9/._-]*\d)([A-Z0-9][A-Z0-9/._-]{2,})/i.exec(text);
  return match && /\d/.test(match[1]) ? result(match[1], 'medium') : result(null, 'none', 'no advertisement number label found');
}

/**
 * The number of vacancies, but only when the text says that is what it is.
 *
 * There are two patterns here and they are not equally trustworthy, which is
 * the entire point of splitting them. A label ("Total Posts: 1,234") names the
 * number. A bare "N posts" only matches a shape, and on real pages that shape
 * hits things that are not vacancy counts at all: "Bihar STET ... 2026 Post"
 * yielded 2026, and a news headline yielded 100000. Both were written to the
 * CSV as facts.
 *
 * So the bare form is `low` and the confidence gate withholds it, and a bare
 * match that is simply a year is refused outright with the phrase that fooled
 * it, so the report can show the admin what happened.
 */
export function extractTotalPosts(text) {
  const labelled = /(?:total\s+(?:number of )?(?:posts?|vacancies)|total posts?|(?:number|no\.?)\s+of\s+(?:posts?|vacancies))\s*[:=-]?\s*([\d,]+)/i.exec(text);
  if (labelled) {
    const value = Number(labelled[1].replace(/,/g, ''));
    return Number.isSafeInteger(value) && value > 0
      ? result(value, 'medium')
      : result(null, 'none', `labelled post count "${labelled[1]}" is not a usable number`);
  }
  const bare = /([\d,]+)\s+(?:posts?|vacancies)\b/i.exec(text);
  if (!bare) return result(null, 'none', 'no unambiguous total-post count found');
  const digits = bare[1].replace(/,/g, '');
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value <= 0) return result(null, 'none', 'invalid post count');
  if (LOOKS_LIKE_A_YEAR.test(digits)) {
    return result(null, 'none', `"${clean(bare[0])}" reads as a year, not a vacancy count`);
  }
  return result(value, 'low', 'counted from an unlabelled "N posts" phrase, with nothing naming it a total');
}

export function extractPostName(text, linkText = '', contextText = '') {
  const label = clean(linkText);
  if (/\{\{|\}\}|_HM\b|_E_HM\b|_I_HM\b/i.test(label)) return result(null, 'none', 'source returned an untranslated UI label');
  const actionTitle = label
    .replace(/^click\s+here\s+to\s+apply(?:\s+online)?\s+(?:for\s+)?/i, '')
    .replace(/\s*,?\s*(?:advt?\.?|advertisement)\s*no?\.?\s*[:#-]?.*$/i, '')
    .trim();
  const generic = /^(?:view|view advertisement|download|download advertisement|apply|apply online|click here|read more)$/i.test(actionTitle);
  if (!generic && actionTitle.length >= 5 && actionTitle.length <= 255) return result(actionTitle, actionTitle === label ? 'high' : 'medium');
  const context = clean(contextText);
  const contextMatch = /(?:advt\.?|advertisement)(?:\s+(?:no\.?|number))?\s*[A-Z0-9./-]+\s+(?:for|of)\s+(.+?)(?=\s+(?:view|download|apply|click)\b|$)/i.exec(context);
  if (contextMatch) return result(clean(contextMatch[1]), 'medium');
  const contextAd = extractAdvertisementNo(context).value;
  /* Not a guess, and so not `low`. Every other reading in this file infers a
     value from a shape that might mean something else; this one is constructed
     from an advertisement number that was itself read from a label, and the
     construction adds no uncertainty of its own. It is an accurate title that
     happens to be a dull one -- which is a question for the admin at approval,
     not a reason for the confidence gate to blank it and make the row invalid.
     Marking it `low` conflated "we are unsure what this says" with "this page
     genuinely has no post name", and the two need different handling. */
  if (generic && contextAd) return result(`Advertisement ${contextAd}`, 'medium');
  const match = /(?:recruitment|employment notice|notification)\s+(?:for|of)\s+(?:the\s+)?(?:post(?:s)?\s+of\s+)?([^\.\n]{5,180})/i.exec(text);
  return match ? result(clean(match[1]), 'medium') : result(null, 'none', 'no reliable title found');
}

function labelledText(text, labels, stops, max = 1200) {
  const stop = stops.join('|');
  const match = new RegExp(`(?:${labels})(?:\\s*[:\\-]\\s*|\\s+)([\\s\\S]{1,${max}}?)(?=\\s*(?:${stop})\\s*[:\\-]|$)`, 'i').exec(text);
  const value = clean(match?.[1] || '').replace(/^[|;,.\-]+|[|;,.\-]+$/g, '').trim();
  return value.length >= 5 ? result(value, 'medium') : result(null, 'none', 'no clearly labelled section found');
}

export function extractAge(text) {
  const section = /(?:age\s*limit|age\s*criteria|age\s*as\s*on)[^\n]{0,180}/i.exec(text)?.[0] || '';
  const range = /(\d{1,2})\s*(?:years?\s*)?(?:to|[-–—])\s*(\d{1,3})\s*years?/i.exec(section)
    || /minimum\s*(?:age)?\s*[:\-]?\s*(\d{1,2}).{0,80}?maximum\s*(?:age)?\s*[:\-]?\s*(\d{1,3})/i.exec(section);
  if (!range) return { ageMin: result(null, 'none', 'no labelled age range found'), ageMax: result(null, 'none', 'no labelled age range found') };
  return { ageMin: result(Number(range[1]), 'medium'), ageMax: result(Number(range[2]), 'medium') };
}

/**
 * Category words, used to find the number that belongs to each group.
 *
 * These are interpolated into a larger pattern that wraps them in `\b...\b`.
 * The boundaries are not decoration: unanchored, `ur` matches inside
 * "Annex(ur)e", so "Application Fee: See Annexure 1" read a general fee of ₹1
 * -- and did, on two rows of the 2026-09-21 run. Any alias added here must be a
 * whole word for that reason.
 */
const FEE_ALIASES = {
  GENERAL: 'general|ur|unreserved', OBC: 'obc|other backward', EWS: 'ews', SC_ST: 'sc\\s*/?\\s*st|sc-st|scst', PWBD: 'pwbd|pwd|divyang',
};
const RELAX_ALIASES = { OBC: 'obc|other backward', SC_ST: 'sc\\s*/?\\s*st|sc-st|scst', PWBD: 'pwbd|pwd|divyang' };

function amount(value) {
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Above this, the number next to a category word is not an exam fee. */
const MAX_PLAUSIBLE_FEE = 10000;

/** Words that mean "the fee is stated elsewhere", not "the fee is this number". */
const CROSS_REFERENCE = /annexure|appendix|table|clause|para(?:graph)?|point|sr\.?\s*no|serial|chapter|section/i;

/**
 * Application fees per category.
 *
 * The discriminator is a currency marker. "SC/ST: Rs. 0" states a fee; "SC/ST
 * candidates: see Annexure 1" states where to look, and the old pattern -- in
 * which the ₹/Rs./INR group was optional -- read that as a fee of ₹1 and wrote
 * it to the CSV. Two rows in a single run carried a one-rupee fee because of it.
 *
 * So a match carrying a currency marker is `medium` and publishable; a bare
 * number after a category word is `low`, which the gate withholds; and a match
 * whose gap to the number contains a cross-reference word is refused outright,
 * because there the number is an annexure number and reading it as money is not
 * a weak guess but a category error.
 */
export function extractFees(text) {
  const block = /(?:application\s+fee|fee\s+details?|examination\s+fee)[\s\S]{0,700}/i.exec(text)?.[0] || '';
  const map = {};
  for (const [category, aliases] of Object.entries(FEE_ALIASES)) {
    const match = new RegExp(`\\b(?:${aliases})\\b([^\\d]{0,45}?)(?:(₹|rs\\.?|inr)\\s*)?([\\d,]+)`, 'i').exec(block);
    if (!match) continue;
    const [, gap, currency, digits] = match;
    if (CROSS_REFERENCE.test(gap)) {
      map[category] = result(null, 'none', `"${clean(match[0])}" points at a numbered reference, not an amount`);
      continue;
    }
    const value = amount(digits);
    if (value == null) continue;
    if (value > MAX_PLAUSIBLE_FEE) {
      map[category] = result(null, 'none', `${value} is too large to be an application fee`);
      continue;
    }
    map[category] = currency
      ? result(value, 'medium')
      : result(value, 'low', `read ${value} next to "${category}" with no ₹/Rs./INR marker to confirm it is money`);
  }
  if (!Object.keys(map).some(k => map[k].value != null)) {
    const common = /(?:application\s+fee|fee\s+details?)([^\d]{0,60}?)(?:(₹|rs\.?|inr)\s*)?([\d,]+)/i.exec(block);
    if (common && !CROSS_REFERENCE.test(common[1])) {
      const value = amount(common[3]);
      if (value != null && value <= MAX_PLAUSIBLE_FEE) {
        map.GENERAL = common[2]
          ? result(value, 'medium')
          : result(value, 'low', 'a single unlabelled fee with no currency marker');
      }
    }
  }
  return map;
}

/**
 * Age relaxation in years.
 *
 * The unit is the evidence here: "OBC 3 years" is a relaxation, whereas "OBC 3"
 * inside a fee or vacancy table is a column value that happens to sit next to
 * the word. So the unit earns `medium` and its absence earns `low`, which the
 * gate withholds.
 */
export function extractRelaxations(text) {
  const block = /(?:age\s+)?relaxation(?:s)?[\s\S]{0,600}/i.exec(text)?.[0] || '';
  const map = {};
  for (const [category, aliases] of Object.entries(RELAX_ALIASES)) {
    const withUnit = new RegExp(`\\b(?:${aliases})\\b[^\\d]{0,45}(\\d{1,2})\\s*(?:years?|yrs?)`, 'i').exec(block);
    const bare = withUnit || new RegExp(`\\b(?:${aliases})\\b[^\\d]{0,45}(\\d{1,2})`, 'i').exec(block);
    const value = amount(bare?.[1]);
    if (value == null || value > 20) continue;
    map[category] = withUnit
      ? result(value, 'medium')
      : result(value, 'low', `read ${value} next to "${category}" with no "years" to confirm it is a relaxation`);
  }
  return map;
}

const AGGREGATOR_HOSTS = ['sarkariresult.com', 'sarkariresults.org.in', 'sarkariresult.com.cm'];
const isAggregatorUrl = url => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return AGGREGATOR_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
  } catch { return false; }
};

function linkScore(link) {
  const haystack = `${link.text || ''} ${link.context || ''} ${link.url || ''}`;
  let score = 0;
  if (/(?:apply|application|registration|candidate\s+portal)/i.test(haystack)) score += 8;
  if (/online/i.test(haystack)) score += 3;
  if (!isAggregatorUrl(link.url)) score += 2;
  if (/\.pdf(?:$|[?#])/i.test(link.url)) score -= 2;
  return score;
}

/**
 * When a bare URL sits in prose rather than behind an anchor, the only evidence
 * for what it is comes from the words in front of it -- and "within 140
 * characters" is weak evidence. "Candidates who applied online should visit
 * https://…/results" passes that test and yields a results page recorded as the
 * apply link.
 *
 * So the cue has to be *adjacent*, not merely nearby: it must run right up to
 * the URL with nothing between but punctuation and a connector word. "Apply
 * online at <url>" and "To apply, visit: <url>" qualify; "applied online should
 * visit <url>" does not, because "should" is neither punctuation nor a
 * connector. A loose match still returns, but at `low`, so the confidence gate
 * withholds it and the report says why.
 */
const ADJACENT_APPLY_CUE = new RegExp(
  '(?:apply(?:\\s+online)?(?:\\s+(?:at|on|to|through|via|here))?'
  + '|online\\s+application(?:\\s+(?:link|portal|website))?'
  + '|registration\\s+(?:link|portal)|candidate\\s+portal'
  + '|application\\s+(?:link|portal|website))'
  + '\\s*[:\\-–—>]*\\s*(?:please\\s+)?(?:visit|log\\s*on\\s*to|logon|go\\s+to|website|url|link)?'
  + '\\s*[:\\-–—>]*\\s*$', 'i');

const LOOSE_APPLY_CUE = /(?:apply|application|registration|candidate\s+portal|online)/i;

/** Walks the bare URLs in `text`, reporting where each one actually starts. */
function* urlsWithPosition(text) {
  const pattern = /https?:\/\/[^\s<>()"']+/gi;
  let match;
  while ((match = pattern.exec(String(text || '')))) {
    yield { url: match[0].replace(/[.,;]+$/, ''), at: match.index };
  }
}

export function extractOfficialApplyLink(text, links = [], { excludeAggregator = false } = {}) {
  const candidates = links
    .filter(link => !excludeAggregator || !isAggregatorUrl(link.url))
    .filter(link => /(?:apply|application|registration|candidate\s+portal|online)/i.test(`${link.text} ${link.context || ''} ${link.url}`))
    .sort((a, b) => linkScore(b) - linkScore(a));
  const anchor = candidates[0];
  if (anchor) return result(anchor.url, 'medium');

  /* The anchor branch already honours excludeAggregator; this one did not, so
     an aggregator page whose body mentioned its own URL could hand back
     sarkariresult.com as the "official" apply link -- the exact opposite of
     what the flag is for. */
  let weakest = null;
  for (const { url, at } of urlsWithPosition(text)) {
    if (excludeAggregator && isAggregatorUrl(url)) continue;
    const before = String(text).slice(Math.max(0, at - 140), at);
    if (ADJACENT_APPLY_CUE.test(before.slice(-60))) return result(url, 'medium');
    if (LOOSE_APPLY_CUE.test(`${before}${String(text).slice(at, at + 20)}`)) {
      weakest ||= result(url, 'low',
        `${url} is only near the word "apply"/"online", not directly introduced by it, so it may be a results or notice page`);
    }
  }
  return weakest || result(null, 'none', 'no labelled official apply URL found');
}

export function extractSyllabusLink(text, links = [], { excludeAggregator = false } = {}) {
  const anchor = links.find(link => (!excludeAggregator || !isAggregatorUrl(link.url))
    && /syllabus|scheme\s+of\s+examination|exam\s+pattern/i.test(`${link.text} ${link.url}`));
  if (anchor) return result(anchor.url, 'medium');
  for (const { url, at } of urlsWithPosition(text)) {
    if (excludeAggregator && isAggregatorUrl(url)) continue;
    const start = Math.max(0, at - 140);
    if (/syllabus|scheme\s+of\s+examination|exam\s+pattern/i.test(String(text).slice(start, at + 20))) {
      return result(url, 'low', `${url} sits near the word "syllabus" but is not linked from it`);
    }
  }
  return result(null, 'none', 'no syllabus link found');
}

function extractAggregatorOrganization(text, headings, links = []) {
  const linkedOrganization = links.find(link => !isAggregatorUrl(link.url)
    && /(?:commission|board|bank|university|institute|corporation|court|department|force|railway|limited|authority|council|service|college|ministry|navy|army|air force|esb|psu)/i.test(link.text || ''));
  if (linkedOrganization?.text && linkedOrganization.text.length <= 255) return clean(linkedOrganization.text);
  const heading = headings
    .filter(value => /(?:commission|board|bank|university|institute|corporation|court|department|force|railway|limited|authority|council|service|college|ministry|navy|army|air force|esb|psu)/i.test(value)
      && !/(?:sarkari|important links|how to fill|short details|frequently asked)/i.test(value))
    .sort((a, b) => a.length - b.length)[0];
  if (heading && heading.length <= 255) return heading;
  const sentence = /(?:^|\s)([A-Z][A-Za-z.&()'/-]*(?:\s+[A-Za-z0-9.&()'/-]+){1,12}?(?:Commission|Board|Bank|University|Institute|Corporation|Court|Department|Force|Railway|Limited|Authority|Council|Service|College|Ministry|Navy|Army|ESB|PSU))\b/i.exec(text);
  return sentence?.[1]?.trim() || null;
}

/**
 * Which category an aggregator row belongs to, decided by an ordered list.
 *
 * Order is the whole algorithm here, because these patterns overlap and the
 * first match wins. Two live misfilings came from getting it wrong:
 *
 *   IBPS RRB -> RAILWAY, because /rrb/ was tested before /ibps/. In banking,
 *   RRB is Regional Rural Bank; in railways it is Railway Recruitment Board.
 *   The same three letters, two different sectors, and only the surrounding
 *   word settles it -- so the more specific token has to be asked first.
 *
 *   UPSC -> STATE_PSC, because the state rule's "public service commission"
 *   alternative also matches "Union Public Service Commission". UPSC is not a
 *   state body, so it has to be taken off the table before the state rule runs.
 *
 * Keep this list ordered specific-to-general. Appending a rule at the bottom is
 * always safe; inserting one above an existing rule needs a reason.
 */
const STATE_NAMES = [
  ['Uttar Pradesh', /\b(?:up|uttar pradesh)\b/], ['Bihar', /\bbihar\b/], ['Rajasthan', /\brajasthan\b/],
  ['Madhya Pradesh', /\b(?:mp|madhya pradesh)\b/], ['Uttarakhand', /\b(?:uk|uttarakhand)\b/],
  ['Jharkhand', /\bjharkhand\b/], ['Haryana', /\bharyana\b/], ['Himachal Pradesh', /\bhimachal\b/],
  ['Chhattisgarh', /\bchhattisgarh\b/], ['Punjab', /\bpunjab\b/], ['Gujarat', /\bgujarat\b/],
  ['Maharashtra', /\bmaharashtra\b/], ['West Bengal', /\bwest bengal\b/], ['Odisha', /\bodisha\b/],
  ['Tamil Nadu', /\btamil nadu\b/], ['Karnataka', /\bkarnataka\b/], ['Kerala', /\bkerala\b/],
  ['Andhra Pradesh', /\bandhra pradesh\b/], ['Telangana', /\btelangana\b/], ['Assam', /\bassam\b/],
  ['Delhi', /\b(?:delhi|dsssb)\b/],
];

/**
 * "<state> Staff Selection Commission" -- built from the same list the state
 * detector uses, so the two cannot drift apart as states are added.
 *
 * This exists because a state's staff selection commission contains, verbatim,
 * every word the central SSC rule looks for. "Jharkhand Staff Selection
 * Commission (JSSC)" is a state body, and without this it classifies as SSC --
 * putting Jharkhand vacancies in front of candidates hunting SSC CGL.
 */
const STATE_SELECTION_COMMISSION = new RegExp(
  `(?:${STATE_NAMES.map(([, pattern]) => pattern.source.replace(/\\b/g, '')).join('|')})`
  + '\\s+(?:subordinate\\s+)?staff\\s+selection\\s+(?:commission|board)', 'i');

const CATEGORY_RULES = [
  // Named institutions first: each names one body and cannot mean another.
  { pattern: /\b(?:ibps|sbi|rbi|nabard|lic|nicl|uiic|oicl|pnb|boi|uco)\b/, category: 'BANKING', stateful: true },
  { pattern: /\bupsc\b|union public service commission/, category: 'UPSC', stateful: false },
  /* Before SSC, because a state's selection commission spells out the same
     three words the central rule matches on. The acronyms are listed rather
     than pattern-matched as "<letters>SSC" so that BPSSC, which is a police
     body, keeps falling through to the POLICE rule below. */
  { pattern: STATE_SELECTION_COMMISSION, category: 'STATE_PSC', stateful: true },
  { pattern: /\b(?:jssc|bssc|hssc|ossc|wbssc|cgssc|mpssc|upsssc|dsssb|rsmssb)\b/, category: 'STATE_PSC', stateful: true },
  { pattern: /\b(?:ssc|staff selection commission)\b/, category: 'SSC', stateful: false },
  // Sector words next.
  { pattern: /\b(?:bank|banking|insurance)\b/, category: 'BANKING', stateful: true },
  { pattern: /\b(?:railway|rrb|rrc)\b/, category: 'RAILWAY', stateful: true },
  { pattern: /\b(?:jssc|bpsc|rpsc|mppsc|uppsc|ukpsc|hpsc|cgpsc|psc)\b|public service commission/, category: 'STATE_PSC', stateful: true },
  { pattern: /\b(?:army|navy|air force|agniveer|defence|defense|capf|crpf|cisf|bsf|itbp)\b/, category: 'DEFENCE', stateful: false },
  { pattern: /\bpolice\b|\bbpssc\b|\bupp\b/, category: 'POLICE', stateful: true },
  { pattern: /\b(?:teacher|teaching|lecturer|professor|tet|ctet|school)\b/, category: 'TEACHING', stateful: true },
  { pattern: /\b(?:sssc|ssb)\b/, category: 'STATE_PSC', stateful: true },
  { pattern: /\b(?:psu|ntpc|iocl|isro|drdo|aiims|concor|rcfl|nmdc)\b|limited\b/, category: 'PSU', stateful: false },
];
function classifyAggregator(text, organization) {
  const haystack = `${text} ${organization || ''}`.toLowerCase();
  const state = STATE_NAMES.find(([, pattern]) => pattern.test(haystack))?.[0] || null;
  const rule = CATEGORY_RULES.find(r => r.pattern.test(haystack));
  if (rule) return { category: rule.category, state: rule.stateful ? state : null };
  return { category: state ? 'STATE_GOVT' : 'CENTRAL_GOVT', state };
}

/**
 * UPPSC's advertisement table, whose column header names the columns.
 *
 * Requiring this before reading the row by position is what turns a guess into
 * a check: the document itself states that the last two date columns are the
 * application start and last dates, in that order.
 */
const UPPSC_LISTING_HEADER = /application\s+filling\s+start\s+date[\s\S]{0,120}?application\s+filling\s+last\s+date/i;

/** Dates in the UPPSC row: [advertisement, application start, application last]. */
const UPPSC_DATE_COLUMNS = { applicationStartDate: 1, lastDate: 2 };

/**
 * Resolves UPPSC's dates, where neither reading alone is trustworthy.
 *
 * UPPSC lists its dates in a table, and pdftotext flattens that table into one
 * line: the whole header row, then the whole data row. So `dateNearLabel` finds
 * the words "Application Filling Last Date" and takes the next date, which is
 * the advertisement date three columns too early. Following the label blindly
 * here publishes a deadline a month before the real one.
 *
 * Reading the row by position gets it right -- but the previous code applied
 * that read as an unconditional OVERRIDE, and scanned the whole document when
 * the listing row was absent. A notice whose body plainly said
 * "Last Date: 30/11/2026" came out as 2026-09-19: the third date that happened
 * to appear anywhere in the text, 72 days early, and stamped 'medium' as though
 * a label had said so.
 *
 * So the two readings are ranked rather than one always winning:
 *
 *   - a date sitting immediately after its label ('high') is the notice
 *     speaking plainly, and beats position;
 *   - otherwise the positional read is used, but only from link.context (never
 *     the whole document), only when the table's own header row confirms the
 *     column order, and only when the row holds exactly the three dates that
 *     layout implies. Those three conditions are the evidence behind 'medium';
 *   - if the header is missing or the shape is wrong, nothing is invented. The
 *     weak labelled reading is kept at 'low', the gate withholds it, and the
 *     admin gets a blank cell and a sentence saying why.
 */
function uppscListingDates(dates, raw, link, now) {
  const contextDates = datesInText(link.context || '', { now });
  const headerConfirmed = UPPSC_LISTING_HEADER.test(raw) && contextDates.length === 3;
  const resolved = {};
  for (const [key, column] of Object.entries(UPPSC_DATE_COLUMNS)) {
    const labelled = dates[key];
    if (labelled.value && CONFIDENCE_RANK[labelled.confidence] >= CONFIDENCE_RANK.high) { resolved[key] = labelled; continue; }
    if (headerConfirmed) {
      resolved[key] = result(contextDates[column], 'medium',
        `read from column ${column + 1} of the UPPSC listing row, whose header row names that column`);
      continue;
    }
    resolved[key] = labelled.value
      ? labelled
      : result(null, 'none', 'no plainly labelled date, and the UPPSC listing table was not recognised');
  }
  return resolved;
}

/** Turns an official document into a deliberately sparse job row. */
export function extractJob({ source, link, body, contentType = '', now = new Date() }) {
  const bodyString = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
  const isHtml = /html/i.test(contentType) || /<\s*(?:html|body|a)\b/i.test(bodyString);
  const htmlLinks = isHtml ? linksFromHtml(bodyString, link.url) : [];
  const headings = isHtml ? headingsFromHtml(bodyString) : [];
  const raw = isHtml ? textFromHtml(bodyString) : bodyString;
  const dates = extractApplicationDates(raw, { now });
  const milestones = extractMilestoneDates(raw, { now });
  const age = extractAge(raw);
  const eligibility = labelledText(raw, 'educational\\s+qualification(?:s)?|essential\\s+qualification(?:s)?|eligibility|educational\\s+requirements?', ['age\\s+limit', 'selection\\s+process', 'application\\s+fee', 'fee\\s+details?', 'important\\s+instructions']);
  const selectionProcess = labelledText(raw, 'selection\\s+process|mode\\s+of\\s+selection|method\\s+of\\s+selection|selection\\s+procedure', ['age\\s+limit', 'application\\s+fee', 'fee\\s+details?', 'important\\s+instructions']);
  const fees = extractFees(raw);
  const relaxations = extractRelaxations(raw);
  const aggregator = source.kind === 'aggregator';
  const inferredOrganization = aggregator ? extractAggregatorOrganization(raw, headings, htmlLinks) : source.organization;
  const inferredCategory = aggregator ? classifyAggregator(`${link.text || ''} ${inferredOrganization || ''}`, inferredOrganization) : { category: source.category, state: source.state || null };
  let officialApplyLink = extractOfficialApplyLink(raw, htmlLinks, { excludeAggregator: aggregator });
  if (!officialApplyLink.value && source.id === 'uppsc' && /\bapply\b/i.test(link.text || '')) {
    officialApplyLink = result(link.url, 'medium');
  }
  const syllabusLink = extractSyllabusLink(raw, htmlLinks, { excludeAggregator: aggregator });
  const effectiveDates = source.id === 'uppsc' ? uppscListingDates(dates, raw, link, now) : dates;
  const postName = extractPostName(raw, link.text, link.context);
  const advertisementNo = extractAdvertisementNo(`${raw} ${link.context || ''}`);
  const totalPosts = extractTotalPosts(`${raw} ${link.context || ''}`);
  const linkedPdf = !/\.pdf(?:$|[?#])/i.test(link.url) && isHtml
    ? htmlLinks.find(item => /\.pdf(?:$|[?#])/i.test(item.url) && (!aggregator || !isAggregatorUrl(item.url)))?.url
    : null;
  const notificationPdfUrl = linkedPdf || (/\.pdf(?:$|[?#])/i.test(link.url) ? link.url : null);
  const isPdf = Boolean(notificationPdfUrl);
  const extractedFields = { postName, advertisementNo, totalPosts, ...effectiveDates, ...milestones, ...age, eligibility, selectionProcess, officialApplyLink, syllabusLink,
    notificationPdfUrl: result(notificationPdfUrl, isPdf ? 'certain' : 'none', isPdf ? undefined : 'candidate page had no PDF link') };
  for (const [category, field] of Object.entries(fees)) extractedFields[`fee${category}`] = field;
  for (const [category, field] of Object.entries(relaxations)) extractedFields[`relax${category}`] = field;
  /* The single place the confidence scale is allowed to matter. Everything
     below reads the gated copy, so there is no path by which an under-evidenced
     value reaches the CSV -- including the fee and relaxation maps, which used
     to be copied into the row before anyone looked at their confidence. */
  const fields = gateFields(extractedFields);
  const row = {
    postName: fields.postName.value,
    organization: inferredOrganization || source.organization || 'Organization to verify',
    category: inferredCategory.category,
    listingSection: 'AUTO',
    state: inferredCategory.state,
    advertisementNo: fields.advertisementNo.value,
    totalPosts: fields.totalPosts.value,
    applicationStartDate: fields.applicationStartDate.value,
    lastDate: fields.lastDate.value,
    admitCardDate: fields.admitCardDate.value,
    examDate: fields.examDate.value,
    resultDate: fields.resultDate.value,
    ageMin: fields.ageMin.value,
    ageMax: fields.ageMax.value,
    eligibility: fields.eligibility.value,
    selectionProcess: fields.selectionProcess.value,
    officialApplyLink: fields.officialApplyLink.value,
    notificationPdfUrl: fields.notificationPdfUrl.value,
    syllabusLink: fields.syllabusLink.value,
  };
  // The pipeline output is flat because CSV_COLUMNS is flat; the admin
  // importer nests these columns into its API maps when it reads the file.
  for (const category of Object.keys(fees)) row[`fee${category}`] = fields[`fee${category}`].value;
  for (const category of Object.keys(relaxations)) row[`relax${category}`] = fields[`relax${category}`].value;
  return {
    row, fields, text: raw,
    metadata: aggregator
      ? { sourceType: 'AGGREGATOR', verificationStatus: 'PENDING_MANUAL', aggregatorUrl: link.url, officialSourceFound: Boolean(notificationPdfUrl || fields.officialApplyLink.value) }
      : { sourceType: 'OFFICIAL', verificationStatus: 'PENDING_MANUAL' },
  };
}
