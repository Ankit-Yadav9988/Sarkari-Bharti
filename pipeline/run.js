import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobLooseKey, jobStrictKey } from './lib/columns.js';
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

/**
 * A last date as the duplicate key needs it: `YYYY-MM-DD`, or `''` for none.
 *
 * The strict key embeds the last date as a literal string, and the two sides of
 * every comparison come from different places. The pipeline's own dates are
 * already ISO -- csv.js compares them with `<`, so they have to be -- but the
 * published side is JSON from a Java `LocalDate`, which Jackson writes as
 * `"2026-07-20"` under this project's configuration and could be persuaded to
 * write otherwise. A date that arrives in any other shape would build a key that
 * can never match anything, and this particular failure is invisible: no error,
 * no match, every already-published row imported a second time. Normalising both
 * sides through one function is cheaper than debugging that.
 *
 * Exported so the check harness can assert on it directly. A harness that
 * restated this logic would be testing its own copy.
 */
export function isoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : '';
  }
  // `[2026, 7, 20]` is what Jackson emits with WRITE_DATES_AS_TIMESTAMPS on.
  if (Array.isArray(value) && value.length >= 3) {
    const [y, m, d] = value;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

/** The key that decides "this is the same posting", for one CSV-shaped row. */
export const rowKey = row => jobStrictKey(row.postName, row.organization, isoDate(row.lastDate));

/**
 * Whether a row has enough of a post name to be identified at all.
 *
 * Asked through `jobLooseKey` rather than by trimming the string here, because
 * "this name is empty" has to mean exactly what it means inside the key: the
 * normaliser also strips spaces, underscores and hyphens, so a post name of
 * `"--"` is empty to the key and non-empty to a trim.
 *
 * It matters because a candidate whose PDF could not be read produces a skeleton
 * row with no post name. Two of those are two unread notifications, not one
 * posting twice, and keying them would drop the second as a duplicate of the
 * first -- deleting exactly the rows that most need a human to look at them.
 */
const hasPostName = row => jobLooseKey(row.postName, '') !== '|';
export { hasPostName };

/**
 * The rule that decides whether a candidate row goes into today's CSV.
 *
 * Pulled out of `runPipeline` and exported so the check harness can drive it
 * with plain objects. It is the part of this file most worth testing and the
 * part hardest to reach through a real run, which needs nine live government
 * websites to answer.
 *
 * It carries the memory of what has been emitted so far in this run, so the
 * order rows are offered in is part of the behaviour: the first copy stays,
 * later ones are dropped. That matches the importer, where the earliest line
 * wins, and it matches the admin duplicate screen, where the oldest posting is
 * the keeper — the one whose URL is already shared and indexed.
 *
 * Only reasons that make a row <i>certainly</i> redundant are in here, because
 * a drop is silent apart from one line in the report. "Same post name and
 * organisation but a different last date" is deliberately not one of them: that
 * is next year's sitting of the same exam, a real and separate vacancy. It is
 * imported and flagged as worth a look.
 */
export function createDuplicateFilter({ publishedUrls = new Set(), publishedKeys = new Set() } = {}) {
  // Strict key -> the post name already emitted under it. Two candidate URLs
  // can be the same notification: the aggregator lists a vacancy and the
  // issuing body publishes it too.
  const seenThisRun = new Map();

  return {
    /** `{ published, reason }` if the row must stay out, or null if it belongs in. */
    reasonToDrop(row) {
      if (row.notificationPdfUrl && publishedUrls.has(row.notificationPdfUrl)) {
        return { published: true, reason: 'already on the site — same notification PDF' };
      }
      // No post name means an unreadable notification. Two of those are two
      // different unread PDFs, not one posting twice, and they are exactly the
      // rows that most need a human to look at them.
      if (!hasPostName(row)) return null;
      const key = rowKey(row);
      if (publishedKeys.has(key)) {
        return { published: true, reason: 'already on the site — same post name, organization and last date' };
      }
      const earlier = seenThisRun.get(key);
      if (earlier) {
        return { published: false, reason: `same posting as "${earlier}" earlier in this run` };
      }
      return null;
    },

    /** Records that this row was emitted, so a later copy of it is a duplicate. */
    remember(row, name) {
      if (hasPostName(row)) seenThisRun.set(rowKey(row), name || row.postName);
    },
  };
}
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

/**
 * Everything the live site already has, in both forms a candidate can match.
 *
 * <b>Why two forms, and why the second one exists.</b> This used to collect
 * notification PDF URLs only, and every caller guarded with
 * `if (row.notificationPdfUrl && urls.has(...))`. That guard did nothing at all
 * for a large share of rows, because `extract.js` gives `notificationPdfUrl`
 * confidence `'none'` when it cannot find a PDF and the confidence gate then
 * blanks the field -- so the condition was false and the row sailed through as
 * new. That is the mechanism behind the 99 repeated rows across the 20-24
 * September CSVs: 54 of the 24th's rows were already in the 23rd's file.
 *
 * So identity is also asked the way the importer and the admin screens ask it:
 * post name plus organisation plus last date. That works without a PDF link and
 * without an admin token, because `JobSummaryResponse` already carries all three
 * fields on the public listing -- which matters, since this runs in GitHub
 * Actions with `SARKARI_API_URL` and no JWT.
 *
 * With no API URL configured the run continues with two empty sets and says so
 * in the report. Refusing to run would turn a missing variable into no CSV at
 * all; the honest version is a CSV plus a warning that it may repeat what is
 * already published.
 */
async function publishedJobIdentity() {
  const base = process.env.SARKARI_API_URL?.replace(/\/$/, '');
  if (!base) {
    return {
      urls: new Set(), keys: new Set(),
      warning: 'SARKARI_API_URL is unset; live-site duplicate filtering was skipped, so this CSV may repeat postings that are already published.',
    };
  }
  const urls = new Set(); const keys = new Set(); let page = 0;
  for (;;) {
    const response = await fetch(`${base}/jobs?page=${page}&size=100`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Could not check published jobs: HTTP ${response.status}`);
    const data = await response.json(); const jobs = Array.isArray(data) ? data : data.content || [];
    for (const job of jobs) {
      if (job.notificationPdfUrl) urls.add(job.notificationPdfUrl);
      if (job.postName) keys.add(rowKey(job));
    }
    if (Array.isArray(data) || data.last || page + 1 >= (data.totalPages || 1)) break;
    page += 1;
  }
  return { urls, keys, warning: null };
}

/**
 * The "Duplicates" section: what was left out, and what is here again.
 *
 * Three separate things, deliberately not merged into one list, because the
 * right response to each is different:
 *
 *   - <b>Left out.</b> Already on the site, or the same posting twice in this
 *     run. Nothing to do; this is the section proving the filter worked, and
 *     the place to look when a posting you expected is missing from the CSV.
 *   - <b>Here again from an earlier run.</b> Emitted before and still not
 *     published, so still emitted. These are <i>not</i> dropped: approval is
 *     manual, and a row skipped because it was offered once already would be
 *     lost from every future CSV if that day's file was never imported. A
 *     climbing "times offered" count means a row keeps being passed over --
 *     either publish it or work out what is wrong with it.
 *   - <b>Worth a look.</b> Same post name and organisation as another row in
 *     this file but a different last date. Usually next year's exam, which is
 *     correct and must not be filtered; occasionally a mistyped year, which is
 *     why it is on the page.
 */
export function duplicateSection({ drops, carriedOver, notes }) {  const published = drops.filter(d => d.published);
  const withinRun = drops.filter(d => !d.published);
  const lines = [];

  lines.push('## Duplicates');
  lines.push('');
  lines.push(`- Left out as already published: ${published.length}`);
  lines.push(`- Left out as a repeat within this run: ${withinRun.length}`);
  lines.push(`- Offered again from an earlier run: ${carriedOver.length}`);
  lines.push('');

  if (drops.length) {
    lines.push('### Left out of the CSV');
    lines.push('');
    lines.push('| Post | Why it was left out | Source page |');
    lines.push('| --- | --- | --- |');
    for (const drop of drops) {
      lines.push(`| ${escapeMd(drop.postName)} | ${escapeMd(drop.reason)} | ${escapeMd(drop.url)} |`);
    }
    lines.push('');
  }

  if (carriedOver.length) {
    lines.push('### Offered again from an earlier run');
    lines.push('');
    lines.push('These are in today\'s CSV. They were in an earlier one too and are still not on the site.');
    lines.push('');
    lines.push('| Post | First offered | Times offered |');
    lines.push('| --- | --- | ---: |');
    for (const row of carriedOver) {
      lines.push(`| ${escapeMd(row.postName)} | ${escapeMd(row.firstEmittedOn)} | ${row.emitCount} |`);
    }
    lines.push('');
  }

  if (notes.length) {
    lines.push('### Worth a look — same post, different last date');
    lines.push('');
    lines.push('| CSV line | Post | Note |');
    lines.push('| ---: | --- | --- |');
    for (const note of notes) {
      lines.push(`| ${note.line} | ${escapeMd(note.postName)} | ${escapeMd(note.warnings.join('; '))} |`);
    }
    lines.push('');
  }

  if (!drops.length && !carriedOver.length && !notes.length) {
    lines.push('Nothing repeated: no candidate matched a published posting, another row in this run, or an earlier run.');
    lines.push('');
  }

  return lines.join('\n');
}

function reportMarkdown({ date, discovery, rows, preview, skippedPublished, warnings, state, drops, carriedOver }) {
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
  const duplicates = duplicateSection({
    drops: drops || [],
    carriedOver: carriedOver || [],
    notes: preview.notes || [],
  });
  return `# Pipeline report — ${date}\n\nThis file is a review aid. It never publishes jobs; import the accompanying CSV through the existing admin screen and approve each valid row.\n\n## Source health\n\n| Source | Status | Links seen | Candidates | Detail |\n| --- | --- | ---: | ---: | --- |\n${sourceLines}\n\n## Output\n\n- Current review-queue rows written: ${rows.length}\n- Rows left out as duplicates: ${(drops || []).length} (${skippedPublished} already published)\n- Importer-valid rows: ${preview.valid}/${preview.total}\n- Rows needing manual completion: ${preview.invalid}\n- Consecutive zero-candidate runs: ${state.zeroCandidateDays}\n${warnings.map(w => `- Warning: ${w}`).join('\n')}\n\n${duplicates}\n## Verification queue\n\n| Post | Status | Official link found | Aggregator page | Official notification/apply link |\n| --- | --- | --- | --- | --- |\n${verificationRows}\n\n## Importer validation\n\n| CSV line | Post | Why it will be skipped |\n| ---: | --- | --- |\n${issues}\n\n## Fields deliberately left blank\n\n${fieldNotes}\n`;
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

  const { urls: publishedUrls, keys: publishedKeys, warning } = await publishedJobIdentity();
  const rows = []; const drops = []; const carriedOver = [];
  let skippedPublished = 0; const warnings = warning ? [warning] : [];
  const today = isoToday();
  const duplicates = createDuplicateFilter({ publishedUrls, publishedKeys });

  /**
   * Writes what happened to this candidate back into seen.json.
   *
   * `emitCount` and `firstEmittedOn` are the reason the cached branch now comes
   * through here too. It used to write no state at all, so a candidate that was
   * unchanged since yesterday left no trace of having been offered before and
   * was simply re-emitted, run after run, with nothing recording that it had
   * been. Those counters are what the report's "offered again" table reads.
   */
  function remember(link, { hash, extracted, emitted }) {
    const prior = state.candidates[link.url] || {};
    state.candidates[link.url] = {
      ...prior,
      hash, status: 'processed', extractorVersion: EXTRACTOR_VERSION,
      seenAt: new Date().toISOString(), source: link.source.id,
      row: extracted.row, fields: extracted.fields, metadata: extracted.metadata || {},
      ...(emitted
        ? {
          firstEmittedOn: prior.firstEmittedOn || today,
          lastEmittedOn: today,
          emitCount: (prior.emitCount || 0) + 1,
        }
        : {}),
    };
  }

  /**
   * The single place a candidate becomes a CSV row, or does not.
   *
   * Both branches below -- the one that re-uses yesterday's extraction and the
   * one that extracts afresh -- end here. They used to each carry their own
   * copy of the published check, which is how one of them came to be a no-op
   * without the other noticing.
   */
  function finish(link, hash, extracted, prior) {
    const row = extracted.row;
    const name = row.postName || link.text || link.url;
    const drop = duplicates.reasonToDrop(row);
    if (drop) {
      drops.push({ postName: name, url: link.url, ...drop });
      if (drop.published) skippedPublished += 1;
      remember(link, { hash, extracted, emitted: false });
      return;
    }
    duplicates.remember(row, name);
    // Read before remember() advances it.
    if (prior?.firstEmittedOn && prior.firstEmittedOn !== today) {
      carriedOver.push({
        postName: name,
        firstEmittedOn: prior.firstEmittedOn,
        emitCount: (prior.emitCount || 0) + 1,
      });
    }
    rows.push({ extracted });
    remember(link, { hash, extracted, emitted: true });
  }
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
        finish(link, downloaded.hash, cachedExtracted, prior);
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
      finish(link, downloaded.hash, extracted, prior);
    } catch (error) { warnings.push(`${link.source.name}: ${link.url} — ${error.message}`); }
  }

  const candidateCount = discovery.candidates.length;
  state.zeroCandidateDays = candidateCount === 0 ? (state.zeroCandidateDays || 0) + 1 : 0;
  if (candidateCount > 0 && rows.length === 0 && drops.length === 0) {
    warnings.push('Candidates were discovered, but no review row was written. Inspect the report warnings and source health.');
  }
  if (state.zeroCandidateDays >= 7) warnings.push('No candidates have been found for seven consecutive runs; inspect the source pages and keyword filters.');
  state.updatedAt = new Date().toISOString();

  // `today`, not a second isoToday(): a run that starts before midnight and
  // finishes after it would otherwise name the CSV for one day and record the
  // state under another, and the "offered again" counts would never line up.
  const csv = toCsv(rows.map(r => r.extracted.row)); const preview = previewValidation(csv); const date = today;

  // The importer applies the same duplicate rule to the finished file. If it
  // finds a repeat in there, the drop above did not do its job -- say so,
  // rather than shipping a CSV whose own validator disagrees with the report
  // sitting next to it.
  const missed = preview.problems.filter(p => p.errors.some(e => /same posting as line/.test(e)));
  if (missed.length) {
    warnings.push(
      `${missed.length} row(s) in the finished CSV are duplicates of each other, which means the pipeline's `
      + `own duplicate check did not catch them. CSV lines: ${missed.map(p => p.line).join(', ')}.`
    );
  }

  const report = reportMarkdown({ date, discovery, rows, preview, skippedPublished, warnings, state, drops, carriedOver });
  // All writes happen only after every fetch/extraction has settled. The state
  // write is last, so an interrupted run cannot mark unseen work as completed.
  await mkdir(OUT_DIR, { recursive: true });
  await writeTextAtomic(path.join(OUT_DIR, `jobs-${date}.csv`), csv);
  await writeTextAtomic(path.join(OUT_DIR, `jobs-${date}.report.md`), report);
  await writeJsonAtomic(STATE_PATH, state);
  return { date, discovery, rows, preview, warnings, skippedPublished, drops, carriedOver };
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
    if (outcome.drops.length) {
      console.log(`Left out ${outcome.drops.length} duplicate row(s): ${outcome.skippedPublished} already published, ${outcome.drops.length - outcome.skippedPublished} repeated within this run. See the Duplicates section of the report.`);
    }
    if (outcome.carriedOver.length) {
      console.log(`${outcome.carriedOver.length} row(s) were also in an earlier CSV and are still not published.`);
    }
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
