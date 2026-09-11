import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import Pagination from '../components/Pagination';
import { LatestJobRow, SectionList } from '../components/rows';
import { fetchJobs } from '../lib/api';
import { setListingCache } from '../lib/cache';
import { useLang } from '../lib/i18n';

export async function getServerSideProps({ query, res }) {
  const { items, page, totalPages, totalItems, backendError } =
    await fetchJobs({ status: 'ACTIVE', page: query.page });
  setListingCache(res, { backendError });
  return { props: { jobs: items, page, totalPages, total: totalItems, backendError } };
}

export default function LatestJobs({ jobs, page, totalPages, total, backendError }) {
  const { t } = useLang();
  return (
    <div>
      <SeoHead
        title={t('seo.latest.title')}
        description={t('seo.latest.desc')}
        canonical="/latest-jobs"
      />
      <Header />
      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <div className="page-head">
          <h1>📋 {t('home.latest')}</h1>
          <p>{t('page.latest.sub')}{total > 0 && ` — ${t('page.openCount', { n: total })}`}</p>
        </div>
        {backendError && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4 }}>{t('error.listings')}</p>}
        <SectionList emptyText={t('empty.latest')}>
          {jobs.map(job => <LatestJobRow key={job.id} job={job} />)}
        </SectionList>
        <Pagination page={page} totalPages={totalPages} basePath="/latest-jobs" />
      </div>
      <Footer />
    </div>
  );
}
