import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { parseIndianDate, dateNearLabel, datesInText, extractApplicationDates } from './lib/dates.js';
import { decodeEntities, linksFromHtml } from './lib/html.js';
import { createPoliteClient, fetchCached, robotsAllows } from './lib/http.js';
import { extractJob } from './lib/extract.js';
import { canonicalUrl, inspectSource, linksFromJson, isCandidate, isNoticeCandidate, looksLikeChrome } from './discover.js';
import { header, toCsv, previewValidation } from './lib/csv-out.js';
import { createDuplicateFilter, duplicateSection, hasPostName, isoDate, rowKey, sourceHealth, recordSourceOutcomes, classifySource, KNOWN_BLOCKED_AFTER } from './run.js';
import {
  buildNoticeRow, classifyNotice, cleanNoticeTitle, collapseTruncatedTitles, createNoticeDuplicateFilter,
  inferOrigin, isOwnBrandText, isSectionPage, isShouting, namesSomething, noticeRowToLine, noticeTitle,
  previewNoticeValidation, releaseDateFrom, toNoticeCsv, toTitleCase,
} from './lib/notices.js';
import { noticeKey, mapNoticeRows, parseCsv } from './lib/columns.js';
import { noticeReportMarkdown, publishedNoticeIdentity, runNoticeCollection } from './collect-notices.js';

let checks = 0;
/* Every failure is collected and reported at the end rather than aborting on the
   first one. With a bare assert, one broken assertion hides every assertion
   after it, so a single mistake looks like a single mistake even when it broke
   nine things -- and there is no way to tell whether the other 120 checks still
   hold. Failures that make later code crash outright will still stop the run;
   that much is unavoidable. Nothing here is softened: any failure at all still
   exits non-zero. */
const failures = [];
function record(fn, message) {
  checks += 1;
  try { fn(); } catch (error) { failures.push(`${message}\n      ${error.message.split('\n')[0]}`); }
}
function check(value, message) { record(() => assert.ok(value, message), message); }
function equal(actual, expected, message) { record(() => assert.equal(actual, expected, message), message); }
function throws(fn, pattern, message) { record(() => assert.throws(fn, pattern, message), message); }
function notEqual(actual, expected, message) { record(() => assert.notEqual(actual, expected, message), message); }
async function rejects(fn, pattern, message) {
  checks += 1;
  try { await assert.rejects(fn, pattern, message); }
  catch (error) { failures.push(`${message}\n      ${error.message.split('\n')[0]}`); }
}
/* http.js names its cache files by the sha256 of the URL. Recomputing it here
   rather than exporting keyFor keeps the assertions honest: if the naming
   scheme changes, these checks go red instead of quietly following along. */
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

equal(parseIndianDate('14/10/2026'), '2026-10-14', 'numeric dates are day-first');
equal(parseIndianDate('14 October 2026'), '2026-10-14', 'written day-first date parses');
equal(parseIndianDate('October 14, 2026'), '2026-10-14', 'written month-first date parses');
equal(parseIndianDate('2026-02-31'), null, 'impossible date is rejected');
equal(dateNearLabel('Exam date: 14 October 2026. Last date: 31 October 2026', ['last date'], { now: new Date('2026-01-01') }).value, '2026-10-31', 'label chooses the right date');
equal(extractApplicationDates('Online application starts: 1 October 2026. Closing date: 31 October 2026', { now: new Date('2026-01-01') }).lastDate.value, '2026-10-31', 'closing date is detected');
equal(extractApplicationDates('Application Begin: 5 August 2026. Last Date for Apply Online: 29 September 2026', { now: new Date('2026-01-01') }).applicationStartDate.value, '2026-08-05', 'aggregator application-begin date is detected');
equal(extractApplicationDates('Online Apply Start Date: 5 August 2026. Online Apply Last Date: 29 September 2026', { now: new Date('2026-01-01') }).applicationStartDate.value, '2026-08-05', 'aggregator online-apply start date is detected');
equal(extractApplicationDates('Online Apply Start Date: 5 August 2026. Online Apply Last Date: 29 September 2026', { now: new Date('2026-01-01') }).lastDate.value, '2026-09-29', 'aggregator online-apply last date is detected');

const anchors = linksFromHtml('<table><tr><td>Advt. No. 05/2026 for Physiotherapist - 2026</td><td><a href="notice.pdf"> Recruitment <b>Notice</b></a></td></tr></table><a href="mailto:x@y">mail</a>', 'https://example.gov.in/list');
equal(anchors.length, 1, 'non-web links are excluded');
equal(anchors[0].url, 'https://example.gov.in/notice.pdf', 'relative URL resolves');
check(anchors[0].context.includes('05/2026'), 'table row context is preserved for sparse link labels');
equal(canonicalUrl('https://SSC.GOV.IN/x.pdf?utm_source=x&keep=1#page=2'), 'https://ssc.gov.in/x.pdf?keep=1', 'tracking and fragments do not make new candidates');
equal(canonicalUrl('https://www.sarkariresult.com.cm/2026/job/'), 'https://sarkariresult.com.cm/2026/job/', 'Sarkari Result .com.cm links use the apex host');

const source = { id: 'test', name: 'Test', url: 'https://example.gov.in/notices', organization: 'Test', category: 'SSC', allowedHosts: ['example.gov.in'] };
const sourceHtml = '<a href="a.pdf">Recruitment notice</a><a href="b.pdf">Vacancy</a><a href="c">home</a><a href="d">about</a><a href="e">contact</a>';
equal(inspectSource({ source, html: sourceHtml }).candidates.length, 2, 'keywords select notices without selectors');
throws(() => inspectSource({ source, html: '<a href="a">one</a>' }), /minimum is 5/, 'link-count floor prevents silent success');
const jsonLinks = linksFromJson({ data: [
  { headline: 'Recruitment notice', redirectUrl: '/notice.pdf' },
  { title: 'Vacancy announcement', attachmentUrl: '/vacancy.pdf' },
  { headline: 'Recruitment attachment', attachments: [{ url: '/nested.pdf' }] },
  { title: 'A non-link item' }, { title: 'Ignored duplicate', fileUrl: '/notice.pdf' },
] }, 'https://example.gov.in/feed');
equal(jsonLinks.length, 3, 'official JSON feeds yield unique document links');
equal(inspectSource({ source, links: [...jsonLinks, { url: 'https://example.gov.in/a', text: 'a' }, { url: 'https://example.gov.in/b', text: 'b' }, { url: 'https://example.gov.in/c', text: 'c' }] }).candidates.length, 3, 'JSON links use the same keyword filter');
check(!isCandidate({ url: 'https://example.gov.in/x?ID=ter', text: 'Recruitment notice' }, source), 'placeholder IDs are ignored');
check(!isCandidate({ url: 'https://example.gov.in/x', text: "{{'Recruitment_HM' | translate }}" }, source), 'untranslated UI labels are ignored');
check(robotsAllows('User-agent: *\nDisallow: /admin\nAllow: /', '/jobs'), 'robots allows public path');
check(!robotsAllows('User-agent: *\nDisallow: /admin', '/admin/import'), 'robots blocks disallowed path');
const blockedRobotsClient = createPoliteClient({
  state: {}, delayMs: 0, fetchImpl: async url => new Response(url.endsWith('/robots.txt') ? 'blocked' : '<html>ok</html>', { status: url.endsWith('/robots.txt') ? 403 : 200 }),
  logger: { warn() {}, debug() {} },
});
equal((await blockedRobotsClient.get('https://sarkariresult.test/latestjob/')).response.status, 200, '4xx robots response does not block the public page');

const sample = 'ADVERTISEMENT NO. 10/2026 Recruitment for the post of Analyst. Total vacancies: 42. Online application starts: 01/10/2026. Last date: 31/10/2026.';
const extracted = extractJob({ source, link: { url: 'https://example.gov.in/notice.pdf', text: 'Analyst Recruitment 2026' }, body: sample, contentType: 'application/pdf', now: new Date('2026-01-01') });
equal(extracted.row.applicationStartDate, '2026-10-01', 'extracts labelled start date');
equal(extracted.row.lastDate, '2026-10-31', 'extracts labelled closing date');
equal(extracted.row.totalPosts, 42, 'extracts labelled total posts');
equal(extracted.row.notificationPdfUrl, 'https://example.gov.in/notice.pdf', 'PDF URL is preserved');
equal(extracted.row.state, null, 'central source leaves state blank');

const uppsc = extractJob({
  source: { ...source, id: 'uppsc', category: 'STATE_PSC', state: 'Uttar Pradesh' },
  link: { url: 'https://uppsc.up.nic.in/OuterPages/View_Advertisement.aspx?ID=560', text: 'View Advertisement', context: 'Direct Recruitment Advt. Number D-2/E-1/2026 14/09/2026 14/09/2026 14/10/2026' },
  body: 'Mode of Recruitment Examination Name Advt. Number Date Application Filling Start Date Application Filling Last Date Direct Direct Recruitment D-2/E-1/2026 14/09/2026 14/09/2026 14/10/2026',
  contentType: 'text/html', now: new Date('2026-09-20'),
});
equal(uppsc.row.advertisementNo, 'D-2/E-1/2026', 'UPPSC advertisement number is extracted');
equal(uppsc.row.applicationStartDate, '2026-09-14', 'UPPSC application start date is extracted');
equal(uppsc.row.lastDate, '2026-10-14', 'UPPSC application last date is extracted');
equal(uppsc.row.postName, 'Advertisement D-2/E-1/2026', 'generic table link gets a stable advertisement title');

const detailed = extractJob({
  source, link: { url: 'https://example.gov.in/detailed.pdf', text: 'Detailed Recruitment 2026' },
  body: 'Age Limit: 18 to 27 years. Educational Qualification: Bachelor degree in any discipline from a recognised university. Selection Process: Computer Based Test and Document Verification. Application Fee: General Rs 100, SC/ST Rs 0. Age Relaxation: OBC 3 years, SC/ST 5 years. Admit card will be available: 01 November 2026. Exam date: 15 November 2026. Result date: 20 December 2026. Apply online at https://example.gov.in/apply',
  contentType: 'application/pdf', now: new Date('2026-01-01'),
});
equal(detailed.row.ageMin, 18, 'extracts labelled minimum age');
equal(detailed.row.ageMax, 27, 'extracts labelled maximum age');
check(detailed.row.eligibility.includes('Bachelor degree'), 'extracts labelled qualification');
check(detailed.row.selectionProcess.includes('Computer Based Test'), 'extracts labelled selection process');
equal(detailed.row.feeGENERAL, 100, 'extracts labelled general fee');
equal(detailed.row.relaxOBC, 3, 'extracts labelled age relaxation');
equal(detailed.row.officialApplyLink, 'https://example.gov.in/apply', 'extracts labelled apply link');
equal(detailed.row.admitCardDate, '2026-11-01', 'extracts labelled admit-card date');
equal(detailed.row.examDate, '2026-11-15', 'extracts labelled exam date');
equal(detailed.row.resultDate, '2026-12-20', 'extracts labelled result date');
check(toCsv([detailed.row]).includes('100'), 'extracted fee fields match the flat CSV contract');

const htmlDetailed = extractJob({
  source, link: { url: 'https://example.gov.in/recruitment-details', text: 'Recruitment Analyst 2026' },
  body: '<html><body><h1>Recruitment Analyst</h1><a href="/files/analyst-notification.pdf">Download notification</a><a href="/apply/analyst">Apply online</a><a href="/files/analyst-syllabus.pdf">Syllabus</a><p>Last date: 31 October 2026</p></body></html>',
  contentType: 'text/html', now: new Date('2026-01-01'),
});
equal(htmlDetailed.row.notificationPdfUrl, 'https://example.gov.in/files/analyst-notification.pdf', 'HTML detail pages resolve linked notification PDFs');
equal(htmlDetailed.row.officialApplyLink, 'https://example.gov.in/apply/analyst', 'HTML detail pages preserve apply links');
equal(htmlDetailed.row.syllabusLink, 'https://example.gov.in/files/analyst-syllabus.pdf', 'HTML detail pages preserve syllabus links');
equal(htmlDetailed.row.listingSection, 'AUTO', 'rows use the importer default listing section');

