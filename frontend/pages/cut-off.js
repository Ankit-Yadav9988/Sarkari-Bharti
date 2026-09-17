import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import Pagination from '../components/Pagination';
import ListingFilters from '../components/ListingFilters';
import { CutoffRow } from '../components/rows';
import { fetchCutoffs, fetchExamYears, CATEGORIES } from '../lib/api';
import { setListingCache } from '../lib/cache';
import { paginatedCanonical } from '../lib/site';
import { useLang } from '../lib/i18n';

export async function getServerSideProps({ query, res }) {
  const category = CATEGORIES.some(c => c.value === query.category) ? query.category : null;
  // Parsed here rather than passed through: a hand-edited ?examYear=abc would
  // otherwise reach the backend as a bad Integer and turn a typo into a 400.
  const examYear = /^\d{4}$/.test(query.examYear || '') ? Number(query.examYear) : null;

  const [list, years] = await Promise.all([
    fetchCutoffs({ category, examYear, page: query.page }),
    fetchExamYears('cutoffs'),
  ]);

  setListingCache(res, { backendError: list.backendError });
  return {
    props: {
      cutoffs: list.items,
      page: list.page,
      totalPages: list.totalPages,
      backendError: list.backendError,
      category,
      examYear,
      years,
    },
  };
}

export default function CutOffPage({ cutoffs, page, totalPages, backendError, category, examYear, years }) {
  const router = useRouter();
  const { t } = useLang();

  // Filters live in the URL so a link to "SSC 2025 cut off" is shareable, and so
  // the server-side filtering and the page numbers agree with each other.
  function setFilter(next) {
    const merged = { category, examYear, ...next };
    const q = {};
    if (merged.category) q.category = merged.category;
    if (merged.examYear) q.examYear = merged.examYear;
    router.push({ pathname: '/cut-off', query: q });
  }

  // The year in the title, when one is selected. "cut off 2025" is how the query
  // is typed, and a page whose title omits the year it is actually showing is
  // competing for the wrong search.
  const title = examYear
    ? `${t('seo.cutOff.title')} ${examYear}`
    : t('seo.cutOff.title');

  const query = {};
  if (category) query.category = category;
  if (examYear) query.examYear = examYear;

  return (
    <div>
      <SeoHead
        title={title}
        description={t('seo.cutOff.desc')}
        canonical={paginatedCanonical('/cut-off', page)}
      />
      <Header />
      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <div className="page-head" style={{ borderTopColor: 'var(--c-cutoff)' }}>
          <h1 style={{ color: 'var(--c-cutoff)' }}>📊 {t('nav.cutOff')}</h1>
          <p>{t('page.cutOff.sub')}</p>
        </div>

        <ListingFilters
          category={category}
          years={years}
          examYear={examYear}
          onChange={setFilter}
        />

        {backendError && (
          <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4 }}>{t('error.listings')}</p>
        )}

        <div className="panel">
          {cutoffs.length === 0 ? (
            <p className="linklist-empty">{t('empty.cutOff')}</p>
          ) : (
            <div className="linklist">
              {cutoffs.map(c => (
                <CutoffRow key={c.id} cutoff={c} />
              ))}
            </div>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} basePath="/cut-off" query={query} />
      </div>
      <Footer />
    </div>
  );
}

// CutoffRow moved to components/rows.js — the job detail page shows the previous
// years' cut offs for one posting off /api/cutoffs/for-job/{id}, and one row
// definition is what keeps the two pages from disagreeing about the marks.
