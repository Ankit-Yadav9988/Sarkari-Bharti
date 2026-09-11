import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import Pagination from '../components/Pagination';
import { NoticeRow, SectionList } from '../components/rows';
import { fetchNotices } from '../lib/api';
import { setListingCache } from '../lib/cache';
import { useLang } from '../lib/i18n';

export async function getServerSideProps({ query, res }) {
  const { items, page, totalPages, backendError } =
    await fetchNotices({ type: 'ADMIT_CARD', page: query.page });
  setListingCache(res, { backendError });
  return { props: { notices: items, page, totalPages, backendError } };
}

export default function AdmitCard({ notices, page, totalPages, backendError }) {
  const { t } = useLang();
  return (
    <div>
      <SeoHead
        title={t('seo.admitCard.title')}
        description={t('seo.admitCard.desc')}
        canonical="/admit-card"
      />
      <Header />
      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <div className="page-head" style={{ borderTopColor: 'var(--c-admit)' }}>
          <h1 style={{ color: 'var(--c-admit)' }}>🪪 {t('home.admitCard')}</h1>
          <p>{t('page.admitCard.sub')}</p>
        </div>
        {backendError && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4 }}>{t('error.listings')}</p>}
        <SectionList emptyText={t('empty.admitCard')}>
          {notices.map(n => (
            <NoticeRow key={n.id} notice={n} actionLabel={t('action.download')} color="var(--c-admit)" />
          ))}
        </SectionList>
        <Pagination page={page} totalPages={totalPages} basePath="/admit-card" />
      </div>
      <Footer />
    </div>
  );
}