const aggregatorSource = {
  id: 'sarkariresult', kind: 'aggregator', name: 'Sarkari Result discovery', organization: null,
  category: 'CENTRAL_GOVT', allowedHosts: ['sarkariresult.com'],
};
const aggregatorPage = '<h1>JSSC Jharkhand JILCCE Inter Level Recruitment 2026</h1>'
  + '<h2>Jharkhand Staff Selection Commission (JSSC)</h2>'
  + '<p>Application Begin: 05/08/2026 Last Date for Apply Online: 29/09/2026 Total : 326 Post</p>'
  + '<a href="https://apply.jssc.jharkhand.gov.in/form">Apply Online</a>'
  + '<a href="https://doc.sarkariresults.org.in/jssc.pdf">Download Notification</a>'
  + '<a href="https://jssc.jharkhand.gov.in/files/jilcce.pdf">Official Notification</a>';
const aggregator = extractJob({
  source: aggregatorSource,
  link: { url: 'https://www.sarkariresult.com/2026/jssc-jilcce/', text: 'JSSC Jharkhand JILCCE Inter Level Recruitment 2026' },
  body: aggregatorPage, contentType: 'text/html', now: new Date('2026-09-20'),
});
equal(aggregator.row.organization, 'Jharkhand Staff Selection Commission (JSSC)', 'aggregator headings identify the organisation');
equal(aggregator.row.category, 'STATE_PSC', 'aggregator category identifies a state PSC');
equal(aggregator.row.notificationPdfUrl, 'https://jssc.jharkhand.gov.in/files/jilcce.pdf', 'aggregator ignores its own document host');
equal(aggregator.row.officialApplyLink, 'https://apply.jssc.jharkhand.gov.in/form', 'aggregator preserves the external apply link');
equal(aggregator.metadata.verificationStatus, 'PENDING_MANUAL', 'aggregator rows require manual verification');

check(header().includes('lastDate'), 'CSV header comes from shared importer contract');
const quoted = toCsv([{ postName: 'Engineer, Civil', organization: 'Test', category: 'SSC', applicationStartDate: '2026-10-01', lastDate: '2026-10-31' }]);
const preview = previewValidation(quoted);
equal(preview.valid, 1, 'quoted row round-trips through the real importer');
const incomplete = previewValidation(toCsv([{ postName: 'Missing dates', organization: 'Test', category: 'SSC' }]));
/* This assertion used to read `incomplete.invalid === 1`, and it was wrong about
   what the pipeline should do -- it encoded the rule that cost Ankit his Upcoming
   rows. A notification is routinely published weeks before its form dates are
   announced, and extract.js writes listingSection=AUTO on every row, so the old
   "both dates required outside UPCOMING" rule rejected exactly the rows the
   pipeline exists to find. It now imports and is listed under Upcoming, because
   computeStatus and JobSpecifications.hasStatus both already read a null start
   date that way.

   The row must still be *reported*, or the change trades skipped rows for silent
   ones: it comes back under `notes` rather than `problems`, so the admin sees it
   in the run report without it being withheld from the file. */
equal(incomplete.invalid, 0, 'a notification with no dates yet is imported rather than skipped');
equal(incomplete.total, 1, 'the row is still in the file, not quietly dropped before the report');
equal(incomplete.valid, 1, 'and it is counted as a row the admin will actually get');
equal(incomplete.notes.length, 1, 'but it is still surfaced, as a note rather than a rejection');
check(incomplete.notes[0].warnings.some(w => /Upcoming/.test(w)),
  'and the note says where it will appear until the dates arrive');

/* The one date combination the pipeline must still refuse. A start date with no
   last date computes as ACTIVE and then never closes, which is the "everything
   says Active" complaint arriving by a different door. */
const openEnded = previewValidation(toCsv([
  { postName: 'No last date', organization: 'Test', category: 'SSC', applicationStartDate: '2026-10-01' },
]));
equal(openEnded.invalid, 1, 'a start date with no last date is still reported for human completion');
check(openEnded.problems[0].errors.some(e => /lastDate is missing/.test(e)),
  'and the reason names the missing column, in the importer\'s own wording');

/* Source health. The fixture shapes are the ones that actually occurred or
   that the gate exists to catch; `candidateCount` is passed separately because
   a run can discover plenty of links and still be untrustworthy.

   This block was rewritten when the gate was recalibrated, and two of its old
   assertions were wrong rather than merely outdated. They read "one source
   timing out stays a warning" and "losing only the aggregator leaves a healthy
   run" -- both asserted unconditionally, with no notion of history. That is the
   rule that produced eight red runs in a row: it could not tell a site that
   broke this morning from one that has been refusing GitHub's addresses for a
   fortnight, so it had to pick one answer for both. It picked "shout", and a
   thing that shouts every morning is furniture.

   The replacements below say the same thing where it is true -- a *known* block
   is not news -- and the opposite where it matters: the same single failure,
   with no history behind it, is exactly what the run should go red for. Nothing
   was relaxed to get here; rules 2 and 3 are still red unconditionally, and the
   2026-09-21 shape that prompted the gate in the first place is asserted red
   twice over. */
const report = (id, kind, ok) => ({ source: { id, kind, name: id.toUpperCase() }, ok, linksSeen: ok ? 20 : 0, candidates: [] });
const healthy = [report('ssc', 'official', true), report('upsc', 'official', true), report('sarkariresult', 'aggregator', true)];
/* Source history as the run would have recorded it. `runs` counts consecutive
   failures including today's; `lastOkOn` is null for a source that has never
   answered at all. */
const history = entries => Object.fromEntries(entries.map(([id, runs, lastOkOn = null, firstFailedOn = '2026-09-19']) =>
  [id, { consecutiveFailures: runs, lastOkOn, firstFailedOn: runs ? firstFailedOn : null }]));
const chronic = ['rrb', 'upsc', 'bpsc', 'rpsc', 'mppsc', 'ukpsc'];
const chronicHistory = history(chronic.map(id => [id, 9]));

check(sourceHealth(healthy, 40).ok, 'a run where every source answered is healthy');

/* The real 2026-09-27 shape, and the whole point of the change: the same six
   sources have failed on every run since 2026-09-19, the other three answered,
   and there is nothing here anyone needs to be told at 06:00. */
const settled = [
  ...chronic.map(id => report(id, 'official', false)),
  report('ssc', 'official', true), report('uppsc', 'official', true), report('sarkariresult', 'aggregator', true),
];
const settledHealth = sourceHealth(settled, 96, chronicHistory);
check(settledHealth.ok, 'six sources that have been blocked for weeks no longer fail the run');
check(settledHealth.notes.some(n => /known block/.test(n)), 'but the report still says they are down, and for how long');
check(settledHealth.notes.some(n => /Only 3 of 9/.test(n)), 'and that only a third of the configured sources are really reachable');
check(settledHealth.reasons.length === 0, 'and nothing at all is offered as a reason to go red');

/* The 2026-09-21 shape, which is why the gate exists. Same six, plus UPPSC --
   which had answered on the 19th and the 20th. The old rule caught this run
   only because seven of nine crossed a fraction; the new rule catches it for
   the right reason, and would still catch it if it were one source in fifty. */
const collapsed = [
  ...chronic.map(id => report(id, 'official', false)),
  report('uppsc', 'official', false), report('ssc', 'official', true), report('sarkariresult', 'aggregator', true),
];
const collapsedHealth = sourceHealth(collapsed, 100, { ...chronicHistory, ...history([['uppsc', 1, '2026-09-20']]) });
check(!collapsedHealth.ok, 'the run that prompted this gate is still reported unhealthy');
check(collapsedHealth.reasons.some(r => /UPPSC/.test(r)), 'and names the one source that actually changed');
check(collapsedHealth.reasons.some(r => /last worked 2026-09-20/.test(r)), 'and when it last worked, so there is somewhere to start');
check(!collapsedHealth.reasons.some(r => /RRB|MPPSC/.test(r)), 'without burying it among the six that fail every day');

/* The 2026-09-25 shape: the aggregator itself went down. It supplies about 94
   of every 100 candidates, so this is the single most consequential source to
   lose, and under the old rule it was invisible -- seven of nine had already
   been failing, so the count did not move. */
const aggregatorLost = [
  ...chronic.map(id => report(id, 'official', false)),
  report('ssc', 'official', true), report('uppsc', 'official', true), report('sarkariresult', 'aggregator', false),
];
const aggregatorLostHealth = sourceHealth(aggregatorLost, 5, { ...chronicHistory, ...history([['sarkariresult', 1, '2026-09-24']]) });
check(!aggregatorLostHealth.ok, 'losing the aggregator that supplies most candidates fails the run');
check(aggregatorLostHealth.reasons.some(r => /SARKARIRESULT/.test(r)), 'and says which source it was');

/* The boundary. Two runs of silence is still news; the third is a condition. */
const oneFailure = [report('ssc', 'official', true), report('upsc', 'official', false), report('sarkariresult', 'aggregator', true)];
for (const runs of [1, 2]) {
  check(!sourceHealth(oneFailure, 40, history([['upsc', runs, '2026-09-20']])).ok,
    `a source down for ${runs} run(s) still fails the run, because it might be today's problem`);
}
check(sourceHealth(oneFailure, 40, history([['upsc', KNOWN_BLOCKED_AFTER, '2026-09-20']])).ok,
  `by ${KNOWN_BLOCKED_AFTER} consecutive runs it is an established block and stops failing the run`);

/* A source with no record at all. Indistinguishable from a blocked one by
   looking at today, distinguishable by never having worked -- and a new source
   with a typo in its URL is precisely this shape. */
const unknownHealth = sourceHealth(oneFailure, 40);
check(!unknownHealth.ok, 'a source with no history that fails is reported, not assumed to be blocked');
check(unknownHealth.reasons.some(r => /never answered/.test(r)), 'and the reason distinguishes it from a site that used to work');

/* Recovery re-arms the alarm. A site that comes back and breaks again is news
   again -- otherwise a single good day would buy permanent silence.

   The history has to be seeded *before* the success for this to test anything.
   An earlier version of this block recorded the success against an empty state,
   so "a success clears the failure count" was clearing a count of zero and a
   mutation that removed the reset changed nothing. It passed for six runs of
   the mutation harness before being caught. */
const recovered = { sources: history([['upsc', 9]]) };
equal(classifySource(report('upsc', 'official', false), recovered.sources).state, 'KNOWN_BLOCKED',
  'a source down for nine runs starts out as an established block');
recordSourceOutcomes([report('upsc', 'official', true)], recovered, '2026-09-26');
equal(recovered.sources.upsc.consecutiveFailures, 0, 'a successful run clears the failure count');
equal(recovered.sources.upsc.lastOkOn, '2026-09-26', 'and records when it last worked');
equal(recovered.sources.upsc.firstFailedOn, null, 'and closes off the outage that had been running');
recordSourceOutcomes([report('upsc', 'official', false)], recovered, '2026-09-27');
equal(recovered.sources.upsc.consecutiveFailures, 1, 'and the next failure starts counting again from one');
equal(recovered.sources.upsc.lastOkOn, '2026-09-26', 'while the last good date is kept, which is what makes the reason useful');
equal(recovered.sources.upsc.firstFailedOn, '2026-09-27', 'and the current outage is dated from its own first day');
check(!sourceHealth([report('upsc', 'official', false), report('ssc', 'official', true), report('sarkariresult', 'aggregator', true)], 40, recovered.sources).ok,
  'so a source that recovers and breaks again turns the run red a second time');

/* Counting up over consecutive failures, and the one thing that must not be
   lost along the way: the date it first went down. */
const climbing = {};
for (const day of ['2026-09-25', '2026-09-26', '2026-09-27']) {
  recordSourceOutcomes([report('rrb', 'official', false)], climbing, day);
}
equal(climbing.sources.rrb.consecutiveFailures, 3, 'consecutive failures accumulate across runs');
equal(climbing.sources.rrb.firstFailedOn, '2026-09-25', 'and the first day of the outage is not overwritten by later ones');
equal(classifySource(report('rrb', 'official', false), climbing.sources).state, 'KNOWN_BLOCKED', 'which is what tips it into a known block');
equal(classifySource(report('rrb', 'official', true), climbing.sources).state, 'OK', 'and a source that answered is never classified as blocked');

/* Rules 2 and 3, deliberately untouched by the recalibration. However routine
   it becomes, a day when the only voice is a site that copies other people's
   notices is a day whose output cannot be checked against anybody -- so this
   one gets no known-blocked exemption, even after months. */
