import assert from 'node:assert/strict';
import { parseIndianDate, dateNearLabel, extractApplicationDates } from './lib/dates.js';
import { linksFromHtml } from './lib/html.js';
import { robotsAllows } from './lib/http.js';
import { extractJob } from './lib/extract.js';
import { canonicalUrl, inspectSource, linksFromJson, isCandidate } from './discover.js';
import { header, toCsv, previewValidation } from './lib/csv-out.js';

let checks = 0;
function check(value, message) { assert.ok(value, message); checks += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); checks += 1; }

equal(parseIndianDate('14/10/2026'), '2026-10-14', 'numeric dates are day-first');
equal(parseIndianDate('14 October 2026'), '2026-10-14', 'written day-first date parses');
equal(parseIndianDate('October 14, 2026'), '2026-10-14', 'written month-first date parses');
equal(parseIndianDate('2026-02-31'), null, 'impossible date is rejected');
equal(dateNearLabel('Exam date: 14 October 2026. Last date: 31 October 2026', ['last date'], { now: new Date('2026-01-01') }).value, '2026-10-31', 'label chooses the right date');
equal(extractApplicationDates('Online application starts: 1 October 2026. Closing date: 31 October 2026', { now: new Date('2026-01-01') }).lastDate.value, '2026-10-31', 'closing date is detected');

const anchors = linksFromHtml('<table><tr><td>Advt. No. 05/2026 for Physiotherapist - 2026</td><td><a href="notice.pdf"> Recruitment <b>Notice</b></a></td></tr></table><a href="mailto:x@y">mail</a>', 'https://example.gov.in/list');
equal(anchors.length, 1, 'non-web links are excluded');
equal(anchors[0].url, 'https://example.gov.in/notice.pdf', 'relative URL resolves');
check(anchors[0].context.includes('05/2026'), 'table row context is preserved for sparse link labels');
equal(canonicalUrl('https://SSC.GOV.IN/x.pdf?utm_source=x&keep=1#page=2'), 'https://ssc.gov.in/x.pdf?keep=1', 'tracking and fragments do not make new candidates');

const source = { id: 'test', name: 'Test', url: 'https://example.gov.in/notices', organization: 'Test', category: 'SSC', allowedHosts: ['example.gov.in'] };
const sourceHtml = '<a href="a.pdf">Recruitment notice</a><a href="b.pdf">Vacancy</a><a href="c">home</a><a href="d">about</a><a href="e">contact</a>';
equal(inspectSource({ source, html: sourceHtml }).candidates.length, 2, 'keywords select notices without selectors');
assert.throws(() => inspectSource({ source, html: '<a href="a">one</a>' }), /minimum is 5/, 'link-count floor prevents silent success'); checks += 1;
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

check(header().includes('lastDate'), 'CSV header comes from shared importer contract');
const quoted = toCsv([{ postName: 'Engineer, Civil', organization: 'Test', category: 'SSC', applicationStartDate: '2026-10-01', lastDate: '2026-10-31' }]);
const preview = previewValidation(quoted);
equal(preview.valid, 1, 'quoted row round-trips through the real importer');
const incomplete = previewValidation(toCsv([{ postName: 'Missing dates', organization: 'Test', category: 'SSC' }]));
equal(incomplete.invalid, 1, 'missing required dates are reported for human completion');

console.log(`pipeline-check: ${checks} checks passed`);
