import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linksFromHtml } from './lib/html.js';
import { createPoliteClient, fetchCached } from './lib/http.js';
import { SOURCES, RECRUITMENT_KEYWORDS, NOTICE_KEYWORDS } from './lib/sources.js';

export function canonicalUrl(value) {
  const url = new URL(value); url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  return url.href;
}

export function isCandidate(link, source, { includeNotices = false } = {}) {
  const host = new URL(link.url).hostname.toLowerCase();
  if (!source.allowedHosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`))) return false;
  const haystack = `${link.text} ${link.url}`.toLowerCase();
  const words = includeNotices ? [...RECRUITMENT_KEYWORDS, ...NOTICE_KEYWORDS] : RECRUITMENT_KEYWORDS;
  return words.some(word => haystack.includes(word.toLowerCase()));
}

export function inspectSource({ source, html, includeNotices = false }) {
  const all = linksFromHtml(html, source.url).map(link => ({ ...link, url: canonicalUrl(link.url) }));
  if (all.length < 5) throw new Error(`${source.name}: only ${all.length} links found (minimum is 5); treating this as a source failure.`);
  const unique = new Map();
  for (const link of all) if (isCandidate(link, source, { includeNotices })) unique.set(link.url, link);
  return { linksSeen: all.length, candidates: [...unique.values()] };
}

export async function discover({
  sources = SOURCES, state = {}, includeNotices = false, client = createPoliteClient({ state }),
  cacheDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cache'), readOnly = false,
} = {}) {
  const reports = []; const candidates = [];
  for (const source of sources) {
    try {
      // Source-page bodies use the same conditional cache as PDFs. A 304 is
      // therefore a cheap normal success, not an impossible empty response.
      const downloaded = await fetchCached(client, source.url, cacheDir, { readOnly });
      const report = inspectSource({ source, html: downloaded.body.toString('utf8'), includeNotices });
      reports.push({ source, ok: true, ...report });
      candidates.push(...report.candidates.map(link => ({ source, ...link })));
    } catch (error) { reports.push({ source, ok: false, error: error.message, linksSeen: 0, candidates: [] }); }
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