const aggregatorOnly = [report('ssc', 'official', false), report('upsc', 'official', false), report('sarkariresult', 'aggregator', true)];
const aggregatorHealth = sourceHealth(aggregatorOnly, 94, history([['ssc', 40], ['upsc', 40]]));
check(!aggregatorHealth.ok, 'an aggregator-only run is unhealthy even when every official source is a long-established block');
check(aggregatorHealth.reasons.some(r => /second-hand/.test(r)), 'and says why second-hand data alone is not enough');
check(!sourceHealth(healthy, 0).ok, 'finding nothing at all is unhealthy even when every source answered');
check(!sourceHealth(healthy, 0, chronicHistory).ok, 'and no amount of history makes an empty run acceptable');
check(!sourceHealth([], 0).ok, 'no configured sources is a failure, not a quiet success');
/* The aggregator failing while the official sources answer is the good case:
   it must not trip the official-sources rule, which would make the pipeline
   depend on the one source it trusts least. */
check(sourceHealth([report('ssc', 'official', true), report('upsc', 'official', true), report('sarkariresult', 'aggregator', false)], 30, history([['sarkariresult', 9]])).ok,
  'losing only the aggregator, and losing it routinely, leaves a healthy run');

/* Duplicate filtering. This is what the 20-24 September CSVs needed and did not
   have: 54 of the 24th's 64 rows were already in the 23rd's file. Each rule
   below is asserted with the negative control next to it, because every one of
   them can pass by doing nothing -- a filter that drops everything and a filter
   that drops nothing both produce a green "no duplicates" line. */

equal(isoDate('2026-07-20'), '2026-07-20', 'an ISO date passes through unchanged');
equal(isoDate('2026-07-20T00:00:00Z'), '2026-07-20', 'a full instant is reduced to its date');
equal(isoDate([2026, 7, 20]), '2026-07-20', 'Jackson array dates are normalised and zero-padded');
equal(isoDate(null), '', 'no date is the empty string, not the word null');
equal(isoDate('not a date'), '', 'unparseable input does not become a key that half-matches');

const jobRow = (postName, organization, lastDate, extra = {}) => ({ postName, organization, lastDate, ...extra });

equal(
  rowKey(jobRow('Combined Graduate Level Exam', 'SSC', '2026-07-20')),
  rowKey(jobRow('  combined-graduate_level   exam ', 'ssc', '2026-07-20')),
  'spacing, case, hyphens and underscores do not make a different posting',
);
notEqual(
  rowKey(jobRow('Combined Graduate Level Exam', 'SSC', '2026-07-20')),
  rowKey(jobRow('Combined Graduate Level Exam', 'SSC', '2025-07-20')),
  'the same exam in a different year is a different posting and must survive',
);
equal(
  rowKey(jobRow('Analyst', 'Test', '2026-07-20T00:00:00.000Z')),
  rowKey(jobRow('Analyst', 'Test', '2026-07-20')),
  'a LocalDate serialised with a time still matches the CSV date it came from',
);

check(hasPostName(jobRow('Analyst', 'Test', null)), 'a real post name is a post name');
check(!hasPostName(jobRow('', 'Test', null)), 'a blank post name is not');
check(!hasPostName(jobRow('  --  ', 'Test', null)), 'and neither is punctuation the key normaliser strips');

/* The defect this replaced: the published check only ever compared
   notificationPdfUrl, and extract.js blanks that field when the confidence gate
   cannot vouch for it, so the guard was a no-op for a large share of rows. */
const publishedFilter = createDuplicateFilter({
  publishedUrls: new Set(['https://ssc.gov.in/cgl.pdf']),
  publishedKeys: new Set([rowKey(jobRow('Combined Graduate Level Exam', 'SSC', '2026-07-20'))]),
});
check(
  publishedFilter.reasonToDrop(jobRow('Combined Graduate Level Exam', 'SSC', '2026-07-20'))?.published,
  'a published posting is dropped on its identity alone, with no PDF link to match on',
);
check(
  publishedFilter.reasonToDrop(jobRow('Anything', 'Anyone', '2030-01-01', { notificationPdfUrl: 'https://ssc.gov.in/cgl.pdf' }))?.published,
  'and the PDF link still works as a second way to recognise it',
);
equal(
  publishedFilter.reasonToDrop(jobRow('Combined Graduate Level Exam', 'SSC', '2027-07-20')),
  null,
  'next year\'s sitting of a published exam is not a duplicate of this year\'s',
);
equal(
  publishedFilter.reasonToDrop(jobRow('Stenographer Grade C', 'SSC', '2026-07-20')),
  null,
  'a genuinely new posting from the same body is not dropped',
);

/* Within one run. Two candidate URLs can be the same notification: the
   aggregator lists a vacancy and the issuing body publishes it too. */
const runFilter = createDuplicateFilter({});
const firstCopy = jobRow('Constable Recruitment', 'UP Police', '2026-11-30');
equal(runFilter.reasonToDrop(firstCopy), null, 'the first copy of a posting is kept');
runFilter.remember(firstCopy, 'Constable Recruitment');
const secondCopy = runFilter.reasonToDrop(jobRow('constable  recruitment', 'up police', '2026-11-30'));
check(secondCopy && !secondCopy.published, 'the second copy is dropped as a repeat within the run, not as published');
check(/earlier in this run/.test(secondCopy.reason), 'and the report says which run it repeated');
equal(
  runFilter.reasonToDrop(jobRow('Constable Recruitment', 'UP Police', '2027-11-30')),
  null,
  'a different last date is a different notification even inside one run',
);

/* Skeleton rows. A candidate whose PDF could not be read has no post name; two
   of those are two unread notifications, and dropping the second as a duplicate
   would hide exactly the rows that most need a human. Both halves of the filter
   have to refuse to key them, so both are checked: the published lookup here,
   and the within-run memory below. */
const namelessRow = jobRow('', 'Unknown', null);
const namelessPublished = createDuplicateFilter({ publishedKeys: new Set([rowKey(namelessRow)]) });
equal(
  namelessPublished.reasonToDrop(namelessRow),
  null,
  'a nameless row is never matched against published keys, however well its empty key collides',
);
const skeletonFilter = createDuplicateFilter({});
equal(skeletonFilter.reasonToDrop(namelessRow), null, 'a nameless row is not a duplicate of anything');
skeletonFilter.remember(namelessRow, 'https://a.gov.in/one.pdf');
equal(skeletonFilter.reasonToDrop(jobRow('', 'Unknown', null)), null, 'and a second nameless row still gets through');

/* The report. An empty section that claims there were no duplicates when there
   were would be worse than no section at all. */
const emptySection = duplicateSection({ drops: [], carriedOver: [], notes: [] });
check(/Nothing repeated/.test(emptySection), 'a clean run says so in plain words');
const fullSection = duplicateSection({
  drops: [
    { postName: 'CGL 2026', url: 'https://ssc.gov.in/cgl', published: true, reason: 'already on the site — same post name, organization and last date' },
    { postName: 'Constable', url: 'https://uppbpb.gov.in/c', published: false, reason: 'same posting as "Constable" earlier in this run' },
  ],
  carriedOver: [{ postName: 'Steno 2026', firstEmittedOn: '2026-09-21', emitCount: 4 }],
  notes: [{ line: 7, postName: 'CGL 2027', warnings: ['line 3 has the same post name and organization but a different last date'] }],
});
check(/Left out as already published: 1/.test(fullSection), 'the counts separate published from within-run');
check(/Left out as a repeat within this run: 1/.test(fullSection), 'and report the within-run drops on their own line');
check(/2026-09-21/.test(fullSection), 'a row offered again names the day it first appeared');
check(/\| 4 \|/.test(fullSection), 'and how many times it has been offered');
check(!/Nothing repeated/.test(fullSection), 'and a run with duplicates does not also claim to be clean');

/* mapRows is the other half: duplicates inside a single file, caught before the
   admin presses Publish. previewValidation runs the real importer over the real
   CSV writer, so this is the same code path the import screen uses. */
const sameFileTwice = previewValidation(toCsv([
  { postName: 'Analyst', organization: 'Test', category: 'SSC', applicationStartDate: '2026-10-01', lastDate: '2026-10-31' },
  { postName: 'analyst', organization: 'test', category: 'SSC', applicationStartDate: '2026-10-01', lastDate: '2026-10-31' },
]));
equal(sameFileTwice.valid, 1, 'the same posting twice in one file imports once');
check(sameFileTwice.problems.some(p => /same posting as line 2/.test(p.errors.join(' '))), 'and the skipped line points at the one that is keeping its place');
const sameNameNextYear = previewValidation(toCsv([
  { postName: 'Analyst', organization: 'Test', category: 'SSC', applicationStartDate: '2026-10-01', lastDate: '2026-10-31' },
  { postName: 'Analyst', organization: 'Test', category: 'SSC', applicationStartDate: '2027-10-01', lastDate: '2027-10-31' },
]));
equal(sameNameNextYear.valid, 2, 'next year\'s sitting of the same exam is imported, not skipped');
equal(sameNameNextYear.notes.length, 1, 'but it is flagged as worth a look in case the year is a typo');
check(/different last date/.test(sameNameNextYear.notes[0].warnings.join(' ')), 'and the note says what to check');

/* fetchCached and the 304 trap.
   ----------------------------------------------------------------------------
   The validators (etag/last-modified) are remembered in state/seen.json, which
   the workflow commits every run. The bodies live in pipeline/cache, which is
   gitignored and restored separately. So "I remember the etag" and "I have the
   body" drift apart as a matter of routine, and on 2026-09-27 that cost five
   notifications -- Bank of Baroda SO, two Bihar BTSC notices, Rajasthan Safai
   Karmchari and UP Anganwadi -- each to `Received 304 ... but its local cache is
   unavailable`. These assertions pin both halves of the fix: never claim to hold
   a body we do not hold, and never turn a 304 into a lost document. */
const cacheRoot = await mkdtemp(path.join(tmpdir(), 'sarkari-cache-'));
const DOC = 'https://example.gov.in/notice.pdf';

/* A server that honours conditional requests the way a correct server does:
   304 when a validator is presented, 200 with the body when it is not. It
   records every request so the assertions can check what was actually sent,
   not merely what came back. */
function conditionalServer({ body = 'notice body', etag = '"v1"', alwaysNotModified = false } = {}) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const headers = options.headers || {};
    const conditional = Boolean(headers['If-None-Match'] || headers['If-Modified-Since']);
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    requests.push({ url, conditional });
    if (conditional || alwaysNotModified) return new Response(null, { status: 304, headers: { etag } });
    return new Response(body, { status: 200, headers: { etag, 'content-type': 'application/pdf' } });
  };
  return {
    fetchImpl,
    documentRequests: () => requests,
    conditionalCount: () => requests.filter(r => r.conditional).length,
  };
}
const clientFor = (server, state) => createPoliteClient({
  state, delayMs: 0, logger: { warn() {}, debug() {} }, fetchImpl: server.fetchImpl,
});

/* Pass 1: nothing cached, nothing remembered. The plain case, and the baseline
   the later passes are compared against. */
const firstDir = path.join(cacheRoot, 'first');
const firstServer = conditionalServer();
const sharedState = {};
const firstFetch = await fetchCached(clientFor(firstServer, sharedState), DOC, firstDir);
equal(firstFetch.body.toString(), 'notice body', 'a document with no cache entry is fetched in full');
equal(firstFetch.unchanged, false, 'and is reported as new');
check(existsSync(path.join(firstDir, `${sha256(DOC)}.bin`)), 'and the body is written to the cache, which is what lets tomorrow ask conditionally');
check(sharedState.requests[DOC].etag === '"v1"', 'the validator is remembered for next time');

/* Pass 2: the cache and the remembered validator agree. This is the path the
   conditional request exists for, and it must keep working -- the fix must not
   buy safety by re-downloading every document every day. */
const secondServer = conditionalServer();
const secondFetch = await fetchCached(clientFor(secondServer, sharedState), DOC, firstDir);
equal(secondFetch.unchanged, true, 'an unchanged document is served from the cache');
equal(secondFetch.body.toString(), 'notice body', 'with the body it had before');
equal(secondFetch.hash, firstFetch.hash, 'and the same hash, so the run sees no spurious change');
equal(secondServer.conditionalCount(), 1, 'and the validator is sent, so the server only has to answer 304');

