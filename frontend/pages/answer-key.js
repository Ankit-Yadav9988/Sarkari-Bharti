import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import Pagination from '../components/Pagination';
import { NoticeRow, SectionList } from '../components/rows';
import { fetchNotices } from '../lib/api';
import { setListingCache } from '../lib/cache';
import { paginatedCanonical } from '../lib/site';
import { useLang } from '../lib/i18n';

export async function getServerSideProps({ query, res }) {
  const { items, page, totalPages, backendError } =
    await fetchNotices({ type: 'ANSWER_KEY', page: query.page });
  setListingCache(res, { backendError });
  return { props: { notices: items, page, totalPages, backendError } };
}

export default function AnswerKey({ notices, page, totalPages, backendError }) {
  const { t } = useLang();
  return (
    <div>
      <SeoHead
        title={t('seo.answerKey.title')}
        description={t('seo.answerKey.desc')}
        canonical={paginatedCanonical('/answer-key', page)}
      />
      <Header />
      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <div className="page-head" style={{ borderTopColor: 'var(--c-answer)' }}>
          <h1 style={{ color: 'var(--c-answer)' }}>🗝️ {t('nav.answerKey')}</h1>
          <p>{t('page.answerKey.sub')}</p>
        </div>
        {backendError && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4 }}>{t('error.listings')}</p>}
        <SectionList emptyText={t('empty.answerKey')}>
          {notices.map(n => (
            <NoticeRow key={n.id} notice={n} actionLabel={t('action.view')} color="var(--c-answer)" />
          ))}
        </SectionList>
        <Pagination page={page} totalPages={totalPages} basePath="/answer-key" />
      </div>
      <Footer />
    </div>
  );
}
