import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linksFromHtml } from './lib/html.js';
import { createPoliteClient, fetchCached } from './lib/http.js';
import { classifyNotice } from './lib/notices.js';
import { SOURCES, RECRUITMENT_KEYWORDS, NOTICE_KEYWORDS } from './lib/sources.js';

export function canonicalUrl(value) {
  const url = new URL(value); url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  if (url.hostname === 'www.sarkariresult.com') url.hostname = 'sarkariresult.com';
  if (url.hostname === 'www.sarkariresult.com.cm') url.hostname = 'sarkariresult.com.cm';
  return url.href;
}

/**
 * The checks that have nothing to do with what we are collecting.
 *
 * Pulled out of `isCandidate` so the notice filter can reuse them instead of
 * keeping its own copy. Every rule here rejects a link for being part of the
 * page rather than part of its content: another host, an unrendered Angular
 * template, a pagination link, the page linking to itself. None of them know or
 * care whether we are after vacancies or results, and all of them would
 * otherwise have to be remembered twice.
 */
export function looksLikeChrome(link, source) {
  const host = new URL(link.url).hostname.toLowerCase();
  if (!source.allowedHosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`))) return true;
  // Angular/Vue government portals expose untranslated keys and generic
  // placeholder links in their initial HTML shell. They are not notices.
  if (/\{\{|\}\}|_HM\b|_E_HM\b|_I_HM\b/i.test(link.text)) return true;
  const parsed = new URL(link.url);
  const id = parsed.searchParams.get('ID');
  if (id && id.length < 5 && source.id !== 'uppsc') return true;
  if (parsed.searchParams.has('page')) return true;
  if (canonicalUrl(link.url) === canonicalUrl(source.url)) return true;
  return false;
}

export function isCandidate(link, source, { includeNotices = false } = {}) {
  if (looksLikeChrome(link, source)) return false;
  const parsed = new URL(link.url);
  const haystack = `${link.text} ${link.context || ''} ${link.url}`.toLowerCase();
  if (source.kind === 'aggregator') {
    if (!/(?:online\s+form|recruitment|vacanc(?:y|ies)|bharti|apply\s+online|apprentice|walk[- ]?in|notification|employment)/i.test(haystack)) return false;
    if (/(?:admit\s+card|answer\s+key|\bresult\b|correction|counselling|document\s+upload|option\s+form|fee\s+payment|exam\s+city|syllabus)/i.test(haystack)
      && !/(?:online\s+form|recruitment|vacanc(?:y|ies)|bharti|apply\s+online)/i.test(link.text || '')) return false;
    return true;
  }
  if (source.id === 'rpsc' && !haystack.includes(String(new Date().getUTCFullYear()))) return false;
  if (source.id === 'uppsc' && /candidatepages\/notifications\.aspx/i.test(parsed.pathname)) {
    return /\bapply\b|recruitment|advt\.?/i.test(haystack);
  }
  const words = source.id === 'uppsc'
    ? RECRUITMENT_KEYWORDS.filter(word => word !== 'notice' && word !== 'advt')
    : includeNotices ? [...RECRUITMENT_KEYWORDS, ...NOTICE_KEYWORDS] : RECRUITMENT_KEYWORDS;
  return words.some(word => haystack.includes(word.toLowerCase()));
}

/**
 * The filter for the result / admit-card collector.
 *
 * Deliberately not built from keyword lists the way `isCandidate` is. The
 * question "is this a result or an admit card" already has one answer, in
 * `classifyNotice`, and that answer is what the CSV's `type` column is filled
 * from. Asking it twice -- once loosely to decide whether to look, once strictly
 * to decide what it is -- is how a link gets collected and then dropped with no
 * explanation, or worse, collected under one rule and typed under another.
 *
 * It follows that this filter and `isCandidate` cannot both accept the same
 * link: `classifyNotice` rejects anything whose anchor text reads as a vacancy,
 * and `isCandidate` rejects any aggregator link whose anchor says "result"
 * without also saying "online form". The two collectors partition the page.
 */
export function isNoticeCandidate(link, source) {
  if (looksLikeChrome(link, source)) return false;
  return classifyNotice({ text: link.text, context: link.context, url: link.url, source }).type !== null;
}

/**
 * Extract document links from a public JSON feed without assuming a particular
 * response wrapper (some departments call it `data`, others `items` or `rows`).
 */
export function linksFromJson(json, baseUrl) {
  const links = []; const seen = new Set();
  const visit = (value, inheritedText = '') => {
    if (Array.isArray(value)) { value.forEach(item => visit(item, inheritedText)); return; }
    if (!value || typeof value !== 'object') return;
    const localText = [value.headline, value.title, value.name, value.subject, value.description]
      .filter(v => typeof v === 'string').join(' ').replace(/\s+/g, ' ').trim();
    const text = [inheritedText, localText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    for (const [key, raw] of Object.entries(value)) {
      if (typeof raw !== 'string' || !/(?:url|link|redirect|attachment|document|file)/i.test(key)) continue;
      try {
        const url = new URL(raw, baseUrl);
        if (!/^https?:$/.test(url.protocol) || seen.has(url.href)) continue;
        seen.add(url.href); links.push({ url: url.href, text });
      } catch { /* non-URL metadata is not a link */ }
    }
    Object.values(value).forEach(child => visit(child, text));
  };
  visit(json); return links;
}

/**
 * One source page -> its candidates, under whichever filter is supplied.
 *
 * `filter` defaults to the vacancy rule, so every existing caller is unchanged.
 * The notice collector passes `isNoticeCandidate`. Everything else here -- the
 * canonicalisation, the dedupe by URL, the cap, and the "fewer than five links
 * means the source failed" rule -- is shared, because all of it is about whether
 * the page was fetched properly rather than what we wanted from it.
 */
/* How many rejected links are kept per source for the report. A cap rather than
   everything: an aggregator page can carry several hundred links, almost all of
   them rejected, and a report nobody scrolls to the end of is not a report. */
export const MAX_RECORDED_REJECTIONS = 60;

export function inspectSource({ source, html, links, includeNotices = false, filter }) {
  const accept = filter || ((link, src) => isCandidate(link, src, { includeNotices }));
  const all = (links || linksFromHtml(html, source.url)).map(link => ({ ...link, url: canonicalUrl(link.url) }));
  if (all.length < 5) throw new Error(`${source.name}: only ${all.length} links found (minimum is 5); treating this as a source failure.`);
  const unique = new Map();
  /* Links the filter turned down are handed back rather than dropped on the
     floor. A collector that silently discards most of a notice board is
     indistinguishable from one whose rules have gone wrong, and the only way to
     tell the two apart is to see what it passed over.

     What `looksLikeChrome` removes is excluded from the record: other hosts,
     paginated views, template placeholders, and the page linking to itself.
     Those are structural and identical on every run. Ordinary in-site
     navigation is *not* excluded -- "About us" will appear in the table reading
     "no result or admit-card wording", because the filter judges anchor text
     and has no separate notion of a menu. That is accepted noise: the cost is a
     few dull rows, and the alternative is a second keyword list whose false
     positives would hide real notices. */
  const rejected = new Map();
  let rejectedTotal = 0;
  for (const link of all) {
    if (accept(link, source)) { unique.set(link.url, link); continue; }
    if (looksLikeChrome(link, source)) continue;
    rejectedTotal += 1;
    if (rejected.size < MAX_RECORDED_REJECTIONS) rejected.set(link.url, link);
  }
  const candidates = [...unique.values()];
  return {
    linksSeen: all.length,
    candidates: source.maxCandidates ? candidates.slice(0, source.maxCandidates) : candidates,
    rejected: [...rejected.values()],
    rejectedTotal,
  };
}

export async function discover({
  sources = SOURCES, state = {}, includeNotices = false, filter, client = createPoliteClient({ state }),
  cacheDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cache'), readOnly = false,
} = {}) {
  const reports = []; const candidates = [];
  for (const source of sources) {
    try {
      // Source-page bodies use the same conditional cache as PDFs. A 304 is
      // therefore a cheap normal success, not an impossible empty response.
      const sourceUrls = [source.url, ...(source.fallbackUrls || [])];
      let downloaded; let lastError;
      for (const sourceUrl of sourceUrls) {
        try {
          downloaded = await fetchCached(client, sourceUrl, cacheDir, { readOnly });
          break;
        } catch (error) { lastError = error; }
      }
      if (!downloaded) throw lastError || new Error(`Could not fetch ${source.name}`);
      const body = downloaded.body.toString('utf8');
      let links;
      if (source.format === 'json') {
        try { links = linksFromJson(JSON.parse(body), source.url); }
        catch { throw new Error(`${source.name}: official JSON feed returned invalid JSON.`); }
      }
      const report = inspectSource({ source, html: body, links, includeNotices, filter });
      reports.push({ source, ok: true, ...report });
      candidates.push(...report.candidates.map(link => ({ source, ...link })));
    } catch (error) { reports.push({ source, ok: false, error: error.message, linksSeen: 0, candidates: [], rejected: [], rejectedTotal: 0 }); }
  }
  return { reports, candidates };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const statePath = path.join(here, 'state', 'seen.json');
  let state = {}; try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch { /* first run */ }
  // A dry run must not update conditional metadata or write a document cache.
  if (dryRun) state = { requests: {} };
  const { reports, candidates } = await discover({ state, includeNotices: process.argv.includes('--include-notices'), readOnly: dryRun });
  for (const report of reports) {
    console.log(`${report.ok ? 'OK' : 'FAIL'} ${report.source.name}: ${report.linksSeen} links, ${report.candidates.length} candidates${report.error ? ` — ${report.error}` : ''}`);
  }
  for (const candidate of candidates) console.log(`CANDIDATE [${candidate.source.id}] ${candidate.text || '(no link text)'} — ${candidate.url}`);
  if (dryRun) console.log('Dry run: no state or output files were written.');
  if (reports.some(r => !r.ok)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