/* Pass 3: the exact GitHub Actions shape. seen.json was committed so the etag
   survived; pipeline/cache was not, so the body did not. Before the fix this
   threw and the notification was lost. */
const strandedDir = path.join(cacheRoot, 'stranded');
const strandedServer = conditionalServer();
const stranded = await fetchCached(clientFor(strandedServer, sharedState), DOC, strandedDir);
equal(stranded.body.toString(), 'notice body', 'a remembered validator with no cached body still yields the document');
equal(stranded.unchanged, false, 'reported as new, because as far as this run is concerned it is');
equal(strandedServer.conditionalCount(), 0, 'and no validator is sent, because the body it would vouch for is not there');
equal(strandedServer.documentRequests().length, 1, 'so one request is enough -- no wasted round trip to discover the obvious');
check(existsSync(path.join(strandedDir, `${sha256(DOC)}.bin`)), 'and the recovered body is written to the cache');

/* Pass 4: half a cache entry is not a cache entry. A body whose metadata is
   gone has no hash, and passing it off as cached would report an unchanged
   document with an empty hash -- a silent wrong answer rather than a loud one. */
const metalessDir = path.join(cacheRoot, 'metaless');
await mkdir(metalessDir, { recursive: true });
await writeFile(path.join(metalessDir, `${sha256(DOC)}.bin`), 'stale body');
const metalessServer = conditionalServer();
const metaless = await fetchCached(clientFor(metalessServer, sharedState), DOC, metalessDir);
equal(metaless.body.toString(), 'notice body', 'a cached body with no metadata is re-fetched rather than trusted');
equal(metalessServer.conditionalCount(), 0, 'without a validator, since the entry cannot be verified');

/* Pass 5: damaged metadata. An interrupted write leaves truncated JSON, and a
   parse error must degrade to "I do not have this", never take down the run. */
const corruptDir = path.join(cacheRoot, 'corrupt');
await mkdir(corruptDir, { recursive: true });
await writeFile(path.join(corruptDir, `${sha256(DOC)}.bin`), 'stale body');
await writeFile(path.join(corruptDir, `${sha256(DOC)}.json`), '{"url":"https://example');
const corruptServer = conditionalServer();
const corrupt = await fetchCached(clientFor(corruptServer, sharedState), DOC, corruptDir);
equal(corrupt.body.toString(), 'notice body', 'truncated cache metadata is treated as no cache at all');
equal(corruptServer.conditionalCount(), 0, 'and the request goes out unconditionally');

/* Pass 6: a server or proxy that answers 304 even to an unconditional request.
   That is a protocol violation, but it happens, and the second layer of the fix
   is what keeps it from being indistinguishable from the bug just fixed. One
   retry, then an error that says plainly the validator was not the problem. */
const stubbornDir = path.join(cacheRoot, 'stubborn');
const stubbornServer = conditionalServer({ alwaysNotModified: true });
await rejects(
  () => fetchCached(clientFor(stubbornServer, {}), DOC, stubbornDir),
  /even without a validator/,
  'a 304 with no validator and no cache fails with a reason that does not blame the cache',
);
equal(stubbornServer.documentRequests().length, 2, 'after exactly one unconditional retry, not an endless loop');

/* Pass 7: readOnly callers must not be able to poison the cache, because the
   report re-reads documents after the gate has already judged them. */
const readOnlyDir = path.join(cacheRoot, 'readonly');
const readOnlyResult = await fetchCached(clientFor(conditionalServer(), {}), DOC, readOnlyDir, { readOnly: true });
equal(readOnlyResult.body.toString(), 'notice body', 'a read-only fetch still returns the document');
check(!existsSync(readOnlyDir), 'and writes nothing, so it cannot change what a later run sees');

await rm(cacheRoot, { recursive: true, force: true });

/* ===========================================================================
   The result / admit-card collector.
   ===========================================================================
   Everything below is about `lib/notices.js` and the filter in `discover.js`.
   The through-line is that this collector publishes to a page where a row has
   one descriptive field -- its title -- and no second field to correct a wrong
   one. So almost every assertion here is about refusing rather than accepting:
   refusing a guess at the type, refusing an invented title, refusing a date that
   is not plainly the release date. A collector that returns nothing is a bad
   day; a collector that publishes an admit card as a result is a wrong answer
   that stays up. */

const ENTITY_FROM_REAL_CSV = 'Bank of Baroda SO Online Form 2026 (1100 Posts) &#8211; Date Extend';
equal(decodeEntities(ENTITY_FROM_REAL_CSV), 'Bank of Baroda SO Online Form 2026 (1100 Posts) – Date Extend',
  'the numeric en dash that appears in every committed CSV is decoded');
equal(decodeEntities('A &#x2013; B'), 'A – B', 'hex numeric entities decode too');
equal(decodeEntities('AT&amp;T &lt;b&gt;'), 'AT&T <b>', 'the named entities that already worked still work');
equal(decodeEntities('&ndash; dash'), '– dash', 'ndash is decoded by name as well as by number');
equal(decodeEntities('a &dagger; b'), 'a &dagger; b',
  'an entity we do not know is left visible, because a deleted character is a bug you cannot see');
equal(decodeEntities('half &frac12; measure'), 'half &frac12; measure',
  'an entity with a digit in its name is not even recognised as one, and is therefore left alone');
equal(decodeEntities('null&#0;byte'), 'null&#0;byte', 'a control-character entity is refused, so &#0; cannot reach a database column');
equal(decodeEntities('&#xd800;'), '&#xd800;', 'a lone surrogate is refused rather than throwing or producing a broken code point');

/* classifyNotice. The anchor text decides; context may only reject. */
equal(classifyNotice({ text: 'SSC CGL 2026 Final Result' }).type, 'RESULT', 'a result is recognised from its link text');
equal(classifyNotice({ text: 'Download Admit Card' }).type, 'ADMIT_CARD', 'so is an admit card');
equal(classifyNotice({ text: 'RRB NTPC Hall Ticket 2026' }).type, 'ADMIT_CARD', 'hall ticket is an admit card');
equal(classifyNotice({ text: 'BPSC 70th Merit List' }).type, 'RESULT', 'a merit list is a result');
equal(classifyNotice({ text: 'परिणाम देखें यहाँ' }).type, 'RESULT', 'Hindi result wording is recognised');
equal(classifyNotice({ text: 'Result and Admit Card 2026' }).type, null,
  'a link that says it is both is refused, because picking one publishes the wrong document');
check(/says both/.test(classifyNotice({ text: 'Result and Admit Card 2026' }).reason),
  'and the report says why a person has to look at it');
/* The DISQUALIFY family. Every case below contains real result or admit-card
   wording, so each one *would* be collected if the disqualifying word were not
   checked -- which is what makes them worth asserting. A case like "Exam City
   Intimation Slip", with no admit-card wording in it at all, would pass this
   test even with DISQUALIFY switched off entirely, and proves nothing. */
equal(classifyNotice({ text: 'SSC CGL 2026 Result cum Answer Key' }).type, null,
  'answer keys are refused even when the link also says "result": they are out of scope by decision');
check(/answer key/.test(classifyNotice({ text: 'SSC CGL 2026 Result cum Answer Key' }).reason),
  'and the reason names the answer key, so the refusal cannot be passing for some other cause');
equal(classifyNotice({ text: 'Corrigendum to Result Notice' }).type, null, 'a corrigendum about a result is not the result');
equal(classifyNotice({ text: 'Counselling Schedule after Result' }).type, null, 'a counselling schedule is not the result either');
equal(classifyNotice({ text: 'Download Admit Card / Exam City Status' }).type, null,
  'an exam-city notice is not an admit card, even when the board links the two together');
equal(classifyNotice({ text: 'Notice regarding Result declaration' }).type, null, 'a notice about a result is not a result');
equal(classifyNotice({ text: 'Postponement of Result Declaration' }).type, null, 'and a postponement notice is not one either');
equal(classifyNotice({ text: 'Bihar Police Online Form 2026' }).type, null, 'a vacancy is left to the job collector');
check(/vacancy/.test(classifyNotice({ text: 'SSC Stenographer Recruitment 2026' }).reason), 'and the reason names the other collector');
equal(classifyNotice({ text: 'Result', context: 'Download the provisional Answer Key and Result' }).type, null,
  'disqualifying wording in the surrounding row rejects the link, even though the anchor alone looked clean');
equal(classifyNotice({ text: 'Click Here', context: 'SSC CGL Tier-1 Result 2026 declared today' }).type, null,
  'a type signal found only in the surrounding row is not enough: on an aggregator every row mentions results');
equal(classifyNotice({ text: 'Click Here', url: 'https://ssc.gov.in/notices/result-2026.pdf' }).type, 'RESULT',
  'but the URL path may break a tie the anchor cannot');
check(/from the URL path/.test(classifyNotice({ text: 'Click Here', url: 'https://ssc.gov.in/notices/result-2026.pdf' }).reason),
  'and the report says the evidence was the path, not the text');
equal(classifyNotice({ text: '', url: '' }).type, null, 'a link with no text and no URL is refused rather than crashing');

/* The partition invariant. The two collectors must never both claim a link:
   whichever ran second would publish a duplicate of the other's row under the
   wrong type. This is checked on the aggregator, where the risk is real --
   its front page lists forms, results and admit cards in one column. */
const noticeAggregator = { id: 'sarkariresult', kind: 'aggregator', name: 'agg', allowedHosts: ['sarkariresult.com.cm'], url: 'https://sarkariresult.com.cm/' };
const partitionCases = [
  'SSC CGL Online Form 2026', 'UPSC NDA Result 2026', 'RRB Group D Admit Card 2026',
  'Bihar Police Vacancy 2026 Apply Online', 'IBPS PO Merit List', 'SBI Clerk Answer Key 2026',
  'Delhi Police Recruitment 2026 – Date Extend', 'UP Police Hall Ticket Download',
  // The case that actually tests the invariant rather than confirming it by
  // accident: a single link that carries both vocabularies. Every other row
  // above says one thing, so it would satisfy the invariant even if one of the
  // two filters were switched off entirely.
  'SSC CGL Online Form 2026 – Result Declared',
  'RRB Group D Apply Online and Admit Card',
];
for (const text of partitionCases) {
  const link = { url: `https://sarkariresult.com.cm/${encodeURIComponent(text)}/`, text };
  check(!(isCandidate(link, noticeAggregator) && isNoticeCandidate(link, noticeAggregator)),
    `"${text}" is claimed by at most one collector`);
}
check(isNoticeCandidate({ url: 'https://sarkariresult.com.cm/upsc-nda-result-2026/', text: 'UPSC NDA Result 2026' }, noticeAggregator),
  'and the notice collector does claim a plain result, so the invariant is not satisfied by collecting nothing');
check(isCandidate({ url: 'https://sarkariresult.com.cm/ssc-cgl-online-form-2026/', text: 'SSC CGL Online Form 2026' }, noticeAggregator),
  'while the job collector still claims a plain vacancy');
check(!isNoticeCandidate({ url: 'https://elsewhere.example/result/', text: 'Some Result 2026' }, noticeAggregator),
  'the shared chrome filter still applies: an off-host link is not a notice candidate');

/* And the filter has to actually reach the page-reading code. Without this,
   `discover` could ignore the `filter` argument entirely and every assertion
   above would still pass, because they all call isNoticeCandidate directly. */
const mixedPage = '<a href="/r.pdf">UPSC NDA Result 2026</a><a href="/f.pdf">SSC CGL Online Form 2026</a>'
  + '<a href="/a">home</a><a href="/b">about us</a><a href="/c">contact</a>';
const noticeInspect = inspectSource({ source: noticeAggregator, html: mixedPage, filter: isNoticeCandidate });
equal(noticeInspect.candidates.length, 1, 'inspectSource applies the filter it was given');
equal(noticeInspect.candidates[0].text, 'UPSC NDA Result 2026', 'and picks the notice out of a page that has both');
const jobInspect = inspectSource({ source: noticeAggregator, html: mixedPage });
equal(jobInspect.candidates.length, 1, 'with no filter it still uses the vacancy rule');
equal(jobInspect.candidates[0].text, 'SSC CGL Online Form 2026', 'and picks the vacancy out of the same page');

