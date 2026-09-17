import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import Pagination from '../components/Pagination';
import { SyllabusRow } from '../components/rows';
import { fetchSyllabi, CATEGORIES } from '../lib/api';
import { categoryName } from '../lib/landings';
import { setListingCache } from '../lib/cache';
import { paginatedCanonical } from '../lib/site';
import { useLang } from '../lib/i18n';

export async function getServerSideProps({ query, res }) {
  const category = CATEGORIES.some(c => c.value === query.category) ? query.category : null;
  const { items, page, totalPages, backendError } =
    await fetchSyllabi({ category, page: query.page });
  setListingCache(res, { backendError });
  return { props: { syllabi: items, page, totalPages, backendError, category } };
}

export default function SyllabusPage({ syllabi, page, totalPages, backendError, category }) {
  const router = useRouter();
  const { t, lang } = useLang();

  // The category filter lives in the URL (?category=SSC) so links are
  // shareable and pagination stays consistent with the server-filtered list.
  function setCat(next) {
    router.push({ pathname: '/syllabus', query: next ? { category: next } : {} });
  }

  return (
    <div>
      <SeoHead
        title={t('seo.syllabus.title')}
        description={t('seo.syllabus.desc')}
        canonical={paginatedCanonical('/syllabus', page)}
      />
      <Header />
      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <div className="page-head" style={{ borderTopColor: 'var(--c-syllabus)' }}>
          <h1 style={{ color: 'var(--c-syllabus)' }}>📚 {t('nav.syllabus')}</h1>
          <p>{t('page.syllabus.sub')}</p>
        </div>

        <div className="panel" style={{ marginBottom: 12 }}>
          <div style={{ padding: 10 }}>
            <div className="chip-row">
              <button className={!category ? 'chip chip-active' : 'chip'} onClick={() => setCat(null)}>{t('chip.all')}</button>
              {CATEGORIES.map(c => (
                <button key={c.value} className={category === c.value ? 'chip chip-active' : 'chip'} onClick={() => setCat(c.value)}>
                  {categoryName(c.value, lang)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {backendError && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4 }}>{t('error.listings')}</p>}

        <div className="panel">
          {syllabi.length === 0 ? (
            <p className="linklist-empty">{t('empty.syllabus')}</p>
          ) : (
            <div className="linklist">
              {syllabi.map(s => <SyllabusRow key={s.id} syllabus={s} />)}
            </div>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} basePath="/syllabus" query={category ? { category } : {}} />
      </div>
      <Footer />
    </div>
  );
}
