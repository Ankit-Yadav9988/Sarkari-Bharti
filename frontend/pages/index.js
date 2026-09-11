import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import Ticker from '../components/Ticker';
import LinkBox from '../components/LinkBox';
import SubscribeBox from '../components/SubscribeBox';
import { LatestJobRow, UpcomingJobRow, NoticeRow } from '../components/rows';
import { fetchJobs, fetchNotices, fetchSyllabi, CATEGORIES, formatDate, daysUntil, jobHref } from '../lib/api';
import { setListingCache } from '../lib/cache';
import { useLang } from '../lib/i18n';

// The homepage is the product. Someone arriving here should be able to reach
// any live notification without scrolling past one screen, so every box is
// fetched up front, in parallel, and laid out as a grid.
//
// Each call asks for exactly the rows its box renders. That matters now that
// paging happens in SQL: this page used to pull the whole jobs table and pick
// through it in memory, which meant the first page of twenty rows silently
// became the entire source of truth for three different sections.
export async function getServerSideProps({ res }) {
  const [
    activeRes, closingRes, upcomingRes,
    admitRes, resultRes, answerRes, syllabusRes, admissionRes,
  ] = await Promise.all([
    fetchJobs({ status: 'ACTIVE', size: 10 }),
    // Deadline order, not newest-first: a posting that opened months ago and
    // closes tomorrow is exactly what the ticker exists to surface, and it sits
    // nowhere near the top of a newest-first list. Twelve, then filtered to the
    // ones actually inside the week.
    fetchJobs({ status: 'ACTIVE', sort: 'closing', size: 12 }),
    fetchJobs({ status: 'UPCOMING', sort: 'opening', size: 8 }),
    fetchNotices({ type: 'ADMIT_CARD', size: 8 }),
    fetchNotices({ type: 'RESULT', size: 8 }),
    fetchNotices({ type: 'ANSWER_KEY', size: 8 }),
    fetchSyllabi({ size: 8 }),
    fetchJobs({ category: 'ADMISSION', size: 8 }),
  ]);

  setListingCache(res, { backendError: activeRes.backendError });

  return {
    props: {
      activeJobs: activeRes.items,
      closingJobs: closingRes.items,
      upcomingJobs: upcomingRes.items,
      admitCards: admitRes.items,
      results: resultRes.items,
      answerKeys: answerRes.items,
      syllabi: syllabusRes.items,
      admissions: admissionRes.items,
      backendError: activeRes.backendError,
    },
  };
}

const ACCENT = {
  latest:    'var(--c-latest)',
  result:    'var(--c-result)',
  admit:     'var(--c-admit)',
  answer:    'var(--c-answer)',
  syllabus:  'var(--c-syllabus)',
  admission: 'var(--c-admission)',
  upcoming:  'var(--c-upcoming)',
};

