/**
 * Date parsing for Indian recruitment notices.
 *
 * A date is only useful when the nearby words say what the date means.  A PDF
 * can contain an exam date, a corrigendum date and a publication date on the
 * same page; accepting the first date we see would be confidently wrong.
 */

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};

function iso(year, month, day) {
  const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${result}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === result ? result : null;
}

/** Strictly parses the common numeric and written formats used in notices. */
export function parseIndianDate(value) {
  const input = String(value || '').replace(/\s+/g, ' ').trim().replace(/,/g, '');
  let match = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/.exec(input);
  if (match) return iso(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(input);
  if (match) return iso(Number(match[3]), Number(match[2]), Number(match[1]));

  match = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})$/i.exec(input);
  if (match && MONTHS[match[2].toLowerCase()]) return iso(Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1]));

  match = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$/i.exec(input);
  if (match && MONTHS[match[1].toLowerCase()]) return iso(Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2]));
  return null;
}

export function isSaneNoticeDate(value, now = new Date()) {
  if (!value) return false;
  const day = new Date(`${value}T00:00:00Z`).getTime();
  const earliest = Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate());
  const latest = Date.UTC(now.getUTCFullYear() + 2, now.getUTCMonth(), now.getUTCDate());
  return day >= earliest && day <= latest;
}

const DATE_PATTERN = '(?:\\d{4}[./-]\\d{1,2}[./-]\\d{1,2}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+[A-Za-z]+\\s+\\d{4}|[A-Za-z]+\\s+\\d{1,2}(?:st|nd|rd|th)?\\s+\\d{4})';

export function datesInText(text, { now = new Date() } = {}) {
  const values = [];
  const pattern = new RegExp(DATE_PATTERN, 'gi');
  let match;
  while ((match = pattern.exec(String(text || '')))) {
    const value = parseIndianDate(match[0]);
    if (isSaneNoticeDate(value, now)) values.push(value);
  }
  return values;
}

/**
 * Finds a date following one of the supplied labels.  A 180-character window
 * covers table cells flattened by pdftotext without letting an unrelated date
 * from another paragraph drift in.
 */
export function dateNearLabel(text, labels, { now = new Date(), window = 180 } = {}) {
  const source = String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
  for (const label of labels) {
    const labelRe = new RegExp(label, 'ig');
    let labelMatch;
    while ((labelMatch = labelRe.exec(source))) {
      const slice = source.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + window);
      const dateMatch = new RegExp(DATE_PATTERN, 'i').exec(slice);
      if (!dateMatch) continue;
      const value = parseIndianDate(dateMatch[0]);
      if (isSaneNoticeDate(value, now)) return { value, confidence: 'medium', label: labelMatch[0] };
    }
  }
  return { value: null, confidence: 'none', reason: 'no labelled, in-range date found' };
}

export function extractApplicationDates(text, options) {
  return {
    applicationStartDate: dateNearLabel(text, [
      'application\\s+(?:form\\s+)?begin(?:s)?',
      'application\\s+(?:filling\\s+)?start\\s+date',
      'start\\s+date\\s+(?:for\\s+)?(?:online\\s+)?application',
      'date[s]? for submission of online application(?:s)?(?: form)?(?: begin| start| starts| from)?',
      'online application(?:s)?(?: form)?(?: begin| start| starts| from)',
      'opening date(?: for online application)?',
    ], options),
    lastDate: dateNearLabel(text, [
      'application\\s+(?:filling\\s+)?last\\s+date',
      'last\\s+date\\s+(?:for\\s+)?(?:online\\s+)?application',
      'last date(?: and time)?(?: for (?:receipt|submission) of online application(?:s)?(?: form)?)?',
      'closing date(?: and time)?(?: for online application(?:s)?)?',
      'last date to apply(?: online)?',
    ], options),
  };
}

export function extractMilestoneDates(text, options) {
  return {
    admitCardDate: dateNearLabel(text, [
      'admit card(?:s)?(?: will be|is|are)? available', 'admission certificate(?:s)?(?: will be|is|are)? available',
    ], options),
    examDate: dateNearLabel(text, [
      'date(?:s)? of (?:the )?(?:written )?examination', 'exam(?:ination)? date', 'computer based examination date',
    ], options),
    resultDate: dateNearLabel(text, [
      'result(?:s)?(?: will be|is|are)? declared', 'date of declaration of result', 'result date',
    ], options),
  };
}
