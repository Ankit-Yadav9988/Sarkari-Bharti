import assert from 'node:assert/strict';
import { parseIndianDate, dateNearLabel, extractApplicationDates } from './lib/dates.js';
import { linksFromHtml } from './lib/html.js';
import { robotsAllows } from './lib/http.js';
import { extractJob } from './lib/extract.js';
import { canonicalUrl, inspectSource } from './discover.js';
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

const anchors = linksFromHtml('<a href="notice.pdf"> Recruitment <b>Notice</b></a><a href="mailto:x@y">mail</a>', 'https://example.gov.in/list');
equal(anchors.length, 1, 'non-web links are excluded');
equal(anchors[0].url, 'https://example.gov.in/notice.pdf', 'relative URL resolves');
equal(canonicalUrl('https://SSC.GOV.IN/x.pdf?utm_source=x&keep=1#page=2'), 'https://ssc.gov.in/x.pdf?keep=1', 'tracking and fragments do not make new candidates');

const source = { id: 'test', name: 'Test', url: 'https://example.gov.in/notices', organization: 'Test', category: 'SSC', allowedHosts: ['example.gov.in'] };
const sourceHtml = '<a href="a.pdf">Recruitment notice</a><a href="b.pdf">Vacancy</a><a href="c">home</a><a href="d">about</a><a href="e">contact</a>';
equal(inspectSource({ source, html: sourceHtml }).candidates.length, 2, 'keywords select notices without selectors');
assert.throws(() => inspectSource({ source, html: '<a href="a">one</a>' }), /minimum is 5/, 'link-count floor prevents silent success'); checks += 1;
check(robotsAllows('User-agent: *\nDisallow: /admin\nAllow: /', '/jobs'), 'robots allows public path');
check(!robotsAllows('User-agent: *\nDisallow: /admin', '/admin/import'), 'robots blocks disallowed path');

const sample = 'ADVERTISEMENT NO. 10/2026 Recruitment for the post of Analyst. Total vacancies: 42. Online application starts: 01/10/2026. Last date: 31/10/2026.';
const extracted = extractJob({ source, link: { url: 'https://example.gov.in/notice.pdf', text: 'Analyst Recruitment 2026' }, body: sample, contentType: 'application/pdf', now: new Date('2026-01-01') });
equal(extracted.row.applicationStartDate, '2026-10-01', 'extracts labelled start date');
equal(extracted.row.lastDate, '2026-10-31', 'extracts labelled closing date');
equal(extracted.row.totalPosts, 42, 'extracts labelled total posts');
equal(extracted.row.notificationPdfUrl, 'https://example.gov.in/notice.pdf', 'PDF URL is preserved');

check(header().includes('lastDate'), 'CSV header comes from shared importer contract');
const quoted = toCsv([{ postName: 'Engineer, Civil', organization: 'Test', category: 'SSC', applicationStartDate: '2026-10-01', lastDate: '2026-10-31' }]);
const preview = previewValidation(quoted);
equal(preview.valid, 1, 'quoted row round-trips through the real importer');
const incomplete = previewValidation(toCsv([{ postName: 'Missing dates', organization: 'Test', category: 'SSC' }]));
equal(incomplete.invalid, 1, 'missing required dates are reported for human completion');

console.log(`pipeline-check: ${checks} checks passed`);
