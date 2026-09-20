/** Small dependency-free HTML helpers. They intentionally do not depend on a page's CSS. */

export function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ');
}

export function textFromHtml(html) {
  return decodeEntities(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
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
