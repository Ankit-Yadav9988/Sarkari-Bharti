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
 * How much the gap between a label and the date it "labels" is worth.
 *
 * "Last Date: 31/10/2026" is a label and its value. But a table flattened by
 * pdftotext puts the whole header row before the whole data row, so the text
 * reads "... Start Date Last Date Direct Recruitment D-2/E-1/2026 14/09/2026
 * 14/09/2026 14/10/2026" -- and the first date after the words "Last Date" is
 * the advertisement date, three columns too early. The label is real; the
 * adjacency is an illusion.
 *
 * What separates the two is what sits in between. Punctuation and a word or
 * two mean the date belongs to the label. Digits in the gap mean another cell
 * has already intervened, and the reading is unsafe -- which is what `low`
 * says, and what the pipeline's confidence gate then withholds.
 */
function confidenceForGap(gap) {
  if (gap.length <= 24 && !/\d/.test(gap) && !/[A-Za-z]{3,}/.test(gap)) return 'high';
  if (gap.length <= 80 && !/\d/.test(gap)) return 'medium';
  return 'low';
}

/**
 * Finds a date following one of the supplied labels.  A 180-character window
 * covers table cells flattened by pdftotext without letting an unrelated date
 * from another paragraph drift in.
 *
 * Every label is tried before settling for a weak reading, so a document that
 * mentions the deadline twice -- once in a table and once as plain text -- is
 * read from the plain text.
 */
export function dateNearLabel(text, labels, { now = new Date(), window = 180 } = {}) {
  const source = String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
  let weakest = null;
  for (const label of labels) {
    const labelRe = new RegExp(label, 'ig');
    let labelMatch;
    while ((labelMatch = labelRe.exec(source))) {
      const after = labelMatch.index + labelMatch[0].length;
      const slice = source.slice(after, after + window);
      const dateMatch = new RegExp(DATE_PATTERN, 'i').exec(slice);
      if (!dateMatch) continue;
      const value = parseIndianDate(dateMatch[0]);
      if (!isSaneNoticeDate(value, now)) continue;
      const gap = slice.slice(0, dateMatch.index);
      const confidence = confidenceForGap(gap);
      if (confidence !== 'low') return { value, confidence, label: labelMatch[0] };
      weakest ||= {
        value,
        confidence,
        label: labelMatch[0],
        reason: `"${labelMatch[0]}" is separated from ${value} by "${gap.trim().slice(0, 40)}", so the label probably belongs to a different column`,
      };
    }
  }
  return weakest || { value: null, confidence: 'none', reason: 'no labelled, in-range date found' };
}

export function extractApplicationDates(text, options) {
  return {
    applicationStartDate: dateNearLabel(text, [
      'application\\s+(?:form\\s+)?begin(?:s)?',
      'online\\s+(?:apply|application)\\s+start\\s+date',
      '(?:re[- ]?open\\s+)?form\\s+start\\s+date',
      'application\\s+(?:filling\\s+)?start\\s+date',
      'start\\s+date\\s+(?:for\\s+)?(?:online\\s+)?application',
      'date[s]? for submission of online application(?:s)?(?: form)?(?: begin| start| starts| from)?',
      'online application(?:s)?(?: form)?(?: begin| start| starts| from)',
      'opening date(?: for online application)?',
    ], options),
    lastDate: dateNearLabel(text, [
      'online\\s+(?:apply|application)\\s+last\\s+date',
      '(?:re[- ]?open\\s+)?form\\s+last\\s+date',
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
