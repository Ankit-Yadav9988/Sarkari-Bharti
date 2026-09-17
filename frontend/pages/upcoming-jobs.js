import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import Pagination from '../components/Pagination';
import { UpcomingJobRow, SectionList } from '../components/rows';
import { fetchJobs, jobHref } from '../lib/api';
import { setListingCache } from '../lib/cache';
import { paginatedCanonical } from '../lib/site';
import { collectionPageJsonLd, ldScript } from '../lib/jsonld';
import { useLang } from '../lib/i18n';

export async function getServerSideProps({ query, res }) {
  // sort=opening: soonest-opening first, which is what someone planning ahead
  // wants. It has to be the backend's ordering, not a sort here -- reordering
  // one page of twenty says nothing about where a row belongs overall.
  const { items, page, totalPages, totalItems, backendError } =
    await fetchJobs({ status: 'UPCOMING', sort: 'opening', page: query.page });
  setListingCache(res, { backendError });
  return { props: { jobs: items, page, totalPages, total: totalItems, backendError } };
}

export default function UpcomingJobs({ jobs, page, totalPages, total, backendError }) {
  const { t, lang } = useLang();
  return (
    <div>
      <SeoHead
        title={t('seo.upcoming.title')}
        description={t('seo.upcoming.desc')}
        canonical={paginatedCanonical('/upcoming-jobs', page)}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldScript(collectionPageJsonLd({
            name: t('seo.upcoming.title'),
            description: t('seo.upcoming.desc'),
            path: paginatedCanonical('/upcoming-jobs', page),
            lang,
            total,
            items: jobs.map(j => ({ name: j.postName, path: jobHref(j) })),
          })),
        }}
      />
      <Header />
      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <div className="page-head">
          <h1>🔔 {t('home.upcoming')}</h1>
          <p>{t('page.upcoming.sub')}{total > 0 && ` — ${t('page.onTheWay', { n: total })}`}</p>
        </div>
        {backendError && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4 }}>{t('error.listings')}</p>}
        <SectionList emptyText={t('empty.upcoming')}>
          {jobs.map(job => <UpcomingJobRow key={job.id} job={job} />)}
        </SectionList>
        <Pagination page={page} totalPages={totalPages} basePath="/upcoming-jobs" />
      </div>
      <Footer />
    </div>
  );
}
