import { useEffect, useState } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import SeoHead from '../../components/SeoHead';
import Link from 'next/link';
import { NoticeRow, SyllabusRow, CutoffRow, PaperRow, CalendarTable } from '../../components/rows';
import ShareButtons from '../../components/ShareButtons';
import { API_URL, API_TIMEOUT, apiRequest, DATE_COLORS, formatDate, daysUntil, formatViews, jobHref } from '../../lib/api';
import { setListingCache } from '../../lib/cache';
import { landingForCategory, landingForState, landingText } from '../../lib/landings';
import { useLang } from '../../lib/i18n';
import { localeUrl } from '../../lib/site';
import { ldScript } from '../../lib/jsonld';

/**
 * Everything the exam-content endpoints expose for one posting, fetched together.
 *
 * All five are the dedicated unpaged /for-job/{id} routes, not the ?jobId= list
 * filters. The list endpoints answer with a 20-row page, so a posting with more
 * updates than that would quietly stop showing its newest ones; a single job's
 * rows are a handful either way, so there is nothing to page here.
 *
 * In parallel, and each failure contained to its own key. These blocks are
 * supporting material — a syllabus service having a bad minute must not take down
 * the page carrying the last date to apply, which is the one thing on it that
 * cannot wait.
 */
// Supporting content is intentionally fetched after the main job has rendered.
// A slow notices/syllabus endpoint must not delay the primary job details.
async function fetchForJob(jobId) {
  const one = async path => {
    try {
      const res = await fetch(`${API_URL}/${path}/for-job/${jobId}`, apiRequest(API_TIMEOUT.secondary));
      if (!res.ok) return [];
      const data = await res.json();
      // The route returns a bare array; tolerate a Page body so switching one of
      // these to a paged endpoint later cannot silently blank a block.
      return Array.isArray(data) ? data : (data?.content ?? []);
    } catch {
      return [];
    }
  };

  const [notices, syllabi, cutoffs, calendar, papers] = await Promise.all([
    one('notices'), one('syllabi'), one('cutoffs'), one('exam-calendar'), one('papers'),
  ]);
  return { notices, syllabi, cutoffs, calendar, papers };
}

// One posting, one URL. The backend resolves /api/jobs/5 and
// /api/jobs/sbi-clerk-2026-5 to the same row, which is what keeps links that
// were shared before slugs existed working -- but serving the page at both
// addresses would split the same content across two of them. So the id form
// answers with a permanent redirect to the slug, and the slug is the only URL
// this site links to, canonicalises, or puts in the sitemap.
export async function getServerSideProps({ params, res }) {
  const empty = { notices: [], syllabi: [], cutoffs: [], calendar: [], papers: [] };
  try {
    const requested = String(params.id);
    const apiRes = await fetch(`${API_URL}/jobs/${encodeURIComponent(requested)}`, apiRequest(API_TIMEOUT.primary));
    if (apiRes.status === 404) return { notFound: true };
    if (!apiRes.ok) throw new Error('backend error');
    const job = await apiRes.json();

    // 301, not 302: the id URL is never coming back as the canonical one, and a
    // temporary redirect would leave the old address in the index indefinitely.
    // Fetched before the related content, so a redirect costs one request rather
    // than six.
    if (job.slug && requested !== job.slug) {
      return { redirect: { destination: `/jobs/${job.slug}`, permanent: true } };
    }

    setListingCache(res, { detail: true });
    // Keep the five supporting requests out of the SSR critical path. The
    // browser loads them after the job details and apply links are visible.
    return { props: { job, backendError: false } };
  } catch (err) {
    // The response has to say 503 here, and this is the page where it matters
    // most. A sleeping backend is the normal state of a free-tier host, so
    // without this the site's most valuable URLs periodically answer 200 OK
    // with an empty body — which tells a crawler the posting is gone.
    setListingCache(res, { backendError: true });
    return { props: { job: null, ...empty, backendError: true } };
  }
}

const STATUS_BANNERS = {
  ACTIVE:   { bg: '#e3f4e8', fg: '#14713d', border: '#b6dfc4', key: 'job.applicationsOpen' },
  UPCOMING: { bg: '#fdf0d8', fg: '#8a5a08', border: '#f0d59b', key: 'job.applicationsSoon' },
  CLOSED:   { bg: '#ecedef', fg: '#5a6470', border: '#d6d9dd', key: 'job.applicationsClosed' },
};

