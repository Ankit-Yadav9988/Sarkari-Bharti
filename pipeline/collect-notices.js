/**
 * DISCOVER -> CLASSIFY -> VALIDATE for results and admit cards.
 *
 * Produces `out/notices-YYYY-MM-DD.csv` for the existing
 * `/admin/import-notices` screen, plus a report saying what it found, what it
 * refused, and why. It never writes to the database.
 *
 * <b>What it does not do, and why.</b> The job collector downloads every
 * candidate document and reads fields out of it, because a vacancy row needs
 * twenty fields that only the PDF contains. A notice row needs five, and all
 * five are on the listing page: the type is in the link text, the title *is* the
 * link text, the organisation comes from the source, the date is in the row, and
 * the link is the link. So this collector fetches the source pages and stops
 * there.
 *
 * The cost of that choice is worth stating plainly: a link that 404s will not be
 * caught here. It reaches the import screen, where it is shown with its URL next
 * to it, and the admin is the check. The alternative was downloading every
 * result PDF published in India, every run, to learn nothing that changes any
 * column in the file.
 *
 * <b>Separate state, separate cache.</b> `state/notices.json` and
 * `cache-notices/`, not the job run's. Two workflows on two schedules both
 * committing `state/seen.json` would conflict on every overlap, and the failure
 * would look like a pipeline bug rather than two jobs writing one file.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { noticeKey } from './lib/columns.js';
import {
  buildNoticeRow, classifyNotice, createNoticeDuplicateFilter, previewNoticeValidation, toNoticeCsv,
} from './lib/notices.js';
import { createPoliteClient } from './lib/http.js';
import { SOURCES } from './lib/sources.js';
import { discover, isNoticeCandidate } from './discover.js';
import { classifySource, recordSourceOutcomes, sourceHealth } from './run.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(HERE, 'state', 'notices.json');
const CACHE_DIR = path.join(HERE, 'cache-notices');
const OUT_DIR = path.join(HERE, 'out');

/**
 * The type assumed for a row that does not name one.
 *
 * This collector always writes the `type` column, so the default is never
 * actually reached -- it is passed to `previewNoticeValidation` only so the
 * preview and the admin screen apply the same rule to the same file. The screen
 * defaults to RESULT.
 */
export const DEFAULT_TYPE = 'RESULT';

const escapeMd = value => String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

