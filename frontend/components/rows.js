import Link from 'next/link';
import { DATE_COLORS, categoryLabel, formatDate, daysUntil, isNew, jobHref } from '../lib/api';
import { categoryName } from '../lib/landings';
import { useLang } from '../lib/i18n';

// Every public section renders as a dense link row, because each row answers
// one question and the user is scanning, not reading:
//   Latest jobs  -> "can I still apply, and how long do I have?"
//   Upcoming     -> "when do applications open?"
//   Admit card   -> "is my hall ticket out?"
//   Result       -> "is the result declared?"
//   All jobs     -> "browse everything, status visible"
//   Syllabus / cut off / calendar / papers -> the exam-prep half of the site
//
// The whole row is one link with a large tap area. Sub-text carries the
// scanning details (organisation, posts, dates) at a smaller size.
//
// The exam-content rows below live here rather than in their listing pages
// because the job detail page renders the same four things for one posting, off
// the /for-job/{id} endpoints. Two copies of a row is two chances for the job
// page to describe a paper differently from the page it links to.
//
// --- Trust signals ---
// Every one of these rows sends the reader off-site to a government host, and
// the backend already derives `officialSource` from that link (Slugs.sourceDomain,
// so "ssc.nic.in"). Printing it is the cheapest credibility on the site: this
// category is full of portals that copy a notification, add nothing, and give
// the reader no way to tell where a claim came from or how old it is. Naming the
// host, and the date beside it, is what separates this from those. It is not
// decoration and it is not optional per row -- SourceLine is used by all of them.

function NewTag({ job }) {
  const { t } = useLang();
  if (!isNew(job)) return null;
  return <span className="tag tag-new">{t('row.new')}</span>;
}

// Countdown chip. Red inside the final 5 days, green while there's room.
function CountdownTag({ isoDate }) {
  const { t } = useLang();
  const days = daysUntil(isoDate);
  if (days === null || days < 0) return null;

  const label =
    days === 0 ? t('row.lastDayToday')
    : days === 1 ? t('row.dayLeft')
    : t('row.daysLeft', { n: days });

  return <span className={`tag ${days <= 5 ? 'tag-urgent' : 'tag-open'}`}>{label}</span>;
}

function jobSub(job, t, { showCategory = true } = {}) {
  const parts = [job.organization];
  if (showCategory) parts.push(categoryLabel(job.category));
  if (job.totalPosts) parts.push(`${job.totalPosts.toLocaleString('en-IN')} ${t('row.posts')}`);
  return parts.filter(Boolean).join(' · ');
}

/**
 * "Source: ssc.nic.in".
 *
 * Rendered as a <span>, not a <p>, on purpose: most of these rows are wrapped in
 * an <a>, and a block-level <p> inside an anchor is invalid HTML that React will
 * happily emit and the browser will then reparent, breaking the row layout.
 */
function SourceLine({ source }) {
  const { t } = useLang();
  if (!source) return null;
  return <span className="linklist-meta">{t('job.source')}: {source}</span>;
}

// --- Latest jobs: emphasis on the closing date and urgency ---
export function LatestJobRow({ job }) {
  const { t } = useLang();
  return (
    <Link href={jobHref(job)} className="linklist-item">
      <span className="linklist-title">
        {job.postName}
        <NewTag job={job} />
        <CountdownTag isoDate={job.lastDate} />
      </span>
      <span className="linklist-meta">
        {jobSub(job, t)}
        {job.lastDate && (
          <> · <strong style={{ color: DATE_COLORS.last }}>{t('row.last')}: {formatDate(job.lastDate)}</strong></>
        )}
      </span>
    </Link>
  );
}

// --- Upcoming: emphasis on the opening date ---
export function UpcomingJobRow({ job }) {
  const { t } = useLang();
  const opensIn = daysUntil(job.applicationStartDate);
  return (
    <Link href={jobHref(job)} className="linklist-item">
      <span className="linklist-title">
        {job.postName}
        <NewTag job={job} />
        {opensIn !== null && opensIn > 0 && (
          <span className="tag tag-soon">
            {opensIn === 1 ? t('row.inDay') : t('row.inDays', { n: opensIn })}
          </span>
        )}
      </span>
      <span className="linklist-meta">
        {jobSub(job, t)}
        {job.applicationStartDate && (
          <> · <strong style={{ color: DATE_COLORS.start }}>{t('row.opens')}: {formatDate(job.applicationStartDate)}</strong></>
        )}
      </span>
    </Link>
  );
}

