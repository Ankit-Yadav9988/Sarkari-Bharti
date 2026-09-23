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
const EXTRACTOR_VERSION = 4;

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
  const verificationRows = rows.map(({ extracted }) => {
    const metadata = extracted.metadata || {};
    return `| ${escapeMd(extracted.row.postName || extracted.link?.text || '')} | ${escapeMd(metadata.verificationStatus || 'PENDING_MANUAL')} | ${metadata.officialSourceFound ? 'yes' : 'no'} | ${escapeMd(metadata.aggregatorUrl || extracted.link?.url || '')} | ${escapeMd(extracted.row.notificationPdfUrl || extracted.row.officialApplyLink || '')} |`;
  }).join('\n') || '| — | — | — | — | — |';
  return `# Pipeline report — ${date}\n\nThis file is a review aid. It never publishes jobs; import the accompanying CSV through the existing admin screen and approve each valid row.\n\n## Source health\n\n| Source | Status | Links seen | Candidates | Detail |\n| --- | --- | ---: | ---: | --- |\n${sourceLines}\n\n## Output\n\n- Current review-queue rows written: ${rows.length}\n- Rows already published and omitted: ${skippedPublished}\n- Importer-valid rows: ${preview.valid}/${preview.total}\n- Rows needing manual completion: ${preview.invalid}\n- Consecutive zero-candidate runs: ${state.zeroCandidateDays}\n${warnings.map(w => `- Warning: ${w}`).join('\n')}\n\n## Verification queue\n\n| Post | Status | Official link found | Aggregator page | Official notification/apply link |\n| --- | --- | --- | --- | --- |\n${verificationRows}\n\n## Importer validation\n\n| CSV line | Post | Why it will be skipped |\n| ---: | --- | --- |\n${issues}\n\n## Fields deliberately left blank\n\n${fieldNotes}\n`;
}