/* What it refused, not merely what it took. This is the half that end-to-end
   running caught and unit assertions had missed: the classifier's reasons were
   correct, the report section existed, and the two were never connected,
   because every interesting rejection happens inside `discover` where nothing
   was recorded. An empty "left out" table is the failure mode that looks
   exactly like a healthy one. */
const rejectedText = noticeInspect.rejected.map(r => r.text);
check(rejectedText.includes('SSC CGL Online Form 2026'),
  'a link the notice filter turned down is handed back, not silently dropped');
check(noticeInspect.rejectedTotal >= noticeInspect.rejected.length,
  'and the total counts at least as many as were kept, so a capped list can say so');

/* The off-host link is structural chrome and must NOT be recorded: it is
   rejected identically on every run of every source, so listing it is pure
   noise. Same-host menu items are a different matter and are deliberately left
   in -- see the comment in discover.js. */
const chromePage = mixedPage + '<a href="https://elsewhere.example/x">Some Result 2026</a>';
const chromeInspect = inspectSource({ source: noticeAggregator, html: chromePage, filter: isNoticeCandidate });
check(!chromeInspect.rejected.some(r => r.url.includes('elsewhere.example')),
  'an off-host link is not listed among the rejections, because chrome would bury the real rows');
check(chromeInspect.rejected.some(r => r.text === 'about us'),
  'but same-host navigation is listed, which is the documented, accepted noise');

/* And the reason shown in the report is the same call the filter made, so the
   column cannot drift away from the decision it describes. */
const droppedVacancy = noticeInspect.rejected.find(r => r.text === 'SSC CGL Online Form 2026');
check(/vacancy/.test(classifyNotice({ text: droppedVacancy.text, context: droppedVacancy.context, url: droppedVacancy.url }).reason),
  'and re-asking the classifier gives the reason the table prints');

const HERE_DIR = path.dirname(fileURLToPath(import.meta.url));

/* ---------------------------------------------------------------------------
   One whole collection, end to end, against fake pages.

   Every assertion above this point calls one function with one input. That is
   how the "left out" table came to be documented, implemented, asserted -- and
   connected to nothing: each piece was right, and the wiring between two of
   them was missing, which no single-function test can see. This runs the real
   runner over a real (fake) notice board and checks the file that comes out.

   It writes to temporary directories, so `npm test` cannot touch out/ or
   state/notices.json.
--------------------------------------------------------------------------- */
const E2E_NOW = new Date('2026-09-28T00:00:00Z');
const noticeBoard = `
  <a href="/res1.pdf">SSC CGL 2026 Final Result Declared</a>
  <a href="/adm1.pdf">SSC CHSL 2026 Admit Card Download</a>
  <a href="/key1.pdf">SSC CGL 2026 Answer Key</a>
  <a href="/both.pdf">SSC MTS 2026 Result cum Answer Key</a>
  <a href="/form.pdf">SSC JE Online Form 2026 Apply Online</a>
  <a href="/x.pdf">Click here</a>
  <a href="/about">About us</a>`;
const e2eSource = {
  id: 'ssc', name: 'SSC', kind: 'official', category: 'SSC', organization: 'Staff Selection Commission',
  url: 'https://ssc.test/notice', allowedHosts: ['ssc.test'],
};
const e2eClient = {
  async get() {
    return {
      response: {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        async arrayBuffer() { return new TextEncoder().encode(noticeBoard).buffer; },
      },
      metadata: {},
    };
  },
};
const e2eRoot = await mkdtemp(path.join(tmpdir(), 'sarkari-notices-'));
const e2e = await runNoticeCollection({
  sources: [e2eSource],
  now: E2E_NOW,
  state: { version: 1, requests: {}, notices: {}, sources: {}, zeroCandidateDays: 0 },
  client: e2eClient,
  cacheDir: path.join(e2eRoot, 'cache'),
  outDir: path.join(e2eRoot, 'out'),
  statePath: path.join(e2eRoot, 'state.json'),
  published: { links: new Set(), keys: new Set(), warning: null },
});

equal(e2e.rows.length, 2, 'a board with one result and one admit card among seven links yields exactly two rows');
equal(e2e.rows.filter(r => r.row.type === 'RESULT').length, 1, 'one of them is the result');
equal(e2e.rows.filter(r => r.row.type === 'ADMIT_CARD').length, 1, 'and one is the admit card');
check(!/answer key/i.test(e2e.csv), 'no answer key reaches the CSV, including the "Result cum Answer Key" one');
check(!/Online Form/i.test(e2e.csv), 'and no vacancy does either — that is the other collector\'s file');

/* The CSV is fed back through the importer's own validator. This is the check
   that matters most: it is the admin Import screen answering, not this file. */
equal(e2e.preview.headerErrors.length, 0, 'the generated CSV header is one the importer accepts');
equal(e2e.preview.invalid, 0, 'and every row in it passes importer validation');
equal(e2e.preview.total, 2, 'with both rows actually present in the parsed file');

/* The wiring that was missing. Not "the table exists" but "the thing that was
   refused is named in it, with its reason". */
const leftOut = e2e.rejected.map(r => r.text);
check(leftOut.includes('SSC CGL 2026 Answer Key'), 'the answer key appears in the report data as left out');
check(leftOut.includes('SSC MTS 2026 Result cum Answer Key'), 'so does the result-cum-answer-key');
check(leftOut.includes('SSC JE Online Form 2026 Apply Online'), 'so does the vacancy');
check(/mentions "answer key"/.test(e2e.report), 'and the written report states the answer-key rule by name');
check(e2e.report.includes('SSC CGL 2026 Answer Key'), 'with the refused link listed in the report itself, not just in memory');

/* The files exist and are the ones named in the workflow's upload path. */
const e2eFiles = await readdir(path.join(e2eRoot, 'out'));
check(e2eFiles.includes(`notices-${E2E_NOW.toISOString().slice(0, 10)}.csv`), 'the CSV is written as notices-YYYY-MM-DD.csv');
check(e2eFiles.includes(`notices-${E2E_NOW.toISOString().slice(0, 10)}.report.md`), 'alongside its report');
check(JSON.parse(await readFile(path.join(e2eRoot, 'state.json'), 'utf8')).notices['https://ssc.test/res1.pdf'],
  'and the collected link is remembered in the notice state file, which is the separate one');

/* And nowhere else. If `outDir` were ignored and OUT_DIR used instead, every
   assertion above would still pass while `npm test` quietly dropped a fake CSV
   into the review queue an administrator imports from. */
const repoOut = path.join(HERE_DIR, 'out');
const repoOutFiles = existsSync(repoOut) ? await readdir(repoOut) : [];
check(!repoOutFiles.some(f => f.startsWith('notices-')),
  'running the checks writes no notice CSV into the pipeline\'s own out/ directory');
check(!existsSync(path.join(HERE_DIR, 'state', 'notices.json')),
  'and does not create or overwrite the real notice state file');

/* A source that fails must not take the report down with it, and must not make
   the rejection table silently empty either. The contract is that `discover`
   always returns `rejected` and `rejectedTotal`, on the failure path too. */
const failingClient = {
  async get(url) {
    if (url.includes('down.test')) throw new Error('ECONNREFUSED');
    return e2eClient.get(url);
  },
};
console.log('  (the "SOURCE FAILED — Down PSC" line below is deliberate: a dead source is being simulated)');
const e2eMixed = await runNoticeCollection({
  sources: [e2eSource, { ...e2eSource, id: 'down', name: 'Down PSC', url: 'https://down.test/notice', allowedHosts: ['down.test'] }],
  now: E2E_NOW,
  state: { version: 1, requests: {}, notices: {}, sources: {}, zeroCandidateDays: 0 },
  client: failingClient,
  cacheDir: path.join(e2eRoot, 'cache3'),
  outDir: path.join(e2eRoot, 'out3'),
  statePath: path.join(e2eRoot, 'state3.json'),
  published: { links: new Set(), keys: new Set(), warning: null },
});
equal(e2eMixed.rows.length, 2, 'one source failing does not cost the rows the other source found');
check(/Down PSC \| FAILED/.test(e2eMixed.report), 'the failed source is named in the health table');
check(e2eMixed.rejected.length > 0, 'and the rejection table is still populated from the source that worked');
equal(e2eMixed.health.ok, false, 'a source that has never answered makes the run unhealthy, so it goes red');

/* Negative control: with the same two notices already on the site, the run
   produces a header and nothing else. Without this, every assertion above
   would still pass if the duplicate filter were deleted. */
const e2eAgain = await runNoticeCollection({
  sources: [e2eSource],
  now: E2E_NOW,
  state: { version: 1, requests: {}, notices: {}, sources: {}, zeroCandidateDays: 0 },
  client: e2eClient,
  cacheDir: path.join(e2eRoot, 'cache2'),
  outDir: path.join(e2eRoot, 'out2'),
  statePath: path.join(e2eRoot, 'state2.json'),
  published: { links: new Set(['https://ssc.test/res1.pdf', 'https://ssc.test/adm1.pdf']), keys: new Set(), warning: null },
});
equal(e2eAgain.rows.length, 0, 'nothing already published is offered again');
equal(e2eAgain.drops.length, 2, 'both are recorded as dropped rather than vanishing');
equal(e2eAgain.skippedPublished, 2, 'and both are attributed to the live site, not to a repeat within the run');

/* noticeTitle. There is no third fallback on purpose. */
equal(noticeTitle({ text: 'SSC CGL Tier-1 Result 2026' }).value, 'SSC CGL Tier-1 Result 2026', 'a good anchor is the title');
equal(noticeTitle({ text: 'Result', context: 'SSC CGL Tier-1 Result 2026 declared' }).value, 'SSC CGL Tier-1 Result 2026 declared',
  'a too-short anchor falls back to its table row');
equal(noticeTitle({ text: 'Click Here', context: 'Download PDF' }).value, null,
  'when both are generic the link is skipped rather than given an invented title');
check(/no usable title/.test(noticeTitle({ text: 'Click Here', context: 'Download PDF' }).reason),
  'and the skip reason says so, so the URL can be resolved by hand');
equal(noticeTitle({ text: '– SSC Result 2026 –' }).value, 'SSC Result 2026', 'leading and trailing separators are trimmed off the title');
const longTitle = `${'Staff Selection Commission Combined Graduate Level Examination '.repeat(6)}Result 2026`;
const cutTitle = noticeTitle({ text: longTitle });
check(cutTitle.value.length <= 255, 'an over-long title is cut to the column width');
check(longTitle.startsWith(cutTitle.value), 'and what is kept is a real prefix of the real title, not a paraphrase');
/* The property that matters is *where* it was cut, not merely that it is a
   prefix. A raw 255-character slice is also a prefix, and it ends mid-word:
   "... Combined Graduate Level Examination Sta". So assert the character
   immediately after the cut is the space the cut was made at. */
equal(longTitle[cutTitle.value.length], ' ', 'the cut falls on a word boundary, so the title does not end mid-word');
check(!/[.…]$/.test(cutTitle.value), 'with no ellipsis, which would read as part of the title');
check(/cut short/.test(cutTitle.reason), 'and the report records that it was truncated');

/* ---------------------------------------------------------------------------
   Cleaning a board heading down to the name of the post.

   Every raw string below is a real anchor from the UPPSC and SSC boards on
   2026-09-28, copied out of that day's committed CSV. They are used verbatim
   rather than paraphrased because the shapes are the point: UPPSC writes the
   advertisement number three different ways on one page, and a rule tuned
   against a tidied-up example would miss two of them.
--------------------------------------------------------------------------- */
const RAW_VETERINARY = '03 Oct 2026 NOTICE REGARDING ADMIT CARD FOR ADVT.NO.D-6/E-1/2025, VETERINARY OFFICER (SCREENING) EXAM-2025, (EXAM. DATED:-03/10/2026)';
equal(noticeTitle({ text: RAW_VETERINARY }).value, 'Veterinary Officer (Screening) Exam-2025',
  'the board heading Ankit objected to becomes just the name of the post');

/* The four strips asserted one at a time. Together they are the line above;
   separately they stop one over-broad rule from being credited for all four
   removals, which is how a rule that eats real titles hides. */
equal(cleanNoticeTitle('03 Oct 2026 Veterinary Officer Screening Exam').value, 'Veterinary Officer Screening Exam',
  'the release date the board prints in front of the heading is removed');
