// Drop this inside any page's <Head> to set title, description, and OG tags.
// OG tags make WhatsApp/Telegram/Facebook show a rich preview card when
// someone shares the link — critical for India's WhatsApp-first audience.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { SITE, SITE_URL, LOCALES, DEFAULT_LOCALE, localeUrl, hreflangFor } from '../lib/site';
import { useLang } from '../lib/i18n';

const OG_IMAGE = `${SITE_URL}/og-default.png`; // 1200x630, lives in public/

export default function SeoHead({
  title,
  description,
  canonical,
  ogImage = OG_IMAGE,
  noIndex = false,
}) {
  const router = useRouter();
  const { t, lang } = useLang();

  // The no-title fallback comes from the dictionary, not from a literal here.
  // A hardcoded English default is the kind of bug that never looks like one:
  // the page renders correctly in Hindi and only its <title> and description —
  // the two things Google actually shows — stay in English.
  const fullTitle = title ? `${title} | ${SITE.name}` : t('seo.default.title');
  const desc = description || t('seo.default.desc');

  // Pages pass a locale-free path ("/result", "/ssc-jobs?page=2"). Fall back to
  // asPath, which Next also gives without the locale prefix, so a page that
  // forgets to pass one still gets a correct self-referencing canonical rather
  // than silently claiming to be the homepage.
  const path = canonical || router?.asPath?.split('#')[0] || '/';

  // The canonical points at THIS language's URL, not at English. Pointing
  // /hi/result at /result would tell Google the Hindi page is a duplicate and
  // drop it from the index — which is the whole reason it now has a URL.
  const url = localeUrl(path, lang);

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />
      {noIndex && <meta name="robots" content="noindex,nofollow" />}

      {/* hreflang. Every page declares both languages and each declaration is
          reciprocal, which is what Google requires before it will treat them as
          one page in two languages instead of two competing pages.
          x-default names the version for a visitor whose language we have no
          signal for — English, since it is also the default locale.

          These are built with the same localeUrl() the sitemap uses, so the
          on-page annotation and the sitemap annotation cannot disagree. When
          they disagree Google discards both, and a silently ignored hreflang set
          looks identical to a working one from the outside. */}
      {LOCALES.map(loc => (
        <link key={loc} rel="alternate" hrefLang={hreflangFor(loc)} href={localeUrl(path, loc)} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={localeUrl(path, DEFAULT_LOCALE)} />

      {/* Open Graph — WhatsApp, Telegram, Facebook preview cards */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE.name} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:locale" content={lang === 'hi' ? 'hi_IN' : 'en_IN'} />
      {LOCALES.filter(loc => loc !== lang).map(loc => (
        <meta key={loc} property="og:locale:alternate" content={loc === 'hi' ? 'hi_IN' : 'en_IN'} />
      ))}
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      {/* Twitter card (also used by LinkedIn) */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={ogImage} />
    </Head>
  );
}