// Keyed, not labelled. These are module-level constants so they cannot call t()
// themselves; holding the key and translating at the call site is what keeps the
// Hindi page from showing "Download admit card" in the middle of Hindi copy.
const NOTICE_ACTION = {
  ADMIT_CARD: { key: 'job.downloadAdmitCard', color: 'var(--c-admit)' },
  RESULT:     { key: 'job.viewResult',        color: 'var(--c-result)' },
  ANSWER_KEY: { key: 'job.viewAnswerKey',     color: 'var(--c-answer)' },
};

function DateRow({ label, value, color }) {
  if (!value) return null;
  return (
    <tr>
      <th scope="row">{label}</th>
      <td style={{ color }}>{formatDate(value)}</td>
    </tr>
  );
}

// Bordered table with a coloured caption bar — the format this audience
// reads fastest, and the one they'll screenshot and forward on WhatsApp.
function TableBlock({ caption, children }) {
  return (
    <div className="table-block">
      <table className="dtable">
        <caption>{caption}</caption>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * A block of related exam content, with a way through to the full listing.
 *
 * Returns null on an empty list rather than rendering an empty state. On a
 * listing page "nothing here yet" is information; on a job page it is four
 * headings of noise between the reader and the apply button.
 *
 * The "View all" link is the point of these blocks beyond convenience — it is an
 * internal link from the pages that receive the WhatsApp traffic to the pages
 * meant to rank long-term, pre-filtered to the exam the reader is already
 * looking at.
 */
function RelatedBlock({ title, rows, href, note, children }) {
  const { t } = useLang();
  if (!rows || rows.length === 0) return null;

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span>{title}</span>
        {href && (
          <Link href={href} className="small" style={{ color: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {t('home.viewAll')} →
          </Link>
        )}
      </div>
      {note && <p className="small muted" style={{ padding: '8px 12px 0', margin: 0 }}>{note}</p>}
      {children}
    </div>
  );
}

// The five related lists start empty so the primary job details can render first.
export default function JobDetail({
  job,
  notices: initialNotices = [],
  syllabi: initialSyllabi = [],
  cutoffs: initialCutoffs = [],
  calendar: initialCalendar = [],
  papers: initialPapers = [],
  backendError,
}) {
  const { t, lang } = useLang();

  const [views, setViews] = useState(job?.views ?? null);
  const [related, setRelated] = useState({
    notices: initialNotices,
    syllabi: initialSyllabi,
    cutoffs: initialCutoffs,
    calendar: initialCalendar,
    papers: initialPapers,
  });

  useEffect(() => {
    if (!job?.id) return undefined;

    let cancelled = false;
    // Clear data from the previous job during client-side navigation, then
    // fetch all supporting blocks in parallel without blocking the main page.
    setRelated({ notices: [], syllabi: [], cutoffs: [], calendar: [], papers: [] });
    fetchForJob(job.id).then(data => {
      if (!cancelled) setRelated(data);
    });

    return () => { cancelled = true; };
  }, [job?.id]);

  useEffect(() => {
    if (!job?.id) return;
    let cancelled = false;
    fetch(`${API_URL}/jobs/${job.id}/view`, { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled && data) setViews(data.views); })
      .catch(() => { /* the counter is cosmetic — never break the page */ });
    return () => { cancelled = true; };
  }, [job?.id]);

  const {
    notices: loadedNotices,
    syllabi: loadedSyllabi,
    cutoffs: loadedCutoffs,
    calendar: loadedCalendar,
    papers: loadedPapers,
  } = related;

  // Keep the existing render variables readable while the values now come from
  // client-side supporting-content state.
  const notices = loadedNotices;
  const syllabi = loadedSyllabi;
  const cutoffs = loadedCutoffs;
  const calendar = loadedCalendar;
  const papers = loadedPapers;

  // Share row is the growth loop for this audience, so it must be in the
  // server HTML rather than appearing after hydration. Build the URL from
  // localeUrl (same helper the canonical tag and JSON-LD already use) instead
  // of reading window.location on the client -- and in the reader's own
  // language, because a Hindi reader forwarding a link to a Hindi-reading
  // friend should not be handing them the English page.
  const canonicalPath = jobHref(job);
  const pageUrl = localeUrl(canonicalPath, lang);

  if (backendError) {
    return (
      <div>
        {/* This branch used to render no SeoHead, so the response carried no
            title, no description and no canonical — a browser tab showing a raw
            URL, and a share preview with nothing in it. noIndex is not set: the
            response is a 503, which already tells a crawler to keep what it has
            and come back, and a noindex served during a few minutes of downtime
            can outlive the outage. */}
        <SeoHead title={t('error.pageTitle')} description={t('error.pageBody')} />
        <Header />
        <div className="container" style={{ paddingTop: 20 }}>
          <div className="panel">
            <h1 className="panel-head">{t('error.pageTitle')}</h1>
            <p style={{ padding: 14, margin: 0 }}>
              {t('error.pageBody')}{' '}
              <Link href="/latest-jobs">{t('error.browseLatest')}</Link>.
            </p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const banner = STATUS_BANNERS[job.status] || STATUS_BANNERS.CLOSED;
  const daysLeft = daysUntil(job.lastDate);
  const hasFees = Object.keys(job.feeByCategory || {}).length > 0;
  const hasRelaxations = Object.keys(job.ageRelaxationByCategory || {}).length > 0;
  const upcomingDatesAreExpected = job.status === 'UPCOMING';

  // Link out to the landing pages this posting belongs to. This is the internal
  // link that matters most on the site: the detail pages are where the inbound
  // WhatsApp traffic lands, and these two links are what turn that traffic into
  // crawl signal for the pages meant to rank long-term.
  const categoryLanding = landingForCategory(job.category);
  const stateLanding = job.state ? landingForState(job.state) : null;

  // The department and state names in the reader's language. categoryLabel()
  // returns the English dropdown label, which is the wrong string on a Hindi
  // page; the landing objects already carry the written Hindi, every category
  // has a landing, and reusing them means this page and the landing page it
  // links to cannot disagree about what the department is called.
  const categoryText = landingText(categoryLanding, lang);
  const stateText = landingText(stateLanding, lang);
  const categoryName = categoryText.name || job.category;
  const stateName = stateText.name || job.state;

  // updatedAt is a timestamp; formatDate takes a plain date, so cut the time off
  // rather than showing an hour that is only meaningful in the server's zone.
  const updatedLabel = formatDate((job.updatedAt || job.createdAt || '').split('T')[0]);

  // Where each related block's "View all" goes. Pre-filtered to this posting's
  // department, because an unfiltered listing page is a worse destination than no
  // link at all -- the reader came here for one exam.
  //
  // The papers link filters by exam name instead, taken from the papers
  // themselves: ?exam= is matched whole-value on the server, so it has to be a
  // name that exists rather than one assembled from the post title. Without one,
  // fall back to the unfiltered page rather than emitting ?exam=undefined.
  //
  // The calendar link keeps that page's upcoming-only default. A held exam in the
  // block above will not appear on the other side of the link, which is the right
  // trade: "view all" from a job page means "what else is coming up", and the
  // calendar page carries its own visible toggle for the history.
  const papersExam = papers.find(p => p.examName)?.examName || null;
  const papersHref = papersExam
    ? `/previous-year-papers?exam=${encodeURIComponent(papersExam)}`
    : '/previous-year-papers';
  const byCategory = path => (job.category ? `${path}?category=${job.category}` : path);

  // One factual line about the posting, built once and used by both the meta
  // description and the JSON-LD description so the two cannot drift apart.
  //
  // It exists mainly to give the structured data a floor. The description used
  // to be `[eligibility, selectionProcess].join() || postName`, and a row
  // imported from a CSV without those two columns therefore described itself as
  // nothing but its own title. Google reads a JobPosting description as the
  // substance of the posting and rejects the thin ones from the jobs experience,
  // so the fallback has to carry real facts — and organisation, vacancy count
  // and closing date are three the row always has.
  const summaryLine = `${job.organization} — ${job.totalPosts ? `${job.totalPosts} posts · ` : ''}${t('job.lastDate')}: ${formatDate(job.lastDate)}.`;
  const metaDescription = `${summaryLine}${job.eligibility ? ` ${job.eligibility.slice(0, 120)}` : ''}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.postName,
    description: [summaryLine, job.eligibility, job.selectionProcess].filter(Boolean).join('\n\n'),
    hiringOrganization: {
      '@type': 'Organization',
      name: job.organization,
      // sameAs is how a search engine ties "Staff Selection Commission" here to
      // the same body named on a hundred other sites instead of treating it as a
      // string this site made up. officialSource is a bare domain the backend
      // already derives from the notification link, so this is the row's own
      // data and not a guess.
      ...(job.officialSource && { sameAs: `https://${job.officialSource}` }),
    },
    jobLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressCountry: 'IN', ...(job.state && { addressRegion: job.state }) },
    },
    // Who may apply, which is a separate claim from where the work is. Every
    // posting on this site is an Indian government recruitment open to Indian
    // applicants, so this is stated rather than left to be inferred from
    // addressCountry — a reader in another country is told plainly.
    applicantLocationRequirements: { '@type': 'Country', name: 'India' },
    datePosted: job.applicationStartDate || new Date().toISOString().split('T')[0],
    // End of the closing day, not the start of it.
    //
    // A date-only validThrough is read as midnight at the beginning of that
    // date, so a form that accepts applications all day on the 30th would be
    // dropped from Google's jobs experience for the whole of the 30th — the one
    // day the listing matters most. The explicit time moves expiry to the end of
    // that day, which is what "last date" means on the page.
    //
    // Guarded even though last_date is NOT NULL in the schema: the cost of the
    // guard is nothing, and the cost of being wrong is the literal string
    // "nullT23:59:59+05:30" in the structured data, which invalidates the whole
    // block rather than just one field.
    ...(job.lastDate && { validThrough: `${job.lastDate}T23:59:59+05:30` }),
    // An assumption, and worth naming as one: most sarkari recruitment is
    // permanent full-time, but apprentice and contract notices exist and the Job
    // entity has no column that distinguishes them. FULL_TIME is the right
    // default for the majority; it becomes a real field the day the schema gains
    // one.
    employmentType: 'FULL_TIME',
    url: pageUrl,
    ...(job.totalPosts != null && { totalJobOpenings: job.totalPosts }),
    // Google drops a JobPosting from the jobs experience once validThrough has
    // passed, which is correct -- but it also wants to know the page is still
    // maintained, and dateModified is how that is stated.
    ...(job.updatedAt && { dateModified: job.updatedAt }),
    // Unconditional, and it used to hang off officialApplyLink.
    //
    // directApply answers "does this URL land on the application form?", and for
    // this site the answer is no on every posting — it is an information page
    // that links out to the department's portal. Tying it to whether we happen to
    // hold that outbound link meant a row without one asserted nothing, and a
    // JobPosting with no directApply is treated as unknown.
    directApply: false,
    // The advertisement number is the identifier the notice itself uses and the
    // one a candidate would quote, so it is preferred over this site's own
    // primary key. The id remains the fallback so the field is never absent.
    identifier: {
      '@type': 'PropertyValue',
      name: job.organization,
      value: job.advertisementNo || String(job.id),
    },
  };

  // Breadcrumb markup so the search result shows "Home › SSC Jobs › <post>"
  // instead of a bare URL. It has to mirror the visible trail above, which is
  // why it is built from the same landing lookup rather than hardcoded -- and
  // from the same localised strings, so the Hindi page's breadcrumb does not
  // read "Home" in the middle of a Hindi result.
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('nav.home'), item: localeUrl('/', lang) },
      ...(categoryLanding
        ? [{ '@type': 'ListItem', position: 2, name: categoryText.heading, item: localeUrl(`/${categoryLanding.slug}`, lang) }]
        : [{ '@type': 'ListItem', position: 2, name: t('nav.all'), item: localeUrl('/jobs', lang) }]),
      { '@type': 'ListItem', position: 3, name: job.postName, item: pageUrl },
    ],
  };

  return (
    <div>
      <Header />
      <SeoHead
        title={job.postName}
        description={metaDescription}
        canonical={canonicalPath}
        ogType="article"
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(breadcrumbLd) }} />

      <div className="container" style={{ paddingBottom: 20 }}>
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">{t('nav.home')}</Link> ›{' '}
          {categoryLanding
            ? <Link href={`/${categoryLanding.slug}`}>{categoryText.heading}</Link>
            : <Link href="/jobs">{t('nav.all')}</Link>} › {job.postName}
        </nav>

        <div className="page-head">
          <h1>{job.postName}</h1>
          <p>
            {job.organization} · {categoryName}
            {job.advertisementNo && <> · {t('job.advtNo')} {job.advertisementNo}</>}
            {stateName && <> · {stateName}</>}
          </p>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <span style={{
              background: banner.bg, color: banner.fg, border: `1px solid ${banner.border}`,
              borderRadius: 4, padding: '5px 12px', fontWeight: 700, fontSize: '0.88rem',
            }}>
              {t(banner.key)}
              {job.status === 'ACTIVE' && daysLeft !== null && daysLeft >= 0 && (
                <> — {daysLeft === 0 ? t('row.lastDayToday') : daysLeft === 1 ? t('row.dayLeft') : t('row.daysLeft', { n: daysLeft })}</>
              )}
            </span>
            {views != null && views > 0 && (
              <span className="small muted">👁 {formatViews(views)} {t('job.views')}</span>
            )}
          </div>

          {/* Attribution and freshness.
              This category is full of sites that copy a notification, add
              nothing, and give a reader no way to tell how old the page is.
              Naming the government host the details came from and stating when
              the page was last touched is the cheapest credibility on the site,
              and it is also what stops someone acting on a stale last date. */}
          {(job.officialSource || updatedLabel) && (
            <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
              {job.officialSource && <>{t('job.source')}: <strong>{job.officialSource}</strong></>}
              {job.officialSource && updatedLabel && ' · '}
              {updatedLabel && <>{t('job.lastUpdated')}: {updatedLabel}</>}
            </p>
          )}
        </div>

        {/* Apply CTA sits above the tables: the page's job is to get people
            onto the official form before the last date. */}
        <div className="btn-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {job.officialApplyLink && job.status !== 'CLOSED' && (
            <a href={job.officialApplyLink} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ flex: '1 1 220px' }}>
              {t('job.apply')} ↗
            </a>
          )}
          {job.notificationPdfUrl && (
            <a href={job.notificationPdfUrl} target="_blank" rel="noopener noreferrer" className="btn-primary btn-secondary" style={{ flex: '1 1 160px' }}>
              📄 {t('job.notificationPdf')}
            </a>
          )}
          {job.syllabusLink && (
            <a href={job.syllabusLink} target="_blank" rel="noopener noreferrer" className="btn-primary btn-secondary" style={{ flex: '1 1 140px' }}>
              📚 {t('job.syllabus')}
            </a>
          )}
        </div>

        <div className="stat-strip">
          {job.totalPosts != null && (
            <div className="stat">
              <div className="stat-label">{t('job.totalPosts')}</div>
              <div className="stat-value">{job.totalPosts.toLocaleString('en-IN')}</div>
            </div>
          )}
          {job.lastDate && <div className="stat">
            <div className="stat-label">{upcomingDatesAreExpected ? 'Expected last date' : t('job.lastDate')}</div>
            <div className="stat-value" style={{ color: DATE_COLORS.last }}>{formatDate(job.lastDate)}</div>
          </div>}
          {job.ageMin != null && job.ageMax != null && (
            <div className="stat">
              <div className="stat-label">{t('job.ageLimit')}</div>
              <div className="stat-value">{job.ageMin}–{job.ageMax} {t('job.years')}</div>
            </div>
          )}
        </div>

        {loadedNotices.length > 0 && (
          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-head">{t('job.latestUpdates')}</div>
            <div className="linklist">
              {loadedNotices.map(n => {
                const a = NOTICE_ACTION[n.type] || NOTICE_ACTION.RESULT;
                return <NoticeRow key={n.id} notice={n} actionLabel={t(a.key)} color={a.color} />;
              })}
            </div>
          </div>
        )}

        <TableBlock caption={`📅 ${t('job.importantDates')}`}>
          <DateRow label={upcomingDatesAreExpected ? 'Expected application start' : t('job.dateStart')} value={job.applicationStartDate} color={DATE_COLORS.start} />
          <DateRow label={upcomingDatesAreExpected ? 'Expected last date' : t('job.dateLast')} value={job.lastDate} color={DATE_COLORS.last} />
          <DateRow label={t('job.dateAdmit')} value={job.admitCardDate}        color={DATE_COLORS.admitCard} />
          <DateRow label={t('job.dateExam')}  value={job.examDate}             color={DATE_COLORS.exam} />
          <DateRow label={t('job.dateResult')} value={job.resultDate}          color={DATE_COLORS.result} />
        </TableBlock>

        {/* The calendar block, not a second copy of job.examDate above it. A
            posting has one exam-date field and a selection process can have
            three stages with three dates; this is where those fit, each with
            its own tentative flag. */}
        <RelatedBlock title={`🗓️ ${t('job.examSchedule')}`} rows={calendar} href={byCategory('/exam-calendar')}>
          <CalendarTable entries={loadedCalendar} />
        </RelatedBlock>

        {hasFees && (
          <TableBlock caption={`💰 ${t('job.applicationFee')}`}>
            {Object.entries(job.feeByCategory).map(([cat, amount]) => (
              <tr key={cat}>
                <th scope="row">{cat.replace(/_/g, '/')}</th>
                <td>{Number(amount) === 0 ? t('job.noFee') : `₹${amount}`}</td>
              </tr>
            ))}
          </TableBlock>
        )}

        {hasRelaxations && (
          <TableBlock caption={`🎂 ${t('job.ageRelaxation')}`}>
            {Object.entries(job.ageRelaxationByCategory).map(([cat, years]) => (
              <tr key={cat}>
                <th scope="row">{cat.replace(/_/g, '/')}</th>
                <td>{t('job.plusYears', { n: years })}</td>
              </tr>
            ))}
          </TableBlock>
        )}

        {job.eligibility && (
          <div className="table-block">
            <div className="panel-head">🎓 {t('job.eligibility')}</div>
            <p style={{ whiteSpace: 'pre-line', padding: '10px 12px', margin: 0, background: '#fff' }}>
              {job.eligibility}
            </p>
          </div>
        )}

        {job.selectionProcess && (
          <div className="table-block">
            <div className="panel-head">✅ {t('job.selectionProcess')}</div>
            <p style={{ whiteSpace: 'pre-line', padding: '10px 12px', margin: 0, background: '#fff' }}>
              {job.selectionProcess}
            </p>
          </div>
        )}

        {/* The prep material, in the order it gets used: what is on the paper,
            what the paper looked like, and what score cleared it. All three are
            posted per exam rather than per posting, which is why they come from
            the /for-job endpoints rather than a column on the job. */}
        <RelatedBlock title={`📚 ${t('job.syllabusFor')}`} rows={syllabi} href={byCategory('/syllabus')}>
          <div className="linklist">
            {loadedSyllabi.map(s => <SyllabusRow key={s.id} syllabus={s} />)}
          </div>
        </RelatedBlock>

        <RelatedBlock title={`📄 ${t('job.pastPapers')}`} rows={papers} href={papersHref}>
          <div className="linklist">
            {loadedPapers.map(p => <PaperRow key={p.id} paper={p} />)}
          </div>
        </RelatedBlock>

        {/* The note is not a disclaimer for its own sake. Previous years' marks
            printed on a page about this year's vacancy is the single most
            misreadable thing on the site -- someone screenshots "GEN 148.20" off
            an open posting and treats it as the score to beat. Saying which
            cycle the numbers came from costs one line. */}
        <RelatedBlock
          title={`📊 ${t('job.pastCutOffs')}`}
          rows={cutoffs}
          href={byCategory('/cut-off')}
          note={t('job.pastCutOffsNote')}
        >
          <div className="linklist">
            {loadedCutoffs.map(c => <CutoffRow key={c.id} cutoff={c} />)}
          </div>
        </RelatedBlock>

        {/* Important links repeated as a table — this is the block people
            scroll to the bottom looking for. */}
        <TableBlock caption={`🔗 ${t('job.importantLinks')}`}>
          {job.officialApplyLink && job.status !== 'CLOSED' && (
            <tr>
              <th scope="row">{t('job.applyOnline')}</th>
              <td><a href={job.officialApplyLink} target="_blank" rel="noopener noreferrer">{t('job.clickHere')} ↗</a></td>
            </tr>
          )}
          {job.notificationPdfUrl && (
            <tr>
              <th scope="row">{t('job.officialNotification')}</th>
              <td><a href={job.notificationPdfUrl} target="_blank" rel="noopener noreferrer">{t('job.downloadPdf')} ↗</a></td>
            </tr>
          )}
          {job.syllabusLink && (
            <tr>
              <th scope="row">{t('job.syllabus')}</th>
              <td><a href={job.syllabusLink} target="_blank" rel="noopener noreferrer">{t('job.viewSyllabus')} ↗</a></td>
            </tr>
          )}
          <tr>
            <th scope="row">{t('job.moreCategory', { name: categoryName })}</th>
            <td>
              {categoryLanding
                ? <Link href={`/${categoryLanding.slug}`}>{categoryText.heading}</Link>
                : <Link href={`/jobs?category=${job.category}`}>{t('job.browseAll')}</Link>}
            </td>
          </tr>
          {stateLanding && (
            <tr>
              <th scope="row">{t('job.allStateVacancies', { state: stateName })}</th>
              <td><Link href={`/${stateLanding.slug}`}>{stateText.heading}</Link></td>
            </tr>
          )}
        </TableBlock>

        <ShareButtons title={job.postName} url={pageUrl} />
      </div>

      <Footer />
    </div>
  );
}