equal(cleanNoticeTitle('NOTICE REGARDING ADMIT CARD FOR Veterinary Officer Screening').value, 'Veterinary Officer Screening',
  'so is the "notice regarding admit card for" wording, which only repeats the type column');
equal(cleanNoticeTitle('CLICK HERE TO DOWNLOAD ADMIT CARD FOR Veterinary Officer Screening').value, 'Veterinary Officer Screening',
  'and the "click here to download" form of the same wording');
equal(cleanNoticeTitle('RESULT OF ADVT.NO.D-6/E-1/2025, Veterinary Officer Screening').value, 'Veterinary Officer Screening',
  'and the advertisement number, which means nothing to anyone who did not apply');
equal(cleanNoticeTitle('RESULT OF D-1/E-1/2026, Medical Education Department').value, 'Medical Education Department',
  'including the bare form UPPSC also uses, with the words "advt no" left off');
equal(cleanNoticeTitle('Veterinary Officer Screening Exam-2025, (EXAM. DATED:-03/10/2026)').value, 'Veterinary Officer Screening Exam-2025',
  'and the exam date on the end, which is not the release date and has no column');

/* Negative controls for the strips. Each of these contains something that
   looks like the thing being stripped and must survive. */
equal(cleanNoticeTitle('SSC CGL Tier-1 Result 2026').value, 'SSC CGL Tier-1 Result 2026',
  'a title with none of that noise in it comes back exactly as it was');
check(cleanNoticeTitle('Medical Education Department, Professor Nephrology, S-08/19').value.includes('S-08/19'),
  'a post serial in the middle of a title is not mistaken for an advertisement number: it is what tells two postings apart');
/* A headline that is nothing but boilerplate. `cleanNoticeTitle` is a strip
   function and strips it -- that is its job. The guarantee belongs one layer up,
   in the function the collector actually calls: an over-eager strip must produce
   an ugly title, never a wrong one. Both fragments below clear the length test,
   and the second one clears GENERIC_TEXT too, so this is the guard's own case
   and not a restatement of theirs. */
equal(cleanNoticeTitle('Result of 2026').value, '2026',
  'the strip function itself does cut a nothing-but-boilerplate heading to a fragment');
equal(noticeTitle({ text: 'Result of 2026' }).value, 'Result of 2026',
  'but the title the collector publishes keeps the board\'s own words instead');
equal(noticeTitle({ text: 'Result of 2026 Exam' }).value, 'Result of 2026 Exam',
  'and so does one whose fragment is long enough to look plausible: "2026 Exam" names no job');
check(namesSomething('Veterinary Officer (Screening) Exam-2025'),
  'a real cleaned title names something');
check(!namesSomething('2026 Exam'), 'a year and the word "exam" name nothing');
check(!namesSomething('Admit Card Result'), 'nor does a pile of notice words');
check(namesSomething('प्रवेश पत्र सूचना'), 'a Hindi headline is never judged a fragment: no strip rule here is Hindi');
equal(noticeTitle({ text: 'Download Admit Card for Junior Engineer Exam 2026' }).value, 'Junior Engineer Exam 2026',
  'and the guard does not block a strip that leaves a real name behind');
equal(noticeTitle({ text: 'Result of Peon' }).value, 'Peon',
  'a genuinely short post name survives the strip: "namesSomething" replaced a character-count floor that threw "Peon" away');
equal(noticeTitle({ text: 'Admit Card for AE' }).value, 'Admit Card for AE',
  'while a two-letter leftover still falls back to the board\'s words — the word test does the work a length test only approximated');
equal(cleanNoticeTitle('Admit Card').value, 'Admit Card',
  'a heading that is only the type word is left alone, not emptied: the boilerplate rule requires a connector after it');
equal(noticeTitle({ text: 'Download PDF' }).value, null,
  'and a generic anchor is still refused outright — cleaning can never rescue one into looking specific');

/* The advertisement number written with hyphens instead of slashes.
   UPPSC uses both on the same board -- "ADVT.NO.D-6/E-1/2025" in one row and
   "ADVT. NO. D-5-E-1-2025" in the next -- and the slashed rule cannot match the
   second, so the number that was supposed to have been removed was still in the
   2026-09-29 CSV. Both spellings must now land on the same title. */
const RAW_HYPHEN_ADVT = 'NOTICE REGARDING ADMIT CARD FOR ADVT. NO. D-5-E-1-2025, VETERINARY OFFICER (SCREENING) EXAM-2025';
equal(noticeTitle({ text: RAW_HYPHEN_ADVT }).value, 'Veterinary Officer (Screening) Exam-2025',
  'an advertisement number written with hyphens is stripped like the slashed one');
equal(noticeTitle({ text: RAW_HYPHEN_ADVT }).value, noticeTitle({ text: RAW_VETERINARY }).value,
  'and the two spellings of one notice produce the identical title');
check(!noticeTitle({ text: RAW_HYPHEN_ADVT }).needsTitle,
  'a row that does name a post is not flagged for a hand-written title');

/* The anchor is load-bearing, and so is the tightness. Without the "advt" in
   front, any hyphenated code in a heading would go; with spaces allowed inside,
   the rule could run past the number and eat a hyphenated post name. */
check(cleanNoticeTitle('Veterinary Officer D-5-E-1-2025').value.includes('D-5-E-1-2025'),
  'a hyphen code with no "advt" in front of it is left alone');
/* Both halves matter. A loosened rule that ate "ASSISTANT-TOWN-PLANNER" would
   empty the headline, `namesSomething` would refuse it, and the fallback would
   hand back the board's raw words -- which still contain the post name. So
   testing the title alone cannot tell "the rule behaved" from "the rule ate
   everything and the safety net caught it". The flag is what separates them. */
const TOWN_PLANNER = noticeTitle({ text: 'RESULT OF ADVT. NO. A-7/E-1/2025, ASSISTANT-TOWN-PLANNER, S-01/02' });
check(TOWN_PLANNER.value.includes('Assistant-Town-Planner') && !TOWN_PLANNER.needsTitle,
  'and the rule does not eat a hyphenated post name that follows the number');

/* "Notice regarding" on either side of the verb. The board writes both
   "CLICK HERE TO DOWNLOAD MARKSHEET ..." and "NOTICE REGARDING DOWNLOAD
   MARKSHEET ...", and with only one order accepted those two came out
   differently: one fell back to the board's words, the other kept "Notice
   Regarding Download Marksheet & Cut Off for" glued to the front. */
equal(noticeTitle({ text: 'Notice Regarding Download Admit Card for Junior Engineer Exam 2026' }).value, 'Junior Engineer Exam 2026',
  'the "notice regarding" lead-in is stripped when it comes before the verb as well as after it');

/* The marksheet and cut-off notices, which name no post at all: the board gives
   an advertisement number and a post code and nothing else. Both keep the
   board's own wording -- a title of "[S-10-04]" would be worse than an ugly one
   -- and both are flagged so the admin writes the name before importing. The
   dates still come off even in that fallback, which is both what Ankit asked for
   and what lets the clipped twin below pair with its full copy. */
const RAW_MARKSHEET = 'NOTICE REGARDING DOWNLOAD MARKSHEET & CUT OFF FOR ADVT. NO. D-5-E-1-2025, [S-10-04]';
const RAW_MARKSHEET_DATED = '06 Oct 2026 NOTICE REGARDING DOWNLOAD MARKSHEET & CUT OFF FOR ADVT. NO. D-5-E-1-2025, [S-10-04]';
const RAW_MARKSHEET_CLICK = 'CLICK HERE TO DOWNLOAD MARKSHEET & CUT OFF FOR ADVT. NO. D-2-E-1-2025, [S-06-01].';
const BOARD_MARKSHEET = 'Notice Regarding Download Marksheet & Cut Off for Advt. No. D-5-E-1-2025, [S-10-04]';
for (const raw of [RAW_MARKSHEET, RAW_MARKSHEET_DATED, RAW_MARKSHEET_CLICK]) {
  const got = noticeTitle({ text: raw });
  check(got.needsTitle, `a headline that names no post is flagged for a hand-written title: ${raw.slice(0, 30)}...`);
  check(/marksheet/i.test(got.value) && /cut off/i.test(got.value),
    `and keeps the board's own words rather than a fragment: ${raw.slice(0, 30)}...`);
  check(!/^\d{1,2}\s+\w{3}\s+\d{4}/.test(got.value),
    `and carries no leading date even in that fallback: ${raw.slice(0, 30)}...`);
}
equal(noticeTitle({ text: RAW_MARKSHEET_DATED }).value, BOARD_MARKSHEET,
  'the dated ticker copy and the plain copy of one marksheet notice land on the identical title');
equal(noticeTitle({ text: RAW_MARKSHEET }).value, BOARD_MARKSHEET,
  'and that title is the board\'s wording in Title Case, with the date gone');

/* The pairing that the leading date used to break. UPPSC prints this notice
   twice: clipped to 80 characters in a list, and in full in a dated ticker. On
   2026-09-29 both reached the CSV, because the dated copy did not start with the
   same characters as the clipped one. */
const MARKSHEET_CLIPPED = noticeTitle({ text: 'NOTICE REGARDING DOWNLOAD MARKSHEET & CUT OFF FOR ADVT. NO. D-5-E-1-2025, [S-10-..' });
const markCollapse = collapseTruncatedTitles([
  { type: 'RESULT', title: MARKSHEET_CLIPPED.value, truncated: true, sourceId: 'uppsc' },
  { type: 'RESULT', title: noticeTitle({ text: RAW_MARKSHEET_DATED }).value, truncated: false, sourceId: 'uppsc' },
]);
check(markCollapse[0] && /cut this heading short/.test(markCollapse[0].reason),
  'the clipped copy of a no-post headline is dropped in favour of its full copy');
check(!markCollapse[1], 'and the full copy is the one that survives');

check(/does not name a post/.test(buildNoticeRow({
  link: { text: RAW_MARKSHEET, context: '', url: 'https://uppsc.up.nic.in/Open_PDF.aspx?x' },
  // A local stand-in rather than the shared source fixtures, which are declared
  // further down this file.
  source: { id: 'uppsc', name: 'Uttar Pradesh Public Service Commission', kind: 'board', organization: 'Uttar Pradesh Public Service Commission', category: 'STATE_PSC' },
  now: new Date('2026-09-29T00:00:00Z'),
  sources: [],
}).notes.join(' | ')),
  'and the report says so in that row\'s own notes, which is where the admin reads it');

/* Undoing the shouting. */
check(isShouting('VETERINARY OFFICER (SCREENING) EXAM-2025'), 'a heading in capitals is recognised as the board\'s stylesheet, not a title');
check(!isShouting('SSC CGL Tier-1 Result 2026'),
  'but a title whose only capitals are abbreviations is not, so "Ssc Cgl" can never be produced');
check(!isShouting('UPPSC Veterinary Officer Admit Card 2026'), 'nor is an ordinary title that opens with a commission\'s initials');
check(isShouting('UTTAR PRADESH AYUSH (AYURVEDA) DEPARTMENT, Reader Rachna Shareer, S-9/04'),
  'a real UPPSC heading with three words typed properly is still shouting — a letter ratio would score this 0.71 and miss it');
/* The three numbers inside `isShouting`. Each of these titles is left exactly
   as the board typed it only because of one of them, and re-casing any of them
   would invent a spelling: the commissions below are not in the acronym list
   and cannot be, because the list has to stay short enough to read. */
check(!isShouting('UPHESC Assistant Professor RESULT'),
  'half the long words shouting is not enough: a 0.3 threshold would turn "UPHESC" into "Uphesc"');
check(!isShouting('UP TET Result 2026'),
  'short words are not counted at all: they are where the abbreviations live, and counting them would make "UP TET" read as a board heading');
check(!isShouting('UPHESC 2026'),
  'and one long word is never re-cased on a sample of one');
equal(cleanNoticeTitle('UPHESC Assistant Professor RESULT').value, 'UPHESC Assistant Professor RESULT',
  'so all three survive cleaning untouched');
equal(cleanNoticeTitle('UP TET Result 2026').value, 'UP TET Result 2026', 'the second of them too');
equal(cleanNoticeTitle('UPHESC 2026').value, 'UPHESC 2026', 'and the third');
equal(toTitleCase('MEDICAL EDUCATION DEPARTMENT U.P. AND REHABILITATION'), 'Medical Education Department U.P. and Rehabilitation',
  'dotted initials keep their capitals and a joining word goes lowercase');
