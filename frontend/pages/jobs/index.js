import { useRouter } from 'next/router';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import SeoHead from '../../components/SeoHead';
import Pagination from '../../components/Pagination';
import { AllJobsRow, SectionList } from '../../components/rows';
import { fetchJobs, CATEGORIES, STATES } from '../../lib/api';
import { landingForCategory, landingForState, landingText } from '../../lib/landings';
import { setListingCache } from '../../lib/cache';
import { useLang } from '../../lib/i18n';

export async function getServerSideProps({ query, res }) {
  const category = CATEGORIES.some(c => c.value === query.category) ? query.category : null;
  const state = STATES.includes(query.state) ? query.state : null;
  const search = typeof query.q === 'string' ? query.q : null;
  const { items, page, totalPages, totalItems, backendError } =
    await fetchJobs({ category, state, search, page: query.page });
  // A search URL is not worth edge-caching: the query string is unbounded, so
  // each one is a cold entry that evicts something a real visitor wanted. That
  // is `uncacheable` and not `backendError` — the results are correct, they just
  // should not be stored. The two used to share one flag, which would now mean
  // answering 503 to every search.
  setListingCache(res, { backendError, uncacheable: Boolean(search) });
  return {
    props: {
      jobs: items, page, totalPages, total: totalItems,
      backendError, category, state, search,
    },
  };
}

// Browse-everything page: every job regardless of status, filterable by
// category (?category=BANKING) and state (?state=Bihar) via the URL so links
// stay shareable and crawlable.
export default function AllJobs({ jobs, page, totalPages, total, backendError, category, state, search }) {
  const router = useRouter();
  const { t, lang } = useLang();

  // Changing a filter resets to page 1 (page is omitted from the query).
  function pushFilters({ nextCategory = category, nextState = state }) {
    router.push({
      pathname: '/jobs',
      query: {
        ...(search ? { q: search } : {}),
        ...(nextCategory ? { category: nextCategory } : {}),
        ...(nextState ? { state: nextState } : {}),
      },
    });
  }

  const filterQuery = {
    ...(search ? { q: search } : {}),
    ...(category ? { category } : {}),
    ...(state ? { state } : {}),
  };

  const heading = search ? t('page.searchResults', { q: search }) : t('page.all.title');

  // Which URL this page claims to be.
  //
  // A single-filter view like /jobs?category=BANKING covers exactly the same set
  // as the /banking-jobs landing, and the landing is the version with a written
  // intro and a permanent address, so that is the one worth keeping. Declaring
  // it here is also what makes the "filtered listings are crawlable on purpose,
  // they canonicalise to the landing" note in pages/api/robots.js true rather
  // than aspirational — it was not, until now.
  //
  // Everything else self-canonicalises with its live query attached. Page 2 and
  // a two-filter view have no landing that covers them, and a search page is
  // noindex: pairing noindex with a canonical pointing at a *different* URL asks
  // Google both to drop this page and to merge it into that one, and it settles
  // that contradiction by picking one instruction on its own.
  const canonicalLanding = !search && page === 1
    ? (category && !state ? landingForCategory(category)
      : state && !category ? landingForState(state)
      : null)
    : null;

  const canonicalQuery = new URLSearchParams({
    ...(search ? { q: search } : {}),
    ...(category ? { category } : {}),
    ...(state ? { state } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  }).toString();

  const canonicalPath = canonicalLanding
    ? `/${canonicalLanding.slug}`
    : canonicalQuery ? `/jobs?${canonicalQuery}` : '/jobs';

  return (
    <div>
      <SeoHead
        title={search ? t('seo.search.title', { q: search }) : t('seo.all.title')}
        description={t('seo.all.desc')}
        canonical={canonicalPath}
        noIndex={!!search}
      />
      <Header />
      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <div className="page-head">
          <h1>{heading}</h1>
          <p>
            {search
              ? (total === 1 ? t('page.matchingOne') : t('page.matching', { n: total }))
              : t('page.all.sub')}
          </p>
        </div>

        <div className="panel" style={{ marginBottom: 12 }}>
          <div style={{ padding: 10 }}>
            <div className="chip-row" style={{ marginBottom: 10 }}>
              <button className={!category ? 'chip chip-active' : 'chip'} onClick={() => pushFilters({ nextCategory: null })}>
                {t('chip.all')}
              </button>
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  className={category === c.value ? 'chip chip-active' : 'chip'}
                  onClick={() => pushFilters({ nextCategory: c.value })}
                >
                  {/* The landing's own name, so the chip and the page it filters
                      to are worded identically in both languages. Categories
                      with no landing (none today) fall back to the enum label. */}
                  {landingText(landingForCategory(c.value), lang).name || c.label}
                </button>
              ))}
            </div>

            <select
              className="input"
              style={{ maxWidth: 280 }}
              value={state || ''}
              onChange={e => pushFilters({ nextState: e.target.value || null })}
              aria-label={t('page.filterByState')}
            >
              {/* value stays the English state name the backend filters on;
                  only the label is translated. */}
              <option value="">{t('page.allStates')}</option>
              {STATES.map(s => (
                <option key={s} value={s}>{landingText(landingForState(s), lang).name || s}</option>
              ))}
            </select>
          </div>
        </div>

        {backendError && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4 }}>{t('error.listings')}</p>}

        <SectionList emptyText={search ? t('empty.search', { q: search }) : t('empty.all')}>
          {jobs.map(job => <AllJobsRow key={job.id} job={job} />)}
        </SectionList>

        <Pagination page={page} totalPages={totalPages} basePath="/jobs" query={filterQuery} />
      </div>
      <Footer />
    </div>
  );
}
