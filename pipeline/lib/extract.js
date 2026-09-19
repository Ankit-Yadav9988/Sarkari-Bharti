import { extractApplicationDates } from './dates.js';
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

/** Turns an official document into a deliberately sparse job row. */
export function extractJob({ source, link, body, contentType = '', now = new Date() }) {
  const raw = contentType.includes('html') ? textFromHtml(body) : Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
  const dates = extractApplicationDates(raw, { now });
  const postName = extractPostName(raw, link.text);
  const advertisementNo = extractAdvertisementNo(raw);
  const totalPosts = extractTotalPosts(raw);
  const isPdf = /(?:application\/pdf|\.pdf(?:$|[?#]))/i.test(`${contentType} ${link.url}`);
  const fields = { postName, advertisementNo, totalPosts, ...dates, notificationPdfUrl: result(isPdf ? link.url : null, isPdf ? 'certain' : 'none', isPdf ? undefined : 'candidate was not a PDF') };
  const row = {
    postName: postName.value,
    organization: source.organization,
    category: source.category,
    advertisementNo: advertisementNo.value,
    totalPosts: totalPosts.value,
    applicationStartDate: dates.applicationStartDate.value,
    lastDate: dates.lastDate.value,
    notificationPdfUrl: isPdf ? link.url : null,
  };
  return { row, fields, text: raw };
}