check(toTitleCase('GNM A.N.M. NURSING STAFF').includes('A.N.M.'),
  'and the dotted-initials guard is load-bearing for one of them: "A.N.M." opens with "a", a small word, and without the guard comes back as "a.N.M."');
equal(toTitleCase('SSC CGL RESULT'), 'SSC CGL Result', 'a known abbreviation stays in capitals while the ordinary word does not');
equal(toTitleCase('ASSISTANT TOWN PLANNER (SPL. RECT.) EXAM.-2025'), 'Assistant Town Planner (Spl. Rect.) Exam.-2025',
  'brackets, stops and trailing years survive the re-casing');
equal(toTitleCase('AND THE RESULT'), 'And the Result', 'a joining word at the very front is still capitalised');

/* The truncation mark. This is the load-bearing distinction for
   `collapseTruncatedTitles`: read a single full stop as truncation and the
   collapse rule starts deleting complete notices. */
check(noticeTitle({ text: 'NOTICE REGARDING ADMIT CARD FOR ADVT.NO.D-6/E-1/2025, VETERINARY OFFICER (SCREEN..' }).truncated,
  'the ".." UPPSC leaves when it clips a heading to eighty characters is detected');
check(!noticeTitle({ text: 'CLICK HERE TO DOWNLOAD ADMIT CARD FOR ADVT. NO. A-7/E-1/2025, ASSISTANT PROFESSOR, GOVT. DEGREE COLLEGE MAINS EXAM-2025.' }).truncated,
  'but a heading that simply ends in a full stop is not, so a complete notice is never deleted as a clipping');
check(cutTitle.truncated, 'and a title we cut ourselves at 255 characters is flagged too');

/* ---------------------------------------------------------------------------
   The clipped-ticker collapse.
--------------------------------------------------------------------------- */
const clipped = { type: 'ADMIT_CARD', title: 'Veterinary Officer (Screen', truncated: true, sourceId: 'uppsc' };
const full = { type: 'ADMIT_CARD', title: 'Veterinary Officer (Screening) Exam-2025', truncated: false, sourceId: 'uppsc' };
const tickerPair = collapseTruncatedTitles([clipped, full]);
check(tickerPair[0], 'the clipped half of a UPPSC ticker/table pair is dropped');
equal(tickerPair[1], null, 'and the full one is kept');
check(/in full as "Veterinary Officer \(Screening\) Exam-2025"/.test(tickerPair[0].reason),
  'with the reason naming the row that replaced it, so the report is readable');
/* Order independence. The ticker is printed above the table, so the clipped
   row always arrives first; a rule that only worked in one order would look
   correct here and drop the good row on the real board. */
const reversed = collapseTruncatedTitles([full, clipped]);
equal(reversed[0], null, 'the same pair in the other order still keeps the full row');
check(reversed[1], 'and still drops the clipped one');

/* Negative controls. Each changes exactly one thing about the matching pair
   above, and each must stop the collapse. */
equal(collapseTruncatedTitles([{ ...clipped, truncated: false }, full])[0], null,
  'a row that is a prefix but was never clipped is kept: "Assistant Professor" must not be eaten by "Assistant Professor (Mains)"');
equal(collapseTruncatedTitles([clipped, { ...full, type: 'RESULT' }])[0], null,
  'a longer row of the other type is not the same notice');
equal(collapseTruncatedTitles([clipped, { ...full, sourceId: 'ssc' }])[0], null,
  'nor is a longer row from a different board — two boards wording one result differently is the key rule\'s job');
equal(collapseTruncatedTitles([clipped, { ...full, title: 'Veterinary Surgeon (Screening) Exam-2025' }])[0], null,
  'and a longer row that is not actually a continuation is left alone');
equal(collapseTruncatedTitles([clipped, { ...clipped }])[0], null,
  'two clippings of the same length collapse into neither, because nothing longer is present to keep');
equal(collapseTruncatedTitles([clipped])[0], null,
  'a clipping with no full twin in the run is kept rather than lost — the report flags it for a human instead');
check(buildNoticeRow({
  link: { url: 'https://uppsc.up.nic.in/Open_PDF_DB.aspx?x', text: 'NOTICE REGARDING ADMIT CARD FOR ADVT.NO.D-6/E-1/2025, VETERINARY OFFICER (SCREEN..' },
  source: { id: 'uppsc', kind: 'official', name: 'UPPSC', organization: 'Uttar Pradesh Public Service Commission', category: 'STATE_PSC' },
}).notes.some(n => /cut this heading short/.test(n)),
  'and that flag reaches the report through the row notes, not just the return value');

/* ---------------------------------------------------------------------------
   The aggregator's own furniture.

   Ankit asked for sarkariresult.com.cm to stay as a discovery source, so these
   rules refuse its menu rather than the site. All five junk rows published on
   2026-09-28 are in here as the positive cases.
--------------------------------------------------------------------------- */
const aggSource = {
  id: 'sarkariresult', kind: 'aggregator', name: 'Sarkari Result discovery (.com.cm)',
  url: 'https://sarkariresult.com.cm/latest-jobs/', allowedHosts: ['sarkariresult.com.cm', 'www.sarkariresult.com.cm'],
};
const officialSource = { id: 'ssc', kind: 'official', name: 'SSC', allowedHosts: ['ssc.gov.in'] };
const junkRows = [
  ['Sarkari Result™', 'https://sarkariresult.com.cm/'],
  ['Admit Card', 'https://sarkariresult.com.cm/admit-card/'],
  ['official Sarkari Result', 'http://sarkariresult.com.cm/latest-posts/'],
  ['Let’s update', 'http://sarkariresult.com.cm/result/'],
  ['SarkariResult.com.cm', 'http://sarkariresult.com.cm/'],
];
for (const [text, url] of junkRows) {
  equal(classifyNotice({ text, url, source: aggSource }).type, null,
    `"${text}" is refused: it is the aggregator's own menu, not a notice`);
}
check(/section page/.test(classifyNotice({ text: 'Admit Card', url: 'https://sarkariresult.com.cm/admit-card/', source: aggSource }).reason),
  'and the reason says it is a section page, so the report explains the refusal');
/* The rule that was missing. `looksLikeChrome` compares a link against the
   *configured* source page, which is /latest-jobs/, so the bare home page was
   never chrome and reached the site titled "Sarkari Result™". */
check(!looksLikeChrome({ url: 'https://sarkariresult.com.cm/', text: 'Sarkari Result™' }, aggSource),
  'the existing self-link test genuinely does not catch the home page — this is the gap, stated as a fact');
check(!isNoticeCandidate({ url: 'https://sarkariresult.com.cm/', text: 'Sarkari Result™' }, aggSource),
  'and the notice filter now refuses it anyway');

/* Negative controls: the rule must be narrow in two directions at once. */
equal(classifyNotice({ text: 'UPSC NDA Result 2026', url: 'https://sarkariresult.com.cm/upsc-nda-result-2026/', source: aggSource }).type, 'RESULT',
  'a real post on the aggregator is still collected — the source stays, only its furniture goes');
equal(classifyNotice({ text: 'Result', url: 'https://ssc.gov.in/result/', source: officialSource }).type, 'RESULT',
  'and /result/ on an official board is still a result: there it really is where the notice lives');
equal(classifyNotice({ text: 'Result', url: 'https://ssc.gov.in/result/' }).type, 'RESULT',
  'omitting the source entirely leaves the old behaviour untouched, so no official board loses a notice');
check(isSectionPage('https://sarkariresult.com.cm/result/'), 'a one-segment section path is recognised');
check(!isSectionPage('https://sarkariresult.com.cm/upsc-nda-result-2026/'), 'but a post slug that merely contains "result" is not');
/* Each of the two aggregator tests has to be provable on its own. All five junk
   rows from 2026-09-28 happen to fail both, so the five cases above would still
   pass with either test deleted. These four do not. */
equal(classifyNotice({ text: 'SarkariResult.com.cm', url: 'https://sarkariresult.com.cm/ssc-cgl-2026-result/', source: aggSource }).type, null,
  'the site\'s own name as the anchor is refused even on a deep post link, where the section test cannot help');
check(/own name/.test(classifyNotice({ text: 'SarkariResult.com.cm', url: 'https://sarkariresult.com.cm/ssc-cgl-2026-result/', source: aggSource }).reason),
  'and it is refused for that reason, not by accident');
equal(classifyNotice({ text: 'Junior Engineer Result 2026', url: 'https://sarkariresult.com.cm/', source: aggSource }).type, null,
  'and the bare home page is refused even under a headline anchor, where the brand test cannot help');
check(isSectionPage('https://sarkariresult.com.cm/'), 'because a path with no segments at all is the home page, which is the biggest section page there is');
/* `every`, not `some`: a real post lives *under* a section, so its path
   contains a section segment and one more. Reading it as `some` would refuse
   every result the aggregator files tidily. */
equal(classifyNotice({ text: 'SSC CGL 2026 Final Result', url: 'https://sarkariresult.com.cm/result/ssc-cgl-2026-final-result/', source: aggSource }).type, 'RESULT',
  'a post filed under /result/ is collected: only a path that is *nothing but* section names is a section page');
check(!isSectionPage('https://sarkariresult.com.cm/result/ssc-cgl-2026-final-result/'), 'stated as the unit rule too');
check(isOwnBrandText('Sarkari Result™', aggSource), 'anchor text that is only the site\'s own name is recognised');
check(isOwnBrandText('SarkariResult.com.cm', aggSource), 'including the form with the domain written out');
check(!isOwnBrandText('Sarkari Result UPSC NDA 2026', aggSource),
  'but the site\'s name in front of a real post name is not — that is how the aggregator titles half its rows');
check(!isOwnBrandText('Sarkari Result™', officialSource), 'and a source with a different host does not match its own name at all');
check(!isOwnBrandText('SSC', officialSource),
  'a host label of three letters is not a brand: "ssc" and "upsc" are how real notices name the commission, and matching those would refuse them');

/* ---------------------------------------------------------------------------
   The city-intimation trap.
--------------------------------------------------------------------------- */
const RAW_CITY = 'Information regarding the city of examination and Admission Certificate for the candidates of Combined Graduate level Examination, 2026 (Tier-I)';
equal(classifyNotice({ text: RAW_CITY }).type, null,
  'SSC\'s city-intimation notice is not an admit card, even though it says "Admission Certificate"');
check(/city of examination/.test(classifyNotice({ text: RAW_CITY }).reason),
  'and the reason names the wording that refused it, so this cannot be passing for some other cause');
/* Negative control: the same document type without the city wording. If the
   new entries were too broad, this would be refused too and the collector
   would stop finding SSC admit cards altogether. */
equal(classifyNotice({ text: 'Admission Certificate for the candidates of Combined Graduate level Examination, 2026 (Tier-I)' }).type, 'ADMIT_CARD',
  'while the admission certificate itself is still collected as an admit card');

/* inferOrigin. Evidence or blank -- never a guess from an abbreviation table. */
const sourcesForOrigin = [
  { id: 'ssc', kind: 'official', name: 'SSC', organization: 'Staff Selection Commission', category: 'SSC' },
  { id: 'upsc', kind: 'official', name: 'UPSC', organization: 'Union Public Service Commission', category: 'UPSC' },
  { id: 'sarkariresult', kind: 'aggregator', name: 'agg', organization: null, category: 'CENTRAL_GOVT' },
];
equal(inferOrigin('anything at all', sourcesForOrigin[0], sourcesForOrigin).organization, 'Staff Selection Commission',
  'an official source already knows its own organisation');
equal(inferOrigin('anything at all', sourcesForOrigin[0], sourcesForOrigin).category, 'SSC', 'and its category');
equal(inferOrigin('SSC CGL 2026 Result', noticeAggregator, sourcesForOrigin).organization, 'Staff Selection Commission',
  'an aggregator row naming a watched body is attributed to it');
equal(inferOrigin('BSSC Inter Level Result 2026', noticeAggregator, sourcesForOrigin).organization, '',
  'but BSSC is the Bihar commission and must not be read as SSC');
equal(inferOrigin('SSC and UPSC joint notice result', noticeAggregator, sourcesForOrigin).organization, '',
  'two matches mean no match, following buildJobIndex: a collision is reported, not resolved');
