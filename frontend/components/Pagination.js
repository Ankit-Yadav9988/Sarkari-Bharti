import Link from 'next/link';
import { useLang } from '../lib/i18n';

// Prev / page-numbers / Next strip used under every long listing.
//
// Two modes, because the site has two kinds of list. Public pages are rendered
// per request and get real <a href="?page=2"> links, so a page of results can
// be shared, bookmarked and crawled. Admin screens hold the page in React state
// and pass onPageChange instead, which renders buttons -- there is nothing to
// crawl behind a login, and a URL change there would remount the whole screen
// and drop the filters the admin just set.
export default function Pagination({ page, totalPages, basePath, query = {}, onPageChange }) {
  const { t } = useLang();
  if (!totalPages || totalPages <= 1) return null;

  function href(p) {
    const q = { ...query };
    if (p > 1) q.page = p; else delete q.page;
    return { pathname: basePath, query: q };
  }

  // Show first, last, current +/- 1 — collapse the rest into "…".
  const nums = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
      nums.push(p);
    } else if (nums[nums.length - 1] !== '…') {
      nums.push('…');
    }
  }

  function cell(p, label, isCurrent) {
    const className = isCurrent ? 'chip chip-active' : 'chip';
    if (onPageChange) {
      return (
        <button
          key={label}
          type="button"
          className={className}
          onClick={() => onPageChange(p)}
          aria-current={isCurrent ? 'page' : undefined}
        >
          {label}
        </button>
      );
    }
    return (
      <Link
        key={label}
        href={href(p)}
        className={className}
        aria-current={isCurrent ? 'page' : undefined}
      >
        {label}
      </Link>
    );
  }

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center',
        flexWrap: 'wrap', margin: '20px 0 4px',
      }}
    >
      {page > 1 && cell(page - 1, `← ${t('page.prev')}`, false)}
      {nums.map((p, i) =>
        p === '…'
          ? <span key={`gap-${i}`} className="muted" style={{ padding: '0 4px' }}>…</span>
          : cell(p, String(p), p === page)
      )}
      {page < totalPages && cell(page + 1, `${t('page.next')} →`, false)}
    </nav>
  );
}
