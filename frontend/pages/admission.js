import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import Pagination from '../components/Pagination';
import { LatestJobRow, SectionList } from '../components/rows';
import { fetchJobs } from '../lib/api';
import { setListingCache } from '../lib/cache';
import { useLang } from '../lib/i18n';

// Admissions are posted as jobs with category=ADMISSION, so the admin uses
// the same form and this page just filters on that category.
export async function getServerSideProps({ query, res }) {
  const { items, page, totalPages, backendError } =
    await fetchJobs({ category: 'ADMISSION', page: query.page });
  setListingCache(res, { backendError });
  return { props: { jobs: items, page, totalPages, backendError } };
}

export default function Admission({ jobs, page, totalPages, backendError }) {
  const { t } = useLang();
  return (
    <div>
      <SeoHead
        title={t('seo.admission.title')}
        description={t('seo.admission.desc')}
        canonical="/admission"
      />
      <Header />
      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <div className="page-head" style={{ borderTopColor: 'var(--c-admission)' }}>
          <h1 style={{ color: 'var(--c-admission)' }}>🎓 {t('nav.admission')}</h1>
          <p>{t('page.admission.sub')}</p>
        </div>
        {backendError && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4 }}>{t('error.listings')}</p>}
        <SectionList emptyText={t('empty.admission')}>
          {jobs.map(job => <LatestJobRow key={job.id} job={job} />)}
        </SectionList>
        <Pagination page={page} totalPages={totalPages} basePath="/admission" />
      </div>
      <Footer />
    </div>
  );
}
