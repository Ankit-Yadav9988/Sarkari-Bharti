import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useLang } from '../lib/i18n';
import { SITE, hreflangFor } from '../lib/site';

const NAV_LINKS = [
  { href: '/', key: 'nav.home' },
  { href: '/latest-jobs', key: 'nav.latest' },
  { href: '/upcoming-jobs', key: 'nav.upcoming' },
  { href: '/jobs', key: 'nav.all' },
  { href: '/admit-card', key: 'nav.admitCard' },
  { href: '/result', key: 'nav.result' },
  { href: '/answer-key', key: 'nav.answerKey' },
  { href: '/syllabus', key: 'nav.syllabus' },
  // Placed after syllabus rather than at the end: someone who has found the
  // syllabus is one step from wanting the cut off and the old papers, and these
  // three are the pages that keep earning traffic long after a notification
  // closes. The nav wraps to a second row on a phone either way.
  { href: '/cut-off', key: 'nav.cutOff' },
  { href: '/exam-calendar', key: 'nav.examCalendar' },
  { href: '/previous-year-papers', key: 'nav.papers' },
  { href: '/admission', key: 'nav.admission' },
];

export default function Header() {
  const router = useRouter();
  const { t, lang, otherLang } = useLang();
  const [open, setOpen] = useState(false);

  // The switch is a real link, not a button. Hindi lives at /hi/<path>, so
  // changing language is a navigation — and making it an <a> means it is
  // crawlable, middle-clickable, and works before JavaScript loads, which on
  // the connections this audience is on is not a hypothetical.
  //
  // asPath is the URL as the visitor sees it minus the locale prefix, so it
  // carries the query string and lands them on the same listing page and page
  // number rather than dumping them back on the homepage.
  const switchPath = router?.asPath || '/';

  return (
    <header>
      <div className="masthead">
        <Link
          href={switchPath}
          locale={otherLang}
          className="masthead-btn masthead-lang"
          // Region-qualified, the same value SeoHead puts in the <link
          // rel="alternate"> set. On an <a> this attribute is only a hint about
          // the language of the page being linked to, so bare "hi" would be
          // legal — but describing the Hindi site as hi-IN in one place and hi
          // in another is the kind of small inconsistency that makes an audit
          // report look like a problem when there isn't one.
          hrefLang={hreflangFor(otherLang)}
          aria-label={lang === 'en' ? t('lang.toHindi') : t('lang.toEnglish')}
        >
          {lang === 'en' ? 'हिं' : 'EN'}
        </Link>

        <Link href="/" style={{ textDecoration: 'none', display: 'block' }}>
          <div className="masthead-name">
            {SITE.name}<span className="dot">.</span>
          </div>
          <div className="masthead-tagline">{SITE.tagline}</div>
        </Link>

        <button
          aria-label={t('nav.toggleMenu')}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          className="masthead-btn masthead-toggle"
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

      <nav className={`mainnav ${open ? 'open' : ''}`} aria-label="Main">
        {NAV_LINKS.map(link => {
          const active = router?.pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={active ? 'nav-link active' : 'nav-link'}
              aria-current={active ? 'page' : undefined}
            >
              {t(link.key)}
            </Link>
          );
        })}

        {(SITE.whatsappChannel || SITE.telegramChannel) && (
          <span className="channel-links">
            {SITE.whatsappChannel && (
              <a href={SITE.whatsappChannel} target="_blank" rel="noopener noreferrer"
                 className="channel-btn" style={{ background: '#25D366' }}>
                WhatsApp
              </a>
            )}
            {SITE.telegramChannel && (
              <a href={SITE.telegramChannel} target="_blank" rel="noopener noreferrer"
                 className="channel-btn" style={{ background: '#229ED9' }}>
                Telegram
              </a>
            )}
          </span>
        )}
      </nav>
    </header>
  );
}
