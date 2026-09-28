/** Small dependency-free HTML helpers. They intentionally do not depend on a page's CSS. */

const NAMED_ENTITIES = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  // Punctuation the aggregator actually emits. `ndash` is the common one: its
  // job titles are written "... Online Form 2026 &#8211; Date Extend", and an
  // en dash left undecoded travels all the way to the public page.
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', middot: '·', bull: '•', deg: '°',
  laquo: '«', raquo: '»', times: '×', rupee: '₹', ensp: ' ', emsp: ' ', thinsp: ' ',
};

/**
 * Decode the entity forms that appear in real source pages.
 *
 * Numeric entities are the reason this is not a five-line replace chain any
 * more. Every CSV this pipeline has produced carries post names like
 * "Bank of Baroda SO Online Form 2026 (1100 Posts) &#8211; Date Extend" --
 * `&#8211;` is an en dash written numerically, which the old decoder did not
 * recognise, so it survived extraction, survived the importer, and would have
 * been rendered literally on the job page. It matters more for notices than for
 * jobs: a notice's title *is* the row the public Result page shows, with no
 * other field to fall back on.
 *
 * Unknown entities are left exactly as they are rather than being stripped. A
 * visible `&#8216;` in a title is a bug you can see and report; a silently
 * deleted character is one you cannot.
 */
export function decodeEntities(value) {
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    const lower = body.toLowerCase();
    if (lower[0] === '#') {
      const code = lower[1] === 'x' ? parseInt(lower.slice(2), 16) : Number(lower.slice(1));
      // Control characters and lone surrogates are not text. Refusing them also
      // keeps `&#0;` from becoming a NUL in a database column.
      if (!Number.isInteger(code) || code < 32 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) return whole;
      try { return String.fromCodePoint(code); } catch { return whole; }
    }
    return Object.hasOwn(NAMED_ENTITIES, lower) ? NAMED_ENTITIES[lower] : whole;
  });
}

export function textFromHtml(html) {
  return decodeEntities(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

/** Text from headings, useful when an aggregator puts the organisation in h2. */
export function headingsFromHtml(html) {
  const headings = [];
  const pattern = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]\s*>/gi;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    const text = textFromHtml(match[1]);
    if (text) headings.push(text);
  }
  return headings;
}

/** Every anchor, not a brittle selector for one source site's current markup. */
export function linksFromHtml(html, baseUrl) {
  const links = [];
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let match;
  while ((match = anchor.exec(String(html || '')))) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[1]);
    const rawHref = decodeEntities(href?.[1] ?? href?.[2] ?? href?.[3] ?? '').trim();
    if (!rawHref || /^(?:#|mailto:|tel:|javascript:|data:)/i.test(rawHref)) continue;
    try {
      const url = new URL(rawHref, baseUrl);
      if (!/^https?:$/.test(url.protocol)) continue;
      const text = textFromHtml(match[2]);
      // Recruitment indexes commonly put the useful title and dates in the
      // surrounding table row while the anchor itself says only "View" or
      // contains an icon. Preserve that row as context for discovery and
      // extraction without changing the anchor-text contract.
      const source = String(html || '');
      const rowStart = source.lastIndexOf('<tr', match.index);
      const rowEnd = source.indexOf('</tr', match.index + match[0].length);
      const previousRowEnd = source.lastIndexOf('</tr', match.index);
      const context = rowStart >= 0 && rowStart > previousRowEnd && rowEnd >= 0
        ? textFromHtml(source.slice(rowStart, rowEnd + 5))
        : '';
      links.push({ url: url.href, text, ...(context && context !== text ? { context } : {}) });
    } catch { /* malformed links are simply not candidates */ }
  }
  return links;
}
