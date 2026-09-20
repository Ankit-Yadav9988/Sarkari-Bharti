import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCsv, previewValidation } from './lib/csv-out.js';
import { extractJob } from './lib/extract.js';
import { createPoliteClient, fetchCached } from './lib/http.js';
import { SOURCES } from './lib/sources.js';
import { discover } from './discover.js';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(HERE, 'state', 'seen.json');
const CACHE_DIR = path.join(HERE, 'cache');
const OUT_DIR = path.join(HERE, 'out');
// Increment when extraction logic changes materially. Existing candidates are
// then read once again so a code improvement can enrich rows already seen by
// an earlier workflow run instead of being hidden forever by seen.json.
const EXTRACTOR_VERSION = 3;

const isoToday = () => new Date().toISOString().slice(0, 10);
const escapeMd = value => String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

async function readState() {
  try { return JSON.parse(await readFile(STATE_PATH, 'utf8')); }
  catch { return { version: 1, requests: {}, candidates: {}, zeroCandidateDays: 0 }; }
}

async function writeJsonAtomic(destination, value) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, destination);
}

async function writeTextAtomic(destination, value) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, value);
  await rename(temporary, destination);
}

function isPdf(url, contentType) { return /(?:application\/pdf|\.pdf(?:$|[?#]))/i.test(`${url} ${contentType}`); }

async function documentText(body, url, contentType) {
  if (!isPdf(url, contentType)) return body.toString('utf8');
  const file = path.join(CACHE_DIR, `extract-${Buffer.from(url).toString('base64url')}.pdf`);
  await mkdir(CACHE_DIR, { recursive: true }); await writeFile(file, body);
  try {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', file, '-'], { maxBuffer: 8 * 1024 * 1024 });
    return stdout;
  } catch {
    // A scanned PDF has no selectable text. Returning an empty string keeps the
    // skeleton row, and the report tells the reviewer exactly why it is sparse.
    return '';
  }
}

async function publishedNotificationUrls() {
  const base = process.env.SARKARI_API_URL?.replace(/\/$/, '');
  if (!base) return { urls: new Set(), warning: 'SARKARI_API_URL is unset; live-site duplicate filtering was skipped.' };
  const urls = new Set(); let page = 0;
  for (;;) {
    const response = await fetch(`${base}/jobs?page=${page}&size=100`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Could not check published jobs: HTTP ${response.status}`);
    const data = await response.json(); const jobs = Array.isArray(data) ? data : data.content || [];
    for (const job of jobs) if (job.notificationPdfUrl) urls.add(job.notificationPdfUrl);
    if (Array.isArray(data) || data.last || page + 1 >= (data.totalPages || 1)) break;
    page += 1;
  }
  return { urls, warning: null };
}

function reportMarkdown({ date, discovery, rows, preview, skippedPublished, warnings, state }) {
  const sourceLines = discovery.reports.map(r => `| ${r.source.name} | ${r.ok ? 'OK' : 'FAILED'} | ${r.linksSeen} | ${r.candidates.length} | ${escapeMd(r.error || '')} |`).join('\n');
  const issues = preview.problems.length
    ? preview.problems.map(p => `| ${p.line} | ${escapeMd(p.postName)} | ${escapeMd(p.errors.join('; '))} |`).join('\n')
    : '| — | — | None |';
  const fieldNotes = rows.map(({ extracted }) => {
    const missing = Object.entries(extracted.fields).filter(([, f]) => !f.value).map(([name, f]) => `${name}: ${f.reason || 'not extracted'}`);
    return missing.length ? `- **${escapeMd(extracted.row.postName || extracted.link.text || extracted.link.url)}** — ${missing.join('; ')}` : null;
  }).filter(Boolean).join('\n') || '- None.';
  return `# Pipeline report — ${date}\n\nThis file is a review aid. It never publishes jobs; import the accompanying CSV through the existing admin screen and approve each valid row.\n\n## Source health\n\n| Source | Status | Links seen | Candidates | Detail |\n| --- | --- | ---: | ---: | --- |\n${sourceLines}\n\n## Output\n\n- Candidate documents processed: ${rows.length}\n- Rows already published and omitted: ${skippedPublished}\n- Importer-valid rows: ${preview.valid}/${preview.total}\n- Rows needing manual completion: ${preview.invalid}\n- Consecutive zero-candidate runs: ${state.zeroCandidateDays}\n${warnings.map(w => `- Warning: ${w}`).join('\n')}\n\n## Importer validation\n\n| CSV line | Post | Why it will be skipped |\n| ---: | --- | --- |\n${issues}\n\n## Fields deliberately left blank\n\n${fieldNotes}\n`;
}

export async function runPipeline({ sources = SOURCES, now = new Date(), state: suppliedState, client: suppliedClient } = {}) {
  const state = suppliedState || await readState(); state.requests ||= {}; state.candidates ||= {};
  const client = suppliedClient || createPoliteClient({ state });
  const discovery = await discover({ sources, state, client, cacheDir: CACHE_DIR });
  for (const report of discovery.reports.filter(r => !r.ok)) {
    console.warn(`SOURCE FAILED — ${report.source.name}: ${report.error}`);
  }
  if (discovery.reports.every(r => !r.ok)) {
    const reasons = discovery.reports.map(r => `${r.source.name}: ${r.error}`).join(' | ');
    throw new Error(`Every source failed; refusing to produce an empty, misleading run. ${reasons}`);
  }

  const { urls: publishedUrls, warning } = await publishedNotificationUrls();
  const rows = []; let skippedPublished = 0; const warnings = warning ? [warning] : [];
  for (const link of discovery.candidates) {
    try {
      const downloaded = await fetchCached(client, link.url, CACHE_DIR);
      const prior = state.candidates[link.url];
      // A URL is only marked processed after extraction succeeds. Older state
      // files have no status field, so they are eligible once for a safe
      // migration/retry instead of permanently hiding a previously failed PDF.
      const changed = !prior || prior.hash !== downloaded.hash || prior.status !== 'processed'
        || prior.extractorVersion !== EXTRACTOR_VERSION;
      if (!changed) continue;
      // Some government servers redirect dead PDF URLs to an HTML home page.
      // Do not feed that HTML to pdftotext and call the result a scanned PDF.
      const looksLikePdf = downloaded.body.subarray(0, 4).toString() === '%PDF';
      const isDocumentPdf = looksLikePdf || (/application\/pdf/i.test(downloaded.contentType) && !/html/i.test(downloaded.contentType));
      const text = await documentText(downloaded.body, link.url, downloaded.contentType);
      const extracted = extractJob({
        source: link.source, link,
        body: isDocumentPdf ? text : downloaded.body.toString('utf8'),
        contentType: isDocumentPdf ? 'text/plain' : downloaded.contentType,
        now,
      });
      extracted.link = link;
      if (extracted.row.notificationPdfUrl && publishedUrls.has(extracted.row.notificationPdfUrl)) {
        state.candidates[link.url] = { hash: downloaded.hash, status: 'processed', extractorVersion: EXTRACTOR_VERSION, seenAt: new Date().toISOString(), source: link.source.id };
        skippedPublished += 1;
        continue;
      }
      rows.push({ extracted });
      state.candidates[link.url] = { hash: downloaded.hash, status: 'processed', extractorVersion: EXTRACTOR_VERSION, seenAt: new Date().toISOString(), source: link.source.id };
    } catch (error) { warnings.push(`${link.source.name}: ${link.url} — ${error.message}`); }
  }

  const candidateCount = discovery.candidates.length;
  state.zeroCandidateDays = candidateCount === 0 ? (state.zeroCandidateDays || 0) + 1 : 0;
  if (candidateCount > 0 && rows.length === 0 && skippedPublished === 0) {
    warnings.push('Candidates were discovered, but no changed row was written. They may already be recorded in seen.json or document extraction failed; inspect the report warnings.');
  }
  if (state.zeroCandidateDays >= 7) warnings.push('No candidates have been found for seven consecutive runs; inspect the source pages and keyword filters.');
  state.updatedAt = new Date().toISOString();

  const csv = toCsv(rows.map(r => r.extracted.row)); const preview = previewValidation(csv); const date = isoToday();
  const report = reportMarkdown({ date, discovery, rows, preview, skippedPublished, warnings, state });
  // All writes happen only after every fetch/extraction has settled. The state
  // write is last, so an interrupted run cannot mark unseen work as completed.
  await mkdir(OUT_DIR, { recursive: true });
  await writeTextAtomic(path.join(OUT_DIR, `jobs-${date}.csv`), csv);
  await writeTextAtomic(path.join(OUT_DIR, `jobs-${date}.report.md`), report);
  await writeJsonAtomic(STATE_PATH, state);
  return { date, discovery, rows, preview, warnings, skippedPublished };
}

async function main() {
  try {
    const outcome = await runPipeline();
    console.log(`Wrote ${outcome.rows.length} changed candidate row(s); ${outcome.preview.valid} importer-valid, ${outcome.preview.invalid} need review.`);
    for (const warning of outcome.warnings) console.warn(`WARNING: ${warning}`);
    // Partial source failure is recorded in the report, but does not discard
    // safe output from other sources. A failed source is actionable in the
    // report and Action log; a missing CSV for healthy sources is not.
    if (outcome.discovery.reports.some(r => !r.ok)) console.warn('WARNING: one or more sources failed; see the report source-health table.');
  } catch (error) { console.error(`Pipeline failed: ${error.message}`); process.exitCode = 1; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