function mergeExtracted(aggregatorExtracted, officialExtracted) {
  const row = { ...aggregatorExtracted.row };
  const fields = { ...aggregatorExtracted.fields };
  for (const [key, field] of Object.entries(officialExtracted.fields)) {
    if (field?.value != null && field.value !== '') { row[key] = field.value; fields[key] = field; }
  }
  return {
    ...aggregatorExtracted,
    row,
    fields,
    metadata: { ...aggregatorExtracted.metadata, officialSourceFound: true, officialFetch: 'OK' },
  };
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
        || prior.extractorVersion !== EXTRACTOR_VERSION || !prior.row
        || (link.source.kind === 'aggregator' && prior.metadata?.officialFetch === 'RETRY');
      if (!changed) {
        const cachedExtracted = { row: prior.row, fields: prior.fields || {}, metadata: prior.metadata || {}, link };
        if (cachedExtracted.row.notificationPdfUrl && publishedUrls.has(cachedExtracted.row.notificationPdfUrl)) { skippedPublished += 1; continue; }
        rows.push({ extracted: cachedExtracted });
        continue;
      }
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
      if (link.source.kind === 'aggregator' && extracted.row.notificationPdfUrl) {
        try {
          const official = await fetchCached(client, extracted.row.notificationPdfUrl, CACHE_DIR);
          const officialPdf = official.body.subarray(0, 4).toString() === '%PDF' || /application\/pdf/i.test(official.contentType);
          const officialText = await documentText(official.body, extracted.row.notificationPdfUrl, official.contentType);
          const officialExtracted = extractJob({
            source: { ...link.source, kind: 'official', organization: extracted.row.organization, category: extracted.row.category, state: extracted.row.state },
            link: { ...link, url: extracted.row.notificationPdfUrl },
            body: officialPdf ? officialText : official.body.toString('utf8'),
            contentType: officialPdf ? 'text/plain' : official.contentType,
            now,
          });
          Object.assign(extracted, mergeExtracted(extracted, officialExtracted));
          extracted.link = link;
        } catch (error) {
          extracted.metadata = { ...extracted.metadata, officialFetch: 'RETRY' };
          warnings.push(`${link.source.name}: official notification fetch failed for ${extracted.row.postName || link.url} — ${error.message}`);
        }
      } else if (link.source.kind === 'aggregator') {
        extracted.metadata = { ...extracted.metadata, officialFetch: 'NOT_FOUND' };
      }
      if (extracted.row.notificationPdfUrl && publishedUrls.has(extracted.row.notificationPdfUrl)) {
        state.candidates[link.url] = {
          hash: downloaded.hash, status: 'processed', extractorVersion: EXTRACTOR_VERSION,
          seenAt: new Date().toISOString(), source: link.source.id,
          row: extracted.row, fields: extracted.fields, metadata: extracted.metadata || {},
        };
        skippedPublished += 1;
        continue;
      }
      rows.push({ extracted });
      state.candidates[link.url] = {
        hash: downloaded.hash, status: 'processed', extractorVersion: EXTRACTOR_VERSION,
        seenAt: new Date().toISOString(), source: link.source.id,
        row: extracted.row, fields: extracted.fields, metadata: extracted.metadata || {},
      };
    } catch (error) { warnings.push(`${link.source.name}: ${link.url} — ${error.message}`); }
  }

  const candidateCount = discovery.candidates.length;
  state.zeroCandidateDays = candidateCount === 0 ? (state.zeroCandidateDays || 0) + 1 : 0;
  if (candidateCount > 0 && rows.length === 0 && skippedPublished === 0) {
    warnings.push('Candidates were discovered, but no review row was written. Inspect the report warnings and source health.');
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

/**
 * Decides whether a run's *sources* were healthy enough to trust its output.
 *
 * This is separate from "did the code throw". On 2026-09-21 seven of nine
 * sources failed -- the government sites time out or refuse GitHub's US
 * datacentre addresses -- and the run still exited 0, committed a CSV and
 * reported success. The aggregator was the only healthy source, so 94 of 100
 * candidates came from a site that copies other people's notices, and every one
 * of them was marked PENDING_MANUAL. Nothing was wrong with the code; the run
 * was simply not worth trusting, and nothing said so.
 *
 * The three conditions below are the ones where the output is systematically
 * skewed rather than merely thinner:
 *
 *   - Most sources failed. What came back is not a sample of the day's
 *     vacancies, it is a sample of whichever sites happened to answer.
 *   - Every official source failed but the aggregator answered. This is the
 *     worst shape: the run looks productive precisely because the least
 *     authoritative source is the only one left.
 *   - Nothing was found at all, from anywhere.
 *
 * A single source timing out is normal and stays a warning: it thins the
 * results without bending them.
 *
 * The run still writes its CSV and report before this is consulted. A red run
 * with usable output is useful; a red run that threw its output away is not.
 */
export function sourceHealth(reports, candidateCount) {
  const reasons = [];
  if (!reports.length) return { ok: false, reasons: ['No sources were configured, so nothing could be collected.'] };

  const failed = reports.filter(r => !r.ok);
  const official = reports.filter(r => r.source.kind !== 'aggregator');
  const aggregators = reports.filter(r => r.source.kind === 'aggregator');
  const name = list => list.map(r => r.source.name).join(', ');

  if (failed.length * 2 > reports.length) {
    reasons.push(`${failed.length} of ${reports.length} sources failed (${name(failed)}), so this run saw only part of the day's vacancies.`);
  }
  if (official.length && official.every(r => !r.ok) && aggregators.some(r => r.ok)) {
    reasons.push(`Every official source failed (${name(official)}) while the aggregator answered, so all of today's candidates are second-hand and none could be checked against the issuing body.`);
  }
  if (candidateCount === 0) {
    reasons.push('No candidates were found by any source.');
  }
  return { ok: reasons.length === 0, reasons };
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

    const health = sourceHealth(outcome.discovery.reports, outcome.discovery.candidates.length);
    if (!health.ok) {
      for (const reason of health.reasons) console.error(`UNHEALTHY: ${reason}`);
      console.error('The CSV and report above were still written and are still worth reading. This run is marked failed so it is not mistaken for a normal day.');
      process.exitCode = 1;
    }
  } catch (error) { console.error(`Pipeline failed: ${error.message}`); process.exitCode = 1; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
