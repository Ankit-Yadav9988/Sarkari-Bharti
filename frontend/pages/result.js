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
  const [resultRes, answerRes] = await Promise.all([
    fetchNotices({ type: 'RESULT', page: query.page }),
    // The answer-key strip below is a teaser for /answer-key, so it asks for
    // exactly the ten rows it shows rather than a page it would slice.
    fetchNotices({ type: 'ANSWER_KEY', size: 10 }),
  ]);
  setListingCache(res, { backendError: resultRes.backendError });
  return {
    props: {
      results: resultRes.items,
      page: resultRes.page,
      totalPages: resultRes.totalPages,
      answerKeys: answerRes.items,
      backendError: resultRes.backendError,
    },
  };
}

export default function Result({ results, page, totalPages, answerKeys, backendError }) {
  const { t } = useLang();
  return (
    <div>
      <SeoHead
        title={t('seo.result.title')}
        description={t('seo.result.desc')}
        canonical={paginatedCanonical('/result', page)}
      />
      <Header />
      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <div className="page-head" style={{ borderTopColor: 'var(--c-result)' }}>
          <h1 style={{ color: 'var(--c-result)' }}>📜 {t('home.result')}</h1>
          <p>{t('page.result.sub')}</p>
        </div>
        {backendError && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4 }}>{t('error.listings')}</p>}

        <SectionList emptyText={t('empty.result')}>
          {results.map(n => (
            <NoticeRow key={n.id} notice={n} actionLabel={t('action.view')} color="var(--c-result)" />
          ))}
        </SectionList>
        <Pagination page={page} totalPages={totalPages} basePath="/result" />

        {answerKeys.length > 0 && (
          <>
            <div className="page-head" style={{ borderTopColor: 'var(--c-answer)', marginTop: 18 }}>
              {/* h2, not h1. This page is about results; answer keys are a
                  related block on it. Two h1s on one page leaves a crawler to
                  guess which one names the page, and the guess is not always the
                  first — the reliable version is one h1 and a subordinate
                  heading. Visually identical: the size was already overridden
                  here, so nothing moves. */}
              <h2 style={{ color: 'var(--c-answer)', fontSize: '1.15rem' }}>🗝️ {t('nav.answerKey')}</h2>
              <p>{t('page.result.answerSub')}</p>
            </div>
            <SectionList emptyText="">
              {answerKeys.map(n => (
                <NoticeRow key={n.id} notice={n} actionLabel={t('action.view')} color="var(--c-answer)" />
              ))}
            </SectionList>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
