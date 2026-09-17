import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import Pagination from '../components/Pagination';
import { AllJobsRow, SectionList } from '../components/rows';
import { fetchJobs, jobHref } from '../lib/api';
import { setListingCache } from '../lib/cache';
import { findLanding, categoryLandings, stateLandings, landingText } from '../lib/landings';
import { SITE } from '../lib/site';
import { collectionPageJsonLd, ldScript } from '../lib/jsonld';
import { useLang } from '../lib/i18n';

/**
 * One route serving every category and state landing page.
 *
 * This sits at the root of pages/, so it is the last thing Next tries: a request
 * for /about, /result or /jobs/5 matches its own file first, and only an
 * otherwise-unmatched single-segment path arrives here. An unrecognised slug
 * returns notFound, which renders the same 404 the request would have got
 * anyway -- so the catch-all position costs nothing and buys clean URLs.
 *
 * Both languages come out of this one route. Next's i18n routing means /ssc-jobs
 * and /hi/ssc-jobs both land here with the same params, and the landing object
 * carries both languages' copy, so nothing about the data fetch changes -- the
 * only thing the locale decides is which strings get rendered.
 */
export async function getServerSideProps({ params, query, res }) {
  const landing = findLanding(params.landing);
  if (!landing) return { notFound: true };

  const { items, page, totalPages, totalItems, backendError } =
    await fetchJobs({ ...landing.filter, page: query.page });

  setListingCache(res, { backendError });

  return {
    props: {
      landing, jobs: items, page, totalPages, total: totalItems, backendError,
    },
  };
}

export default function Landing({ landing, jobs, page, totalPages, total, backendError }) {
  const { t, lang } = useLang();
  const path = `/${landing.slug}`;

  // The landing object holds { en, hi } per field; this resolves them once for
  // the locale being rendered. Doing it here rather than in getServerSideProps
  // is what lets a client-side language switch re-render the same props.
  const text = landingText(landing, lang);

  // Page 2 and beyond canonicalise to themselves, not to page 1: pointing them
  // at page 1 tells Google the postings on them do not exist.
  const canonicalPath = page > 1 ? `${path}?page=${page}` : path;

  // The JSON-LD url and the canonical tag have to be the same string on both
  // languages. They used to be composed separately here, which is how a Hindi
  // page ends up with a canonical of /hi/ssc-jobs and structured data claiming to
  // be /ssc-jobs -- two contradictory answers to "which page is this", and the
  // crawler is under no obligation to pick the right one. Both are now derived
  // from canonicalPath: SeoHead runs it through localeUrl, and so does
  // collectionPageJsonLd, so there is no second composition to get wrong.

  // Sibling landings as a link grid at the bottom. Internal links are how these
  // pages get crawled at all -- a page reachable only from the sitemap tends to
  // be indexed late and ranked low -- and for a visitor whose exam is not on
  // this page it is the fastest route to the one that is.
  const siblings = (landing.kind === 'category' ? categoryLandings() : stateLandings())
    .filter(l => l.slug !== landing.slug);

  // ItemList tells Google this page is a list of postings and lets it show the
  // count; the postings themselves carry their own JobPosting markup on the
  // detail pages, so this deliberately does not duplicate it here.
  // Built by the shared helper, which every other listing page now uses too.
  // This block used to be written out longhand here and was the only
  // CollectionPage on the site; when the other listings needed one, copying it
  // ten times was the alternative. isPartOf and the numberOfItems fallback come
  // free from moving it.
  const jsonLd = collectionPageJsonLd({
    name: text.title,
    description: text.intro,
    path: canonicalPath,
    lang,
    total,
    items: jobs.map(j => ({ name: j.postName, path: jobHref(j) })),
  });

  return (
    <div>
      <SeoHead
        title={text.title}
        description={`${text.intro} ${t('landing.descSuffix')}`}
        canonical={canonicalPath}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(jsonLd) }} />
      <Header />

      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">{t('nav.home')}</Link> › <Link href="/jobs">{t('nav.all')}</Link> › {text.heading}
        </nav>

        <div className="page-head" style={{ borderTopColor: landing.accent }}>
          <h1>{text.heading}</h1>
          <p>
            {total > 1
              ? t('landing.count', { n: total })
              : total === 1
                ? t('landing.countOne')
                : t('landing.countZero')}
          </p>
        </div>

        {/* The intro paragraph is above the list on purpose: it is the only
            thing on the page that is not a link, and a page of nothing but
            links reads as thin to a crawler and as unexplained to a visitor. */}
        <p style={{ margin: '0 0 14px', lineHeight: 1.65 }}>{text.intro}</p>

        {backendError && (
          <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4 }}>
            {t('error.listingsShort')}
          </p>
        )}

        <SectionList emptyText={t('landing.empty', { name: text.name })}>
          {jobs.map(job => <AllJobsRow key={job.id} job={job} />)}
        </SectionList>

        <Pagination page={page} totalPages={totalPages} basePath={path} />

        {landing.kind === 'state' && (
          <p className="small muted" style={{ marginTop: 14 }}>
            {t('landing.centralPrompt')}{' '}
            <Link href="/central-government-jobs">{t('landing.centralLink')}</Link>.
          </p>
        )}

        <div className="panel" style={{ marginTop: 20 }}>
          <div className="panel-head">
            {landing.kind === 'category' ? t('landing.browseDepartment') : t('landing.browseState')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
            {siblings.map(l => (
              <Link key={l.slug} href={`/${l.slug}`} className="chip">
                {landingText(l, lang).name}
              </Link>
            ))}
          </div>
        </div>

        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head">{t('landing.alsoOn', { site: SITE.name })}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
            <Link href="/latest-jobs" className="chip">{t('nav.latest')}</Link>
            <Link href="/upcoming-jobs" className="chip">{t('nav.upcoming')}</Link>
            <Link href="/admit-card" className="chip">{t('nav.admitCard')}</Link>
            <Link href="/result" className="chip">{t('nav.result')}</Link>
            <Link href="/answer-key" className="chip">{t('nav.answerKey')}</Link>
            <Link href="/syllabus" className="chip">{t('nav.syllabus')}</Link>
            {landing.kind === 'category' && landing.filter.category && (
              <Link href={`/jobs?category=${landing.filter.category}`} className="chip">
                {t('landing.filterAll', { name: text.name })}
              </Link>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
