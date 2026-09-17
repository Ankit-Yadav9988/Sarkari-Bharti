import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import Pagination from '../components/Pagination';
import ListingFilters from '../components/ListingFilters';
import { CalendarTable } from '../components/rows';
import { fetchExamCalendar, fetchExamYears, CATEGORIES } from '../lib/api';
import { setListingCache } from '../lib/cache';
import { paginatedCanonical } from '../lib/site';
import { useLang } from '../lib/i18n';

export async function getServerSideProps({ query, res }) {
  const category = CATEGORIES.some(c => c.value === query.category) ? query.category : null;
  const examYear = /^\d{4}$/.test(query.examYear || '') ? Number(query.examYear) : null;

  // Upcoming is the default view — the page exists to answer "what is next".
  // ?past=1 opts into the full history, which is what someone checking whether an
  // exam already happened needs.
  const upcoming = query.past !== '1';

  const [list, years] = await Promise.all([
    fetchExamCalendar({ category, examYear, upcoming, page: query.page }),
    fetchExamYears('exam-calendar'),
  ]);

  setListingCache(res, { backendError: list.backendError });
  return {
    props: {
      entries: list.items,
      page: list.page,
      totalPages: list.totalPages,
      backendError: list.backendError,
      category,
      examYear,
      upcoming,
      years,
    },
  };
}

export default function ExamCalendarPage({
  entries, page, totalPages, backendError, category, examYear, upcoming, years,
}) {
  const router = useRouter();
  const { t } = useLang();

  function setFilter(next) {
    const merged = { category, examYear, upcoming, ...next };
    const q = {};
    if (merged.category) q.category = merged.category;
    if (merged.examYear) q.examYear = merged.examYear;
    if (!merged.upcoming) q.past = '1';
    router.push({ pathname: '/exam-calendar', query: q });
  }

  const query = {};
  if (category) query.category = category;
  if (examYear) query.examYear = examYear;
  if (!upcoming) query.past = '1';

  return (
    <div>
      <SeoHead
        title={examYear ? `${t('seo.examCalendar.title')} ${examYear}` : t('seo.examCalendar.title')}
        description={t('seo.examCalendar.desc')}
        canonical={paginatedCanonical('/exam-calendar', page)}
      />
      <Header />
      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <div className="page-head" style={{ borderTopColor: 'var(--c-calendar)' }}>
          <h1 style={{ color: 'var(--c-calendar)' }}>🗓️ {t('nav.examCalendar')}</h1>
          <p>{t('page.examCalendar.sub')}</p>
        </div>

        <ListingFilters category={category} years={years} examYear={examYear} onChange={setFilter}>
          {/* A toggle rather than two chips: "upcoming" and "all" are not
              siblings, one contains the other. */}
          <button className={upcoming ? 'chip chip-active' : 'chip'} onClick={() => setFilter({ upcoming: !upcoming })}>
            {upcoming ? t('page.upcomingOnly') : t('page.includePast')}
          </button>
        </ListingFilters>

        {backendError && (
          <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4 }}>{t('error.listings')}</p>
        )}

        {entries.length === 0 ? (
          <div className="panel"><p className="linklist-empty">{t('empty.examCalendar')}</p></div>
        ) : (
          <CalendarTable entries={entries} />
        )}

        <Pagination page={page} totalPages={totalPages} basePath="/exam-calendar" query={query} />
      </div>
      <Footer />
    </div>
  );
}

// CalendarRow, its four-date layout and the tentative/held/TBA pills moved to
// components/rows.js, exported as CalendarTable — the job detail page renders the
// same calendar for one posting off /api/exam-calendar/for-job/{id}.
