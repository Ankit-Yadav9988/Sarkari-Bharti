import { datesInText, extractApplicationDates, extractMilestoneDates } from './dates.js';
import { textFromHtml, linksFromHtml, headingsFromHtml } from './html.js';

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const result = (value, confidence, reason) => ({ value: value || null, confidence, ...(reason ? { reason } : {}) });

export function extractAdvertisementNo(text) {
  const match = /(?:advertisement|advt\.?|centralised employment notification|cen)\s*(?:(?:no\.?|number)\s*)?[:#-]?\s*(?=[A-Z0-9][A-Z0-9/._-]*\d)([A-Z0-9][A-Z0-9/._-]{2,})/i.exec(text);
  return match && /\d/.test(match[1]) ? result(match[1], 'medium') : result(null, 'none', 'no advertisement number label found');
}

export function extractTotalPosts(text) {
  const match = /(?:total\s+(?:number of )?(?:posts?|vacancies)|total posts?|(?:number|no\.?)\s+of\s+(?:posts?|vacancies))\s*[:=-]?\s*([\d,]+)/i.exec(text)
    || /([\d,]+)\s+(?:posts?|vacancies)\b/i.exec(text);
  if (!match) return result(null, 'none', 'no unambiguous total-post count found');
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isSafeInteger(value) ? result(value, 'medium') : result(null, 'none', 'invalid post count');
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
  if (generic && contextAd) return result(`Advertisement ${contextAd}`, 'low');
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

const FEE_ALIASES = {
  GENERAL: 'general|ur|unreserved', OBC: 'obc|other backward', EWS: 'ews', SC_ST: 'sc\\s*/?\\s*st|sc-st|scst', PWBD: 'pwbd|pwd|divyang',
};
const RELAX_ALIASES = { OBC: 'obc|other backward', SC_ST: 'sc\\s*/?\\s*st|sc-st|scst', PWBD: 'pwbd|pwd|divyang' };

function amount(value) {
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function extractFees(text) {
  const block = /(?:application\s+fee|fee\s+details?|examination\s+fee)[\s\S]{0,700}/i.exec(text)?.[0] || '';
  const map = {};
  for (const [category, aliases] of Object.entries(FEE_ALIASES)) {
    const match = new RegExp(`(?:${aliases})[^\\d]{0,45}(?:₹|rs\\.?|inr)?\\s*([\\d,]+)`, 'i').exec(block);
    const value = amount(match?.[1]); if (value != null) map[category] = result(value, 'low');
  }
  if (!Object.keys(map).length) {
    const common = /(?:application\s+fee|fee\s+details?)[^\d]{0,60}(?:₹|rs\.?|inr)?\s*([\d,]+)/i.exec(block);
    const value = amount(common?.[1]); if (value != null) map.GENERAL = result(value, 'low');
  }
  return map;
}

export function extractRelaxations(text) {
  const block = /(?:age\s+)?relaxation(?:s)?[\s\S]{0,600}/i.exec(text)?.[0] || '';
  const map = {};
  for (const [category, aliases] of Object.entries(RELAX_ALIASES)) {
    const match = new RegExp(`(?:${aliases})[^\\d]{0,45}(\\d{1,2})\\s*(?:years?|yrs?)?`, 'i').exec(block);
    const value = amount(match?.[1]); if (value != null && value <= 20) map[category] = result(value, 'low');
  }
  return map;
}

const AGGREGATOR_HOSTS = ['sarkariresult.com', 'sarkariresults.org.in'];
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

export function extractOfficialApplyLink(text, links = [], { excludeAggregator = false } = {}) {
  const candidates = links
    .filter(link => !excludeAggregator || !isAggregatorUrl(link.url))
    .filter(link => /(?:apply|application|registration|candidate\s+portal|online)/i.test(`${link.text} ${link.context || ''} ${link.url}`))
    .sort((a, b) => linkScore(b) - linkScore(a));
  const anchor = candidates[0];
  if (anchor) return result(anchor.url, 'medium');
  const urls = String(text || '').match(/https?:\/\/[^\s<>()"']+/gi) || [];
  for (const url of urls) {
    const cleanUrl = url.replace(/[.,;]+$/, '');
    const start = Math.max(0, text.indexOf(url) - 140);
    if (/(?:apply|application|registration|candidate\s+portal|online)/i.test(text.slice(start, start + 160))) {
      return result(cleanUrl, 'low');
    }
  }
  return result(null, 'none', 'no labelled official apply URL found');
}

export function extractSyllabusLink(text, links = [], { excludeAggregator = false } = {}) {
  const anchor = links.find(link => (!excludeAggregator || !isAggregatorUrl(link.url))
    && /syllabus|scheme\s+of\s+examination|exam\s+pattern/i.test(`${link.text} ${link.url}`));
  if (anchor) return result(anchor.url, 'medium');
  const urls = String(text || '').match(/https?:\/\/[^\s<>()"']+/gi) || [];
  for (const url of urls) {
    const start = Math.max(0, text.indexOf(url) - 140);
    if (/syllabus|scheme\s+of\s+examination|exam\s+pattern/i.test(text.slice(start, start + 160))) return result(url.replace(/[.,;]+$/, ''), 'low');
  }
  return result(null, 'none', 'no syllabus link found');
}

function extractAggregatorOrganization(text, headings) {
  const heading = headings
    .filter(value => /(?:commission|board|bank|university|institute|corporation|court|department|force|railway|limited|authority|council|service|college|ministry|navy|army|air force|esb|psu)/i.test(value)
      && !/(?:sarkari|important links|how to fill|short details|frequently asked)/i.test(value))
    .sort((a, b) => a.length - b.length)[0];
  if (heading && heading.length <= 255) return heading;
  const sentence = /(?:^|\s)([A-Z][A-Za-z.&()'/-]*(?:\s+[A-Za-z0-9.&()'/-]+){1,12}?(?:Commission|Board|Bank|University|Institute|Corporation|Court|Department|Force|Railway|Limited|Authority|Council|Service|College|Ministry|Navy|Army|ESB|PSU))\b/i.exec(text);
  return sentence?.[1]?.trim() || null;
}

function classifyAggregator(text, organization) {
  const haystack = `${text} ${organization || ''}`.toLowerCase();
  const stateNames = [
    ['Uttar Pradesh', /\b(?:up|uttar pradesh)\b/], ['Bihar', /\bbihar\b/], ['Rajasthan', /\brajasthan\b/],
    ['Madhya Pradesh', /\b(?:mp|madhya pradesh)\b/], ['Uttarakhand', /\b(?:uk|uttarakhand)\b/],
    ['Jharkhand', /\bjharkhand\b/], ['Haryana', /\bharyana\b/], ['Himachal Pradesh', /\bhimachal\b/],
    ['Chhattisgarh', /\bchhattisgarh\b/], ['Punjab', /\bpunjab\b/], ['Gujarat', /\bgujarat\b/],
    ['Maharashtra', /\bmaharashtra\b/], ['West Bengal', /\bwest bengal\b/], ['Odisha', /\bodisha\b/],
    ['Tamil Nadu', /\btamil nadu\b/], ['Karnataka', /\bkarnataka\b/], ['Kerala', /\bkerala\b/],
    ['Andhra Pradesh', /\bandhra pradesh\b/], ['Telangana', /\btelangana\b/], ['Assam', /\bassam\b/],
    ['Delhi', /\b(?:delhi|dsssb)\b/],
  ];
  const state = stateNames.find(([, pattern]) => pattern.test(haystack))?.[0] || null;
  if (/\b(?:railway|rrb|rrc)\b/.test(haystack)) return { category: 'RAILWAY', state };
  if (/\b(?:jssc|bpsc|rpsc|mppsc|uppsc|ukpsc|hpsc|cgpsc|psc)\b|public service commission/.test(haystack)) return { category: 'STATE_PSC', state };
  if (/\b(?:ssc|staff selection commission)\b/.test(haystack)) return { category: 'SSC', state: null };
  if (/\bupsc\b|union public service commission/.test(haystack)) return { category: 'UPSC', state: null };
  if (/\b(?:bank|ibps|sbi|pnb|boi|uco|insurance)\b/.test(haystack)) return { category: 'BANKING', state };
  if (/\b(?:army|navy|air force|agniveer|defence|defense|capf|crpf|cisf|bsf|itbp)\b/.test(haystack)) return { category: 'DEFENCE', state: null };
  if (/\bpolice\b|\bbpssc\b|\bupp\b/.test(haystack)) return { category: 'POLICE', state };
  if (/\b(?:teacher|teaching|lecturer|professor|tet|ctet|school)\b/.test(haystack)) return { category: 'TEACHING', state };
  if (/\b(?:sssc|ssb)\b/.test(haystack)) return { category: 'STATE_PSC', state };
  if (/\b(?:psu|ntpc|iocl|isro|drdo|aiims|concor|rcfl|nmdc)\b|limited\b/.test(haystack)) return { category: 'PSU', state: null };
  return { category: state ? 'STATE_GOVT' : 'CENTRAL_GOVT', state };
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
  const inferredOrganization = aggregator ? extractAggregatorOrganization(raw, headings) : source.organization;
  const inferredCategory = aggregator ? classifyAggregator(`${link.text || ''} ${inferredOrganization || ''}`, inferredOrganization) : { category: source.category, state: source.state || null };
  let officialApplyLink = extractOfficialApplyLink(raw, htmlLinks, { excludeAggregator: aggregator });
  if (!officialApplyLink.value && source.id === 'uppsc' && /\bapply\b/i.test(link.text || '')) {
    officialApplyLink = result(link.url, 'medium');
  }
  const syllabusLink = extractSyllabusLink(raw, htmlLinks, { excludeAggregator: aggregator });
  const contextDates = source.id === 'uppsc' ? datesInText(link.context || raw, { now }) : [];
  const effectiveDates = source.id === 'uppsc' && contextDates.length >= 3
    ? {
      ...dates,
      applicationStartDate: result(contextDates[1], 'medium'),
      lastDate: result(contextDates[2], 'medium'),
    }
    : dates;
  const postName = extractPostName(raw, link.text, link.context);
  const advertisementNo = extractAdvertisementNo(`${raw} ${link.context || ''}`);
  const totalPosts = extractTotalPosts(`${raw} ${link.context || ''}`);
  const linkedPdf = !/\.pdf(?:$|[?#])/i.test(link.url) && isHtml
    ? htmlLinks.find(item => /\.pdf(?:$|[?#])/i.test(item.url) && (!aggregator || !isAggregatorUrl(item.url)))?.url
    : null;
  const notificationPdfUrl = linkedPdf || (/\.pdf(?:$|[?#])/i.test(link.url) ? link.url : null);
  const isPdf = Boolean(notificationPdfUrl);
  const fields = { postName, advertisementNo, totalPosts, ...effectiveDates, ...milestones, ...age, eligibility, selectionProcess, officialApplyLink, syllabusLink,
    notificationPdfUrl: result(notificationPdfUrl, isPdf ? 'certain' : 'none', isPdf ? undefined : 'candidate page had no PDF link') };
  const row = {
    postName: postName.value,
    organization: inferredOrganization || source.organization || 'Organization to verify',
    category: inferredCategory.category,
    listingSection: 'AUTO',
    state: inferredCategory.state,
    advertisementNo: advertisementNo.value,
    totalPosts: totalPosts.value,
    applicationStartDate: effectiveDates.applicationStartDate.value,
    lastDate: effectiveDates.lastDate.value,
    admitCardDate: milestones.admitCardDate.value,
    examDate: milestones.examDate.value,
    resultDate: milestones.resultDate.value,
    ageMin: age.ageMin.value,
    ageMax: age.ageMax.value,
    eligibility: eligibility.value,
    selectionProcess: selectionProcess.value,
    officialApplyLink: officialApplyLink.value,
    notificationPdfUrl,
    syllabusLink: syllabusLink.value,
  };
  // The pipeline output is flat because CSV_COLUMNS is flat; the admin
  // importer nests these columns into its API maps when it reads the file.
  for (const [category, field] of Object.entries(fees)) {
    row[`fee${category}`] = field.value;
    fields[`fee${category}`] = field;
  }
  for (const [category, field] of Object.entries(relaxations)) {
    row[`relax${category}`] = field.value;
    fields[`relax${category}`] = field;
  }
  return {
    row, fields, text: raw,
    metadata: aggregator
      ? { sourceType: 'AGGREGATOR', verificationStatus: 'PENDING_MANUAL', aggregatorUrl: link.url, officialSourceFound: Boolean(notificationPdfUrl || officialApplyLink.value) }
      : { sourceType: 'OFFICIAL', verificationStatus: 'PENDING_MANUAL' },
  };
}
