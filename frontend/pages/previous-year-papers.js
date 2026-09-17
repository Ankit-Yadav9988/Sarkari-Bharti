import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import Pagination from '../components/Pagination';
import ListingFilters from '../components/ListingFilters';
import { PaperRow } from '../components/rows';
import { fetchPapers, fetchExamYears, CATEGORIES } from '../lib/api';
import { setListingCache } from '../lib/cache';
import { paginatedCanonical } from '../lib/site';
import { useLang } from '../lib/i18n';

export async function getServerSideProps({ query, res }) {
  const category = CATEGORIES.some(c => c.value === query.category) ? query.category : null;
  const examYear = /^\d{4}$/.test(query.examYear || '') ? Number(query.examYear) : null;

  // examName is passed through as typed. It is matched case-insensitively and
  // whole-value on the server, so an unrecognised name returns nothing rather
  // than everything — which is the safe direction for a filter in a URL.
  const examName = typeof query.exam === 'string' && query.exam.trim() ? query.exam.trim() : null;

  const [list, years] = await Promise.all([
    fetchPapers({ category, examYear, examName, page: query.page }),
    fetchExamYears('papers'),
  ]);

  setListingCache(res, { backendError: list.backendError });
  return {
    props: {
      papers: list.items,
      page: list.page,
      totalPages: list.totalPages,
      backendError: list.backendError,
      category,
      examYear,
      examName,
      years,
    },
  };
}

export default function PreviousYearPapersPage({
  papers, page, totalPages, backendError, category, examYear, examName, years,
}) {
  const router = useRouter();
  const { t } = useLang();

  function setFilter(next) {
    const merged = { category, examYear, examName, ...next };
    const q = {};
    if (merged.category) q.category = merged.category;
    if (merged.examYear) q.examYear = merged.examYear;
    if (merged.examName) q.exam = merged.examName;
    router.push({ pathname: '/previous-year-papers', query: q });
  }

  const query = {};
  if (category) query.category = category;
  if (examYear) query.examYear = examYear;
  if (examName) query.exam = examName;

  // "SSC CGL Previous Year Question Papers" when an exam is picked. The exam name
  // in front of the generic title is the whole difference between this page
  // ranking for a real query and ranking for nothing.
  const title = [examName, t('seo.papers.title'), examYear].filter(Boolean).join(' ');

  return (
    <div>
      <SeoHead
        title={title}
        description={t('seo.papers.desc')}
        canonical={paginatedCanonical('/previous-year-papers', page)}
      />
      <Header />
      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <div className="page-head" style={{ borderTopColor: 'var(--c-papers)' }}>
          <h1 style={{ color: 'var(--c-papers)' }}>📄 {t('nav.papers')}</h1>
          <p>{t('page.papers.sub')}</p>
        </div>

        <ListingFilters category={category} years={years} examYear={examYear} onChange={setFilter}>
          {/* Only shown while an exam filter is active, and only as a way out of
              it. There is no exam picker: the list of exam names is unbounded, and
              the way people reach this filtered view is from the exam's own job
              page, not from a dropdown here. */}
          {examName && (
            <button className="chip chip-active" onClick={() => setFilter({ examName: null })}>
              {examName} ✕
            </button>
          )}
        </ListingFilters>

        {backendError && (
          <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4 }}>{t('error.listings')}</p>
        )}

        <div className="panel">
          {papers.length === 0 ? (
            <p className="linklist-empty">{t('empty.papers')}</p>
          ) : (
            <div className="linklist">
              {papers.map(p => <PaperRow key={p.id} paper={p} />)}
            </div>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} basePath="/previous-year-papers" query={query} />
      </div>
      <Footer />
    </div>
  );
}

// PaperRow moved to components/rows.js — the job detail page lists this exam's
// past papers off /api/papers/for-job/{id}, and the answer-key button has to look
// and behave the same in both places.