async function readState(statePath = STATE_PATH) {
  try { return JSON.parse(await readFile(statePath, 'utf8')); }
  catch { return { version: 1, requests: {}, notices: {}, sources: {}, zeroCandidateDays: 0 }; }
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

/**
 * Every notice already on the site, in both forms a candidate can match.
 *
 * Links and `noticeKey`s, for the reason set out in
 * `createNoticeDuplicateFilter`: the same result arrives by two URLs as often as
 * two headings point at one PDF.
 *
 * With no API URL configured this returns two empty sets and a warning rather
 * than refusing to run. A CSV that may repeat what is published, with a line
 * saying so, is more use than no CSV -- and the importer's own duplicate check
 * is still in front of the database.
 *
 * `/notices` is public and unpaged filters are optional, so this needs no admin
 * token. That matters: this runs in GitHub Actions, which has the API base and
 * no JWT.
 */
export async function publishedNoticeIdentity(fetchImpl = fetch) {
  const base = process.env.SARKARI_API_URL?.replace(/\/$/, '');
  if (!base) {
    return {
      links: new Set(), keys: new Set(),
      warning: 'SARKARI_API_URL is unset; live-site duplicate filtering was skipped, so this CSV may repeat notices that are already published.',
    };
  }
  const links = new Set(); const keys = new Set(); let page = 0;
  for (;;) {
    const response = await fetchImpl(`${base}/notices?page=${page}&size=100`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Could not check published notices: HTTP ${response.status}`);
    const data = await response.json();
    const notices = Array.isArray(data) ? data : data.content || [];
    for (const notice of notices) {
      if (notice.link) links.add(notice.link);
      if (notice.title) keys.add(noticeKey(notice.type, notice.title));
    }
    if (Array.isArray(data) || data.last || page + 1 >= (data.totalPages || 1)) break;
    page += 1;
  }
  return { links, keys, warning: null };
}

/**
 * The report. Its job is to make an unattended run reviewable in two minutes.
 *
 * The section that earns its place is "Looked at and left out". A collector that
 * silently discards nine tenths of a notice board is indistinguishable from one
 * that is broken, and the only way to tell is to see the rejected links with the
 * rule that rejected each. That is also where an over-eager `DISQUALIFY` entry
 * shows up -- as a real result sitting in the table with "mentions
 * 'corrigendum'" next to it.
 */
export function noticeReportMarkdown({
  date, discovery, rows, preview, skippedPublished, warnings, state, drops, carriedOver, health, rejected,
  rejectedOmitted = 0,
}) {
  const sourceLines = discovery.reports.map(r => {
    const verdict = classifySource(r, state.sources || {});
    const since = {
      OK: '',
      KNOWN_BLOCKED: `known block, ${verdict.consecutiveFailures} runs${verdict.firstFailedOn ? ` since ${verdict.firstFailedOn}` : ''}`,
      NEWLY_FAILING: verdict.lastOkOn ? `**new** — last worked ${verdict.lastOkOn}` : '**new** — has never answered',
    }[verdict.state];
    return `| ${r.source.name} | ${r.ok ? 'OK' : 'FAILED'} | ${since} | ${r.linksSeen} | ${r.candidates.length} | ${escapeMd(r.error || '')} |`;
  }).join('\n');

  const healthVerdict = health
    ? [
      `- Run verdict: ${health.ok ? 'sources healthy enough to trust' : '**unhealthy — this run is marked failed**'}`,
      ...health.reasons.map(r => `- Why it is red: ${escapeMd(r)}`),
      ...health.notes.map(n => `- Standing condition: ${escapeMd(n)}`),
    ].join('\n')
    : '- Run verdict: not evaluated.';

  const counts = rows.reduce((acc, r) => ({ ...acc, [r.row.type]: (acc[r.row.type] || 0) + 1 }), {});
  const collected = rows.length
    ? rows.map(r => `| ${escapeMd(r.row.type)} | ${escapeMd(r.row.title)} | ${escapeMd(r.row.organization || '—')} | ${escapeMd(r.row.releaseDate || '—')} | ${escapeMd(r.link.source.name)} | ${escapeMd(r.link.url)} |`).join('\n')
    : '| — | Nothing collected | — | — | — | — |';

  const whyLines = rows.length
    ? rows.map(r => `- **${escapeMd(r.row.title)}** — ${escapeMd(r.notes.join('; '))}`).join('\n')
    : '- None.';

  const rejectedLines = rejected.length
    ? rejected.slice(0, 200).map(r => `| ${escapeMd(r.source)} | ${escapeMd(r.text || '(no link text)')} | ${escapeMd(r.reason)} | ${escapeMd(r.url)} |`).join('\n')
    : '| — | — | Nothing was rejected | — |';

  const dropLines = drops.length
    ? drops.map(d => `| ${escapeMd(d.type)} | ${escapeMd(d.title)} | ${escapeMd(d.reason)} | ${escapeMd(d.url)} |`).join('\n')
    : '| — | — | Nothing repeated | — |';

  const carriedLines = carriedOver.length
    ? carriedOver.map(c => `| ${escapeMd(c.title)} | ${escapeMd(c.firstEmittedOn)} | ${c.emitCount} |`).join('\n')
    : '| — | — | — |';

  const issues = preview.problems.length
    ? preview.problems.map(p => `| ${p.line} | ${escapeMd(p.title)} | ${escapeMd(p.errors.join('; '))} |`).join('\n')
    : '| — | — | None |';

  return `# Notice report — ${date}

Results and admit cards only. Answer keys are not collected: a provisional, a
revised and a final answer key share one title and the objection window closes in
days, so those are posted by hand.

This file is a review aid. It never publishes anything; import the accompanying
CSV through /admin/import-notices and approve each row.

## Source health

${healthVerdict}

| Source | Status | Since | Links seen | Candidates | Detail |
| --- | --- | --- | ---: | ---: | --- |
${sourceLines}

## Output

- Rows written: ${rows.length} (results: ${counts.RESULT || 0}, admit cards: ${counts.ADMIT_CARD || 0})
- Left out as duplicates: ${drops.length} (${skippedPublished} already published)
- Offered again from an earlier run: ${carriedOver.length}
- Importer-valid rows: ${preview.valid}/${preview.total}
- Rows needing manual completion: ${preview.invalid}
- Links looked at and left out: ${rejected.length}
- Consecutive zero-candidate runs: ${state.zeroCandidateDays}
${warnings.map(w => `- Warning: ${escapeMd(w)}`).join('\n')}

Two columns are always blank, by decision rather than omission. **jobId** is left
for the import screen, which resolves it against the live job list and refuses
ambiguous names — attaching this year's result to last year's posting is not
visible once done. **note** renders on the public page, so provenance belongs
here in the report and not there.

## Collected

| Type | Title | Organisation | Released | Source | Link |
| --- | --- | --- | --- | --- | --- |
${collected}

## How each row was decided

${whyLines}

## Looked at and left out

Links on the notice boards that were not collected, with the rule that rejected
each. A real result appearing in this table means a rule is too broad. Menu
items like "About us" appear here too, reading "no result or admit-card
wording" — that is expected, not a fault: the filter reads link text and has no
separate idea of what a menu is. What is worth scanning for is a row whose text
plainly announces a result or an admit card.

| Source | Link text | Why it was left out | URL |
| --- | --- | --- | --- |
${rejectedLines}
${rejectedOmitted ? `\n${rejectedOmitted} further rejected link(s) are not listed; each source records at most 60.\n` : ''}

## Duplicates

| Type | Title | Why it was left out | URL |
| --- | --- | --- | --- |
${dropLines}

### Offered again from an earlier run

These are in today's CSV. They were in an earlier one too and are still not on
the site. A climbing count means the row keeps being passed over.

| Title | First offered | Times offered |
| --- | --- | ---: |
${carriedLines}

## Importer validation

| CSV line | Title | Why it will be skipped |
| ---: | --- | --- |
${issues}
`;
}

export async function runNoticeCollection({
  sources = SOURCES, now = new Date(), state: suppliedState, client: suppliedClient,
  cacheDir = CACHE_DIR, published,
  // Output locations are parameters so the check harness can run a whole
  // collection against fake pages without writing into the repository. A test
  // that had to be trusted not to clobber `state/notices.json` is a test nobody
  // runs, and an untested runner is how the "left out" table came to be wired
  // to nothing.
  outDir = OUT_DIR, statePath = STATE_PATH,
} = {}) {
  const state = suppliedState || await readState(statePath);
  state.requests ||= {}; state.notices ||= {}; state.sources ||= {};
  const client = suppliedClient || createPoliteClient({ state });

  const discovery = await discover({ sources, state, client, cacheDir, filter: isNoticeCandidate });
  for (const report of discovery.reports.filter(r => !r.ok)) {
    console.warn(`SOURCE FAILED — ${report.source.name}: ${report.error}`);
  }
  if (discovery.reports.every(r => !r.ok)) {
    const reasons = discovery.reports.map(r => `${r.source.name}: ${r.error}`).join(' | ');
    throw new Error(`Every source failed; refusing to produce an empty, misleading run. ${reasons}`);
  }

  const today = now.toISOString().slice(0, 10);
  // Recorded before anything else that can throw, exactly as in run.js: the
  // per-source failure history is what makes today's failures news or routine,
  // and it is worth keeping even if the rest of the run goes wrong.
  recordSourceOutcomes(discovery.reports, state, today);

  const { links: publishedLinks, keys: publishedKeys, warning } = published || await publishedNoticeIdentity();
  const warnings = warning ? [warning] : [];
  const duplicates = createNoticeDuplicateFilter({ publishedLinks, publishedKeys });

  /* Links that never became candidates at all. `discover` hands these back with
     navigation chrome already stripped; the reason is obtained by asking
     `classifyNotice` again, which is the very call the filter made -- so this
     column cannot drift away from the decision it is reporting, because it *is*
     the decision. Without this the table only ever showed rows that failed after
     being classified, which is a small minority: on a real notice board the
     interesting rejections -- answer keys, vacancies, "Click here" -- are all
     turned down earlier, and were invisible.  */
  /* `report.rejected` is read without a fallback on purpose. `discover` sets it
     on both the success and the failure path, so a missing field means that
     contract has been broken and the run should stop here and say so, rather
     than quietly producing a report with an empty table -- which is precisely
     the failure this whole section exists to make visible. */
  const rejected = discovery.reports.flatMap(report => report.rejected.map(link => ({
    source: report.source.name,
    text: link.text,
    url: link.url,
    reason: classifyNotice({ text: link.text, context: link.context, url: link.url }).reason,
  })));
  const rejectedOmitted = discovery.reports
    .reduce((total, r) => total + Math.max(0, r.rejectedTotal - r.rejected.length), 0);

  const rows = []; const drops = []; const carriedOver = [];
  let skippedPublished = 0;

  for (const link of discovery.candidates) {
    const built = buildNoticeRow({ link, source: link.source, now, sources });
    if (built.skipped) {
      rejected.push({ source: link.source.name, text: link.text, url: link.url, reason: built.reason });
      continue;
    }
    const drop = duplicates.reasonToDrop(built.row);
    if (drop) {
      drops.push({ type: built.row.type, title: built.row.title, url: link.url, ...drop });
      if (drop.published) skippedPublished += 1;
      continue;
    }
    duplicates.remember(built.row);

    const prior = state.notices[link.url] || {};
    // Read before the state below advances it.
    if (prior.firstEmittedOn && prior.firstEmittedOn !== today) {
      carriedOver.push({ title: built.row.title, firstEmittedOn: prior.firstEmittedOn, emitCount: (prior.emitCount || 0) + 1 });
    }
    state.notices[link.url] = {
      ...prior,
      type: built.row.type,
      title: built.row.title,
      source: link.source.id,
      seenAt: new Date().toISOString(),
      firstEmittedOn: prior.firstEmittedOn || today,
      lastEmittedOn: today,
      emitCount: (prior.emitCount || 0) + 1,
    };
    rows.push({ row: built.row, notes: built.notes, link });
  }

  // This warning is measured against candidates, not against the whole "left
  // out" table: that table now also lists links the filter turned down before
  // they were ever candidates, and a board full of vacancies and answer keys
  // being passed over is the normal, correct outcome rather than a symptom.
  const candidateCount = discovery.candidates.length;
  state.zeroCandidateDays = candidateCount === 0 ? (state.zeroCandidateDays || 0) + 1 : 0;
  if (candidateCount > 0 && rows.length === 0 && drops.length === 0) {
    warnings.push('Candidates were discovered, but every one of them was left out. Read the "Looked at and left out" table — a rule is probably too broad.');
  }
  if (state.zeroCandidateDays >= 7) {
    warnings.push('No result or admit-card candidates have been found for seven consecutive runs; inspect the source pages and the classifier.');
  }
  state.updatedAt = new Date().toISOString();

  const csv = toNoticeCsv(rows.map(r => r.row));
  const preview = previewNoticeValidation(csv, { defaultType: DEFAULT_TYPE });

  // The importer applies the same duplicate rule to the finished file. If it
  // finds a repeat in there, the filter above did not do its job -- say so,
  // rather than shipping a CSV whose own validator disagrees with the report
  // next to it.
  const missed = preview.problems.filter(p => p.errors.some(e => /already has this title and type/.test(e)));
  if (missed.length) {
    warnings.push(
      `${missed.length} row(s) in the finished CSV are duplicates of each other, which means this collector's own `
      + `duplicate check did not catch them. CSV lines: ${missed.map(p => p.line).join(', ')}.`
    );
  }

  const health = sourceHealth(discovery.reports, candidateCount, state.sources);
  const date = today;
  const report = noticeReportMarkdown({
    date, discovery, rows, preview, skippedPublished, warnings, state, drops, carriedOver, health, rejected,
    rejectedOmitted,
  });

  // No mkdir here: writeTextAtomic creates its destination's directory itself.
  await writeTextAtomic(path.join(outDir, `notices-${date}.csv`), csv);
  await writeTextAtomic(path.join(outDir, `notices-${date}.report.md`), report);
  await writeJsonAtomic(statePath, state);

  return {
    date, discovery, rows, preview, warnings, skippedPublished, drops, carriedOver, rejected, rejectedOmitted,
    health, state, csv, report,
  };
}

async function main() {
  try {
    const outcome = await runNoticeCollection();
    const results = outcome.rows.filter(r => r.row.type === 'RESULT').length;
    const admitCards = outcome.rows.length - results;
    console.log(`Wrote ${outcome.rows.length} notice row(s): ${results} result(s), ${admitCards} admit card(s); ${outcome.preview.valid} importer-valid, ${outcome.preview.invalid} need review.`);
    console.log(`Looked at and left out ${outcome.rejected.length} link(s); see the report.`);
    if (outcome.drops.length) {
      console.log(`Left out ${outcome.drops.length} duplicate row(s): ${outcome.skippedPublished} already published, ${outcome.drops.length - outcome.skippedPublished} repeated within this run.`);
    }
    if (outcome.carriedOver.length) {
      console.log(`${outcome.carriedOver.length} row(s) were also in an earlier CSV and are still not published.`);
    }
    for (const warning of outcome.warnings) console.warn(`WARNING: ${warning}`);
    if (outcome.discovery.reports.some(r => !r.ok)) console.warn('WARNING: one or more sources failed; see the report source-health table.');

    for (const note of outcome.health.notes) console.warn(`NOTE: ${note}`);
    if (!outcome.health.ok) {
      for (const reason of outcome.health.reasons) console.error(`UNHEALTHY: ${reason}`);
      console.error('The CSV and report above were still written and are still worth reading. This run is marked failed so it is not mistaken for a normal day.');
      process.exitCode = 1;
    }
  } catch (error) { console.error(`Notice collection failed: ${error.message}`); process.exitCode = 1; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