// --- Notice row (admit card / result / answer key) ---
// These link straight out to the official site, so they stay <a> not <Link>.
export function NoticeRow({ notice, actionLabel, color }) {
  const { t } = useLang();
  const sub = [
    notice.organization,
    categoryLabel(notice.category),
    notice.releaseDate ? `${t('row.released')} ${formatDate(notice.releaseDate)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <a
      href={notice.link}
      target="_blank"
      rel="noopener noreferrer"
      className="linklist-item"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
    >
      <span style={{ minWidth: 0, flex: '1 1 200px' }}>
        <span className="linklist-title">{notice.title}</span>
        <span className="linklist-meta">{sub}</span>
        <SourceLine source={notice.officialSource} />
      </span>
      <span className="notice-btn" style={{ background: color, flexShrink: 0 }}>
        {actionLabel}
      </span>
    </a>
  );
}

// --- All jobs: status leads, because that's the filter people apply mentally ---
const STATUS_TAGS = {
  ACTIVE:   { cls: 'tag-open',   key: 'status.open' },
  UPCOMING: { cls: 'tag-soon',   key: 'status.upcoming' },
  CLOSED:   { cls: 'tag-closed', key: 'status.closed' },
};

export function AllJobsRow({ job }) {
  const { t } = useLang();
  const tag = STATUS_TAGS[job.status] || STATUS_TAGS.CLOSED;
  return (
    <Link href={jobHref(job)} className="linklist-item">
      <span className="linklist-title">
        <span className={`tag ${tag.cls}`} style={{ marginLeft: 0, marginRight: 6 }}>{t(tag.key)}</span>
        {job.postName}
        <NewTag job={job} />
      </span>
      <span className="linklist-meta">
        {jobSub(job, t)}
        {job.lastDate && (
          <> · <strong style={{ color: DATE_COLORS.last }}>{t('row.last')}: {formatDate(job.lastDate)}</strong></>
        )}
      </span>
    </Link>
  );
}

// Wrapper used by the standalone listing pages (the homepage uses LinkBox).
export function SectionList({ children, emptyText }) {
  const hasRows = Array.isArray(children) ? children.filter(Boolean).length > 0 : !!children;
  if (!hasRows) {
    return (
      <div className="panel">
        <p className="linklist-empty">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="linklist">{children}</div>
    </div>
  );
}

// --- Syllabus row ---
// One destination, so the whole row is the link.
export function SyllabusRow({ syllabus: s }) {
  const { t, lang } = useLang();
  const meta = [
    s.organization,
    categoryName(s.category, lang),
    s.examName,
    s.updatedDate ? t('page.updatedOn', { date: formatDate(s.updatedDate) }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <a
      href={s.link}
      target="_blank"
      rel="noopener noreferrer"
      className="linklist-item"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
    >
      <span style={{ minWidth: 0, flex: '1 1 200px' }}>
        <span className="linklist-title">{s.title}</span>
        {meta && <span className="linklist-meta">{meta}</span>}
        <SourceLine source={s.officialSource} />
      </span>
      <span className="notice-btn" style={{ background: 'var(--c-syllabus)', flexShrink: 0 }}>
        {t('action.download')}
      </span>
    </a>
  );
}

/**
 * One cut-off row.
 *
 * Not wrapped in an <a> the way the syllabus rows are, because the marks are the
 * payload and they are printed here — most visitors never need the PDF, and a row
 * that navigates away on any click would take them to one anyway. The official
 * link is a button next to the marks instead.
 */
export function CutoffRow({ cutoff }) {
  const { t, lang } = useLang();
  const meta = [
    cutoff.organization,
    categoryName(cutoff.category, lang),
    cutoff.state,
    cutoff.publishedDate ? t('page.updatedOn', { date: formatDate(cutoff.publishedDate) }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="linklist-item" style={{ display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ minWidth: 0, flex: '1 1 200px' }}>
          <span className="linklist-title">{cutoff.title}</span>
          {meta && <span className="linklist-meta">{meta}</span>}
        </span>
        {cutoff.link && (
          <a
            href={cutoff.link}
            target="_blank"
            rel="noopener noreferrer"
            className="notice-btn"
            style={{ background: 'var(--c-cutoff)', flexShrink: 0 }}
          >
            {t('action.download')}
          </a>
        )}
      </div>

      {cutoff.marksSummary ? (
        <p className="cutoff-marks">
          <span className="cutoff-marks-label">{t('cutOff.marks')}</span>
          {cutoff.marksSummary}
        </p>
      ) : (
        <p className="linklist-meta" style={{ marginTop: 4 }}>{t('cutOff.noMarks')}</p>
      )}

      <SourceLine source={cutoff.officialSource} />
    </div>
  );
}

/**
 * One paper row.
 *
 * Two links, not one: the paper and its answer key are separate downloads and
 * bundling them behind a single row would hide the key. The row body is not
 * itself a link for the same reason — with two destinations, an ambiguous click
 * target is worse than two explicit buttons.
 */
export function PaperRow({ paper }) {
  const { t, lang } = useLang();
  const meta = [
    paper.examYear,
    paper.paperStage,
    paper.language,
    paper.organization,
    categoryName(paper.category, lang),
    paper.hasSolution ? t('paper.withSolution') : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      className="linklist-item"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
    >
      <span style={{ minWidth: 0, flex: '1 1 200px' }}>
        <span className="linklist-title">{paper.title}</span>
        {meta && <span className="linklist-meta">{meta}</span>}
        <SourceLine source={paper.officialSource} />
      </span>

      <span style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
        {paper.answerKeyLink && (
          <a
            href={paper.answerKeyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="notice-btn"
            style={{ background: 'var(--c-answer)' }}
          >
            {t('paper.answerKey')}
          </a>
        )}
        <a
          href={paper.link}
          target="_blank"
          rel="noopener noreferrer"
          className="notice-btn"
          style={{ background: 'var(--c-papers)' }}
        >
          {t('action.download')}
        </a>
      </span>
    </div>
  );
}

/**
 * The exam calendar as a table.
 *
 * A real table, not a link list. Four dates per exam is tabular data, and the
 * value of the page is scanning down the exam-date column — which a list of
 * stacked cards destroys.
 *
 * Exported as the whole table rather than a bare <tr> so the header cells and the
 * body cells cannot drift apart: a caller that renders three <th>s against four
 * <td>s produces a silently misaligned table, and there are now two callers.
 */
export function CalendarTable({ entries }) {
  const { t } = useLang();
  return (
    <div className="table-wrap">
      <table className="dtable">
        <thead>
          <tr>
            <th>{t('nav.examCalendar')}</th>
            <th>{t('calendar.notification')}</th>
            <th>{t('calendar.applyBy')}</th>
            <th>{t('calendar.examDate')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => <CalendarRow key={e.id} entry={e} />)}
        </tbody>
      </table>
    </div>
  );
}

function CalendarRow({ entry }) {
  const { t, lang } = useLang();
  const meta = [entry.organization, categoryName(entry.category, lang)]
    .filter(Boolean).join(' · ');

  return (
    <tr>
      <td>
        {entry.link ? (
          <a href={entry.link} target="_blank" rel="noopener noreferrer">{entry.examName}</a>
        ) : entry.examName}
        {meta && <span className="linklist-meta">{meta}</span>}
        <SourceLine source={entry.officialSource} />
      </td>
      <td style={{ fontWeight: 500 }}>{formatDate(entry.notificationDate) || '—'}</td>
      <td style={{ fontWeight: 500 }}>{formatDate(entry.applicationWindowEnd) || '—'}</td>
      <td><ExamDate entry={entry} /></td>
    </tr>
  );
}

/**
 * The exam date, plus what it means.
 *
 * Three states worth distinguishing, because they are three different answers to
 * the visitor's actual question. No date at all is "not announced" — and it has
 * to say so rather than showing an em dash, which reads as missing data. A date
 * flagged tentative gets the label, always: a tentative date presented as final
 * is the one mistake on this page that costs someone an exam. A date in the past
 * is marked as held, so nobody reads a stale row as a plan.
 */
function ExamDate({ entry }) {
  const { t } = useLang();
  if (!entry.examDate) {
    return <span className="pill pill-grey">{t('calendar.tba')}</span>;
  }

  const days = daysUntil(entry.examDate);
  const formatted = formatDate(entry.examDate);

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatted}</span>
      {entry.tentative && <span className="pill pill-amber">{t('calendar.tentative')}</span>}
      {days < 0 && <span className="pill pill-grey">{t('calendar.held')}</span>}
      {days === 0 && <span className="pill pill-red">{t('calendar.today')}</span>}
      {days > 0 && (
        <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
          {days === 1 ? t('row.inDay') : t('row.inDays', { n: days })}
        </span>
      )}
    </span>
  );
}