export default function Home({
  activeJobs, closingJobs, upcomingJobs, admitCards, results,
  answerKeys, syllabi, admissions, backendError,
}) {
  const router = useRouter();
  const { t } = useLang();
  const [query, setQuery] = useState('');

  // Ticker = things that expire. The backend already ordered these by deadline;
  // all that is left is dropping the ones outside the week. If nothing is
  // closing it stays empty rather than padding itself with filler.
  const closingSoon = closingJobs
    .filter(j => {
      const d = daysUntil(j.lastDate);
      return d !== null && d >= 0 && d <= 7;
    })
    .slice(0, 6)
    .map(j => {
      const d = daysUntil(j.lastDate);
      const when = d === 0 ? t('row.lastDayToday') : d === 1 ? t('row.dayLeft') : t('row.daysLeft', { n: d });
      return { href: jobHref(j), label: `${j.postName} — ${when}` };
    });

  const tickerItems = [
    ...closingSoon,
    ...results.slice(0, 3).map(n => ({ href: '/result', label: `Result out: ${n.title}` })),
  ];

  function handleSearch(e) {
    e.preventDefault();
    if (query.trim()) router.push(`/jobs?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div>
      <SeoHead canonical="/" />
      <Header />
      <Ticker items={tickerItems} label={t('ticker.label')} />

      <div className="container" style={{ paddingTop: 10 }}>
        <form onSubmit={handleSearch} className="searchbar" role="search">
          <input
            className="input"
            placeholder={t('home.searchPlaceholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label={t('home.searchPlaceholder')}
          />
          <button type="submit" className="btn-primary">{t('home.search')}</button>
        </form>

        {backendError && (
          <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 4, marginTop: 10 }}>
            {t('error.listings')}
          </p>
        )}
      </div>

      {/* Primary grid: the three sections people come here for. */}
      <div className="container" style={{ paddingTop: 12 }}>
        <div className="box-grid">
          <LinkBox
            title={`📋 ${t('home.latest')}`}
            accent={ACCENT.latest}
            viewAllHref="/latest-jobs"
            viewAllLabel={t('home.viewAll')}
            empty={t('empty.box.latest')}
          >
            {activeJobs.map(job => <LatestJobRow key={job.id} job={job} />)}
          </LinkBox>

          <LinkBox
            title={`📜 ${t('home.result')}`}
            accent={ACCENT.result}
            viewAllHref="/result"
            viewAllLabel={t('home.viewAll')}
            empty={t('empty.result')}
          >
            {results.map(n => (
              <NoticeRow key={n.id} notice={n} actionLabel={t('action.view')} color="var(--c-result)" />
            ))}
          </LinkBox>

          <LinkBox
            title={`🪪 ${t('home.admitCard')}`}
            accent={ACCENT.admit}
            viewAllHref="/admit-card"
            viewAllLabel={t('home.viewAll')}
            empty={t('empty.box.admitCard')}
          >
            {admitCards.map(n => (
              <NoticeRow key={n.id} notice={n} actionLabel={t('action.download')} color="var(--c-admit)" />
            ))}
          </LinkBox>
        </div>
      </div>

      {/* Secondary grid */}
      <div className="container" style={{ paddingTop: 12 }}>
        <div className="box-grid">
          <LinkBox
            title={`🔔 ${t('home.upcoming')}`}
            accent={ACCENT.upcoming}
            viewAllHref="/upcoming-jobs"
            viewAllLabel={t('home.viewAll')}
            empty={t('empty.upcoming')}
          >
            {upcomingJobs.map(job => <UpcomingJobRow key={job.id} job={job} />)}
          </LinkBox>

          <LinkBox
            title={`🗝️ ${t('nav.answerKey')}`}
            accent={ACCENT.answer}
            viewAllHref="/answer-key"
            viewAllLabel={t('home.viewAll')}
            empty={t('empty.answerKey')}
          >
            {answerKeys.map(n => (
              <NoticeRow key={n.id} notice={n} actionLabel={t('action.view')} color="var(--c-answer)" />
            ))}
          </LinkBox>

          <LinkBox
            title={`📚 ${t('nav.syllabus')}`}
            accent={ACCENT.syllabus}
            viewAllHref="/syllabus"
            viewAllLabel={t('home.viewAll')}
            empty={t('empty.syllabus')}
          >
            {syllabi.map(s => (
              <a key={s.id} href={s.link} target="_blank" rel="noopener noreferrer" className="linklist-item">
                <span className="linklist-title">{s.title}</span>
                <span className="linklist-meta">
                  {[s.organization, s.updatedDate ? t('page.updatedOn', { date: formatDate(s.updatedDate) }) : null]
                    .filter(Boolean).join(' · ')}
                </span>
              </a>
            ))}
          </LinkBox>
        </div>
      </div>

      {/* Admissions only appears when there's something in it — an empty box
          on the homepage reads as an abandoned site. */}
      {admissions.length > 0 && (
        <div className="container" style={{ paddingTop: 12 }}>
          <LinkBox
            title={`🎓 ${t('nav.admission')}`}
            accent={ACCENT.admission}
            viewAllHref="/admission"
            viewAllLabel={t('home.viewAll')}
            empty=""
          >
            {admissions.map(job => <LatestJobRow key={job.id} job={job} />)}
          </LinkBox>
        </div>
      )}

      {/* Category rail — the shortcut regulars use instead of the nav. */}
      <div className="container" style={{ paddingTop: 14 }}>
        <div className="panel">
          <div className="panel-head">{t('home.browseByCategory')}</div>
          <div style={{ padding: 10 }}>
            <div className="cat-rail">
              {CATEGORIES.map(c => (
                <Link key={c.value} href={`/jobs?category=${c.value}`} className="cat-tile">
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 14 }}>
        <SubscribeBox />
      </div>

      <Footer />
    </div>
  );
}