check(/ambiguous/.test(inferOrigin('SSC and UPSC joint notice result', noticeAggregator, sourcesForOrigin).reason),
  'and the reason says it was ambiguous rather than absent');
equal(inferOrigin('Some Board Result 2026', noticeAggregator, sourcesForOrigin).organization, '',
  'an unknown body leaves the column blank for the admin');

/* releaseDateFrom. A result's release date is in the recent past or nowhere. */
const NOW = new Date('2026-09-28T00:00:00Z');
equal(releaseDateFrom({ text: 'Result declared 26/09/2026' }, NOW).value, '2026-09-26', 'a recent stated date is taken');
equal(releaseDateFrom({ text: 'Result will be declared on 26/12/2026' }, NOW).value, '',
  'a future date is refused: it is the exam or the closing date, not the release');
/* 2026-01-15 is chosen deliberately: `datesInText` keeps it (its own sanity
   window is a year back), so it reaches the 90-day floor and actually tests it.
   A 2025 date would be discarded upstream and would prove nothing about this
   rule -- which is what the first version of this assertion did. */
check(datesInText('Result of exam held 15/01/2026', { now: NOW }).includes('2026-01-15'),
  'the date parser itself accepts a date from earlier this year, so the next assertion tests the 90-day floor and not the parser');
equal(releaseDateFrom({ text: 'Result of exam held 15/01/2026' }, NOW).value, '',
  'a date older than the 90-day window is refused, because it is usually the row below');
equal(releaseDateFrom({ text: 'Exam 12/08/2026 Result 26/09/2026' }, NOW).value, '2026-09-26',
  'with two dates in the window the later one is the release date');
equal(releaseDateFrom({ text: 'No dates here at all' }, NOW).value, '', 'and no date at all is a perfectly good answer');
check(/left blank rather than guessed/.test(releaseDateFrom({ text: 'nothing' }, NOW).reason), 'which the report states plainly');

/* buildNoticeRow: the whole link -> row path, including the two blank columns. */
const built = buildNoticeRow({
  link: { url: 'https://ssc.gov.in/result/cgl-2026.pdf', text: 'SSC CGL Tier-1 Result 2026', context: 'Declared 26/09/2026' },
  source: sourcesForOrigin[0], now: NOW, sources: sourcesForOrigin,
});
equal(built.skipped, false, 'a clean result link produces a row');
equal(built.row.type, 'RESULT', 'with the type the classifier decided');
equal(built.row.title, 'SSC CGL Tier-1 Result 2026', 'the anchor text as the title');
equal(built.row.organization, 'Staff Selection Commission', 'the declared organisation');
equal(built.row.releaseDate, '2026-09-26', 'and the release date from the row');
equal(built.row.jobId, '', 'jobId is left blank on purpose: the import screen resolves it against the live job list');
equal(built.row.note, '', 'and note is blank because it renders on the public page, where provenance does not belong');
check(built.notes.length >= 3, 'every decision that produced the row is recorded for the report');
/* This fixture has to be classifiable but untitleable, or it is skipped at the
   classifier and never exercises the title gate at all. "Result" carries the
   type signal and is six characters, so the title falls back to its row, and
   "Download" is generic -- so the row is refused for want of a title. */
const skipped = buildNoticeRow({
  link: { url: 'https://ssc.gov.in/x.pdf', text: 'Result', context: 'Download' },
  source: sourcesForOrigin[0], now: NOW, sources: sourcesForOrigin,
});
equal(classifyNotice({ text: 'Result', context: 'Download' }).type, 'RESULT',
  'the fixture below is classifiable, so it reaches the title check rather than stopping at the classifier');
equal(skipped.skipped, true, 'and a link with no usable title is skipped rather than published under a made-up one');
check(/no usable title/.test(skipped.reason), 'with the title as the stated reason, not the type');

/* The file itself, round-tripped through the importer's own parser. */
const sampleRows = [
  { type: 'RESULT', title: 'SSC CGL Tier-1 Result 2026', organization: 'Staff Selection Commission', category: 'SSC', link: 'https://ssc.gov.in/a.pdf', releaseDate: '2026-09-26', jobId: '', note: '' },
  { type: 'ADMIT_CARD', title: 'RRB Group D Admit Card, 2026', organization: 'Railway Recruitment Board', category: 'RAILWAY', link: 'https://rrbcdg.gov.in/b.pdf', releaseDate: '', jobId: '', note: '' },
];
const noticeCsv = toNoticeCsv(sampleRows);
const roundTrip = previewNoticeValidation(noticeCsv);
equal(roundTrip.total, 2, 'the written CSV parses back to the same number of rows');
equal(roundTrip.valid, 2, 'and the importer accepts every row this collector writes');
equal(roundTrip.headerErrors.length, 0, 'with a header the importer recognises, because it is generated from its own column list');
check(toNoticeCsv([sampleRows[1]]).includes('"RRB Group D Admit Card, 2026"'),
  'a title containing a comma is quoted, so it stays in one column');
equal(previewNoticeValidation(toNoticeCsv([sampleRows[1]])).problems.length, 0,
  'and the importer reads that quoted title back as one field');
throws(() => noticeRowToLine({ type: 'RESULT', title: 'x', link: 'y', resultDate: '2026-01-01' }), /Not a notice CSV column/,
  'a key that is not a notice column is an error, not a silent drop');

/* noticeKey has to mean the same thing here as it does in the importer, or the
   collector writes rows the admin screen then refuses. */
const dupeCsv = toNoticeCsv([sampleRows[0], { ...sampleRows[0], link: 'https://elsewhere.example/c.pdf' }]);
const dupePreview = previewNoticeValidation(dupeCsv);
equal(dupePreview.invalid, 1, 'the importer catches the same notice twice in one file');
equal(noticeKey('RESULT', 'SSC CGL Tier-1 Result 2026'), noticeKey('RESULT', '  ssc cgl tier-1   result 2026  '),
  'and noticeKey normalises spacing and case the same way the importer does');
notEqual(noticeKey('RESULT', 'SSC CGL Tier-1 Result 2026'), noticeKey('ADMIT_CARD', 'SSC CGL Tier-1 Result 2026'),
  'while the type is part of the key, so a result and an admit card of the same name are different rows');

/* createNoticeDuplicateFilter: already on the site, or already in this run. */
const dupFilter = createNoticeDuplicateFilter({
  publishedLinks: new Set(['https://ssc.gov.in/published.pdf']),
  publishedKeys: new Set([noticeKey('RESULT', 'UPSC CSE Final Result 2026')]),
});
check(dupFilter.reasonToDrop({ type: 'RESULT', title: 'Something new', link: 'https://ssc.gov.in/published.pdf' })?.published,
  'a row whose link is already on the site is dropped');
check(dupFilter.reasonToDrop({ type: 'RESULT', title: 'UPSC CSE Final Result 2026', link: 'https://other.example/x.pdf' })?.published,
  'and so is the same result reached through a different URL, which is the usual aggregator case');
equal(dupFilter.reasonToDrop({ type: 'ADMIT_CARD', title: 'UPSC CSE Final Result 2026', link: 'https://other.example/x.pdf' }), null,
  'but the same title under the other type is a different notice and is kept');
const fresh = { type: 'RESULT', title: 'BPSC 70th Result 2026', link: 'https://bpsc.bihar.gov.in/r.pdf' };
equal(dupFilter.reasonToDrop(fresh), null, 'an unseen row passes');
dupFilter.remember(fresh);
check(dupFilter.reasonToDrop({ ...fresh, link: 'https://mirror.example/r.pdf' })?.published === false,
  'a repeat within the same run is dropped, and is reported as a within-run repeat rather than as published');
check(dupFilter.reasonToDrop({ ...fresh, title: 'A completely different title' })?.published === false,
  'including the same link under a different title');

/* publishedNoticeIdentity: reads the public list, pages through it, and degrades
   to a warning rather than refusing to run. */
const previousApiUrl = process.env.SARKARI_API_URL;
delete process.env.SARKARI_API_URL;
const unconfigured = await publishedNoticeIdentity();
equal(unconfigured.keys.size, 0, 'with no API URL the collector still runs');
check(/may repeat notices/.test(unconfigured.warning), 'and says in the report that it could not check what is already published');
process.env.SARKARI_API_URL = 'https://api.example/api/';
const pagesRequested = [];
const pagedFetch = async url => {
  pagesRequested.push(url);
  const page = Number(new URL(url).searchParams.get('page'));
  return new Response(JSON.stringify({
    content: [{ type: 'RESULT', title: `Result page ${page}`, link: `https://x.example/${page}.pdf` }],
    page, size: 100, totalElements: 2, totalPages: 2, first: page === 0, last: page === 1,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const identity = await publishedNoticeIdentity(pagedFetch);
equal(pagesRequested.length, 2, 'every page of the published list is read, not just the first');
check(!pagesRequested[0].includes('//notices'), 'and the trailing slash on the API base does not produce a double slash');
equal(identity.keys.size, 2, 'so a notice on page two is still recognised as published');
check(identity.links.has('https://x.example/1.pdf'), 'links are collected as well as keys');
await rejects(() => publishedNoticeIdentity(async () => new Response('nope', { status: 500 })), /HTTP 500/,
  'a broken API is an error, not an empty set silently treated as "nothing is published"');
if (previousApiUrl === undefined) delete process.env.SARKARI_API_URL; else process.env.SARKARI_API_URL = previousApiUrl;

/* The report. Its job is to be readable when the run went wrong, so the two
   things checked are that rejected links are visible and that a title
   containing a pipe cannot break the table it sits in. */
const reportMd = noticeReportMarkdown({
  date: '2026-09-28',
  discovery: { reports: [{ source: { id: 'ssc', name: 'SSC' }, ok: true, linksSeen: 40, candidates: [1] }] },
  rows: [{ row: sampleRows[0], notes: ['the link text says "result"'], link: { url: 'https://ssc.gov.in/a.pdf', source: { name: 'SSC' } } }],
  preview: { total: 1, valid: 1, invalid: 0, headerErrors: [], problems: [], notes: [] },
  skippedPublished: 0, warnings: [], state: { sources: {}, zeroCandidateDays: 0 },
  drops: [], carriedOver: [], health: { ok: true, reasons: [], notes: [] },
  rejected: [{ source: 'SSC', text: 'Answer Key | 2026', url: 'https://ssc.gov.in/ak.pdf', reason: 'mentions "answer key"' }],
});
check(reportMd.includes('Looked at and left out'), 'the report shows what was rejected, so an over-broad rule is visible');
check(reportMd.includes('mentions "answer key"'), 'with the rule that rejected each link');
check(reportMd.includes('Answer Key \\| 2026'), 'and a pipe in a link text is escaped instead of breaking the table');
check(/Answer keys are not collected/.test(reportMd), 'the report states the answer-key decision, so it does not read as a gap');

/* The hand-written-title count. A flag nobody reads is not a flag, and the
   summary at the top of the report is the one part of it that always gets read.
   Two rows in, one of them flagged, so a hard-coded "0" or a count of every row
   would both show up here. */
const reportWithFlagged = noticeReportMarkdown({
  date: '2026-09-29',
  discovery: { reports: [{ source: { id: 'uppsc', name: 'UPPSC' }, ok: true, linksSeen: 9, candidates: [1, 2] }] },
  rows: [
    { row: sampleRows[0], notes: [], needsTitle: false, link: { url: 'https://uppsc.up.nic.in/a.pdf', source: { name: 'UPPSC' } } },
    { row: sampleRows[0], notes: [], needsTitle: true, link: { url: 'https://uppsc.up.nic.in/b.pdf', source: { name: 'UPPSC' } } },
  ],
  preview: { total: 2, valid: 2, invalid: 0, headerErrors: [], problems: [], notes: [] },
  skippedPublished: 0, warnings: [], state: { sources: {}, zeroCandidateDays: 0 },
  drops: [], carriedOver: [], health: { ok: true, reasons: [], notes: [] }, rejected: [],
});
check(/Rows whose title must be written by hand: 1\b/.test(reportWithFlagged),
  'the report counts the rows whose title a person must write, and counts only those');
check(/Rows whose title must be written by hand: 0\b/.test(reportMd),
  'and reports zero when every row named a post, rather than omitting the line');

if (failures.length) {
  console.error(`pipeline-check: ${failures.length} of ${checks} checks FAILED\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`pipeline-check: ${checks} checks passed`);