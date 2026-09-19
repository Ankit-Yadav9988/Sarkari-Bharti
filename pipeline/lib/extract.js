import { extractApplicationDates, extractMilestoneDates } from './dates.js';
import { textFromHtml } from './html.js';

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const result = (value, confidence, reason) => ({ value: value || null, confidence, ...(reason ? { reason } : {}) });

export function extractAdvertisementNo(text) {
  const match = /(?:advertisement|advt\.?|centralised employment notification|cen)\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/._-]{2,})/i.exec(text);
  return match ? result(match[1], 'medium') : result(null, 'none', 'no advertisement number label found');
}

export function extractTotalPosts(text) {
  const match = /(?:total\s+(?:number of )?(?:posts?|vacancies)|total posts?)\s*[:=-]?\s*([\d,]+)/i.exec(text)
    || /([\d,]+)\s+(?:posts?|vacancies)\b/i.exec(text);
  if (!match) return result(null, 'none', 'no unambiguous total-post count found');
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isSafeInteger(value) ? result(value, 'medium') : result(null, 'none', 'invalid post count');
}

export function extractPostName(text, linkText = '') {
  const label = clean(linkText);
  if (label.length >= 5 && label.length <= 255) return result(label, 'high');
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

export function extractOfficialApplyLink(text) {
  const urls = String(text || '').match(/https?:\/\/[^\s<>()"]+/gi) || [];
  for (const url of urls) {
    const cleanUrl = url.replace(/[.,;]+$/, '');
    const start = Math.max(0, text.indexOf(url) - 140);
    if (/(?:apply|application|registration|candidate\s+portal|online)/i.test(text.slice(start, start + 160))) {
      return result(cleanUrl, 'low');
    }
  }
  return result(null, 'none', 'no labelled official apply URL found');
}

/** Turns an official document into a deliberately sparse job row. */
export function extractJob({ source, link, body, contentType = '', now = new Date() }) {
  const raw = contentType.includes('html') ? textFromHtml(body) : Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
  const dates = extractApplicationDates(raw, { now });
  const milestones = extractMilestoneDates(raw, { now });
  const age = extractAge(raw);
  const eligibility = labelledText(raw, 'educational\\s+qualification(?:s)?|essential\\s+qualification(?:s)?|eligibility|educational\\s+requirements?', ['age\\s+limit', 'selection\\s+process', 'application\\s+fee', 'fee\\s+details?', 'important\\s+instructions']);
  const selectionProcess = labelledText(raw, 'selection\\s+process|mode\\s+of\\s+selection|method\\s+of\\s+selection|selection\\s+procedure', ['age\\s+limit', 'application\\s+fee', 'fee\\s+details?', 'important\\s+instructions']);
  const fees = extractFees(raw);
  const relaxations = extractRelaxations(raw);
  const officialApplyLink = extractOfficialApplyLink(raw);
  const postName = extractPostName(raw, link.text);
  const advertisementNo = extractAdvertisementNo(raw);
  const totalPosts = extractTotalPosts(raw);
  const isPdf = /(?:application\/pdf|\.pdf(?:$|[?#]))/i.test(`${contentType} ${link.url}`);
  const fields = { postName, advertisementNo, totalPosts, ...dates, ...milestones, ...age, eligibility, selectionProcess, officialApplyLink,
    notificationPdfUrl: result(isPdf ? link.url : null, isPdf ? 'certain' : 'none', isPdf ? undefined : 'candidate was not a PDF') };
  const row = {
    postName: postName.value,
    organization: source.organization,
    category: source.category,
    state: source.state || null,
    advertisementNo: advertisementNo.value,
    totalPosts: totalPosts.value,
    applicationStartDate: dates.applicationStartDate.value,
    lastDate: dates.lastDate.value,
    admitCardDate: milestones.admitCardDate.value,
    examDate: milestones.examDate.value,
    resultDate: milestones.resultDate.value,
    ageMin: age.ageMin.value,
    ageMax: age.ageMax.value,
    eligibility: eligibility.value,
    selectionProcess: selectionProcess.value,
    officialApplyLink: officialApplyLink.value,
    notificationPdfUrl: isPdf ? link.url : null,
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
  return { row, fields, text: raw };
}
