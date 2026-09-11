// One place for site identity, the public origin, and analytics config.
//
// Everything here is read at build time. NEXT_PUBLIC_* variables are inlined
// into the bundle by Next, so they cannot be changed after `next build` —
// setting NEXT_PUBLIC_SITE_URL in the host's dashboard *after* deploying does
// nothing until the next build. That trips people up often enough to be worth
// stating where the values are defined.

/**
 * The origin every absolute URL on the site is built from: canonical tags, OG
 * tags, JSON-LD, the sitemap, and the WhatsApp share links.
 *
 * A trailing slash is stripped rather than tolerated. Every caller composes
 * `${SITE_URL}${path}` where path already starts with "/", so a value ending
 * in "/" would emit https://sarkari-bharti.vercel.app//jobs/x — a different URL
 * to the one in the sitemap, which is exactly the kind of duplicate a canonical
 * tag is supposed to prevent.
 *
 * The fallback is the live Vercel address, not a domain that has not been
 * bought. A fallback naming a domain nobody owns is worse than no fallback:
 * every canonical tag on a misconfigured build would point at someone else's
 * future site, and Google would follow it.
 */
export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL || 'https://sarkari-bharti.vercel.app').replace(/\/+$/, '');

/** True only when this build is the real site, not a local run or a preview. */
export const IS_PRODUCTION_SITE =
  process.env.NODE_ENV === 'production' && !/localhost|127\.0\.0\.1/.test(SITE_URL);

export const SITE = {
  name: 'Sarkari Bharti',
  tagline: "Every vacancy. One place.",

  // e.g. 'https://whatsapp.com/channel/0029VaXXXXXXXXX'
  whatsappChannel: '',

  // e.g. 'https://t.me/yourchannel'
  telegramChannel: '',
};

/**
 * Analytics and Search Console.
 *
 * Both are empty unless the corresponding env var is set, and the components
 * that read them render nothing when empty. That is the point: a dev server
 * and a preview deploy must not send hits to the production GA4 property, or
 * the traffic numbers this site is being built to grow become fiction.
 */
export const ANALYTICS = {
  // "G-XXXXXXXXXX" from Google Analytics → Admin → Data streams.
  gaMeasurementId: process.env.NEXT_PUBLIC_GA_ID || '',

  // The token from Search Console's "HTML tag" verification method — just the
  // content value, not the whole <meta> tag.
  searchConsoleToken: process.env.NEXT_PUBLIC_GSC_VERIFICATION || '',

  // Bing Webmaster Tools, same idea. Optional; Bing also accepts an import
  // from Search Console, which is easier than verifying twice.
  bingToken: process.env.NEXT_PUBLIC_BING_VERIFICATION || '',
};

/**
 * Absolute URL for a site-relative path. Handles a missing leading slash.
 *
 * A bare "/" resolves to the origin with no trailing slash, because
 * next.config.js sets trailingSlash: false — the homepage is served at
 * https://sarkari-bharti.vercel.app, so a canonical tag claiming
 * https://sarkari-bharti.vercel.app/ would name a URL that redirects, which is
 * the one thing a canonical must not do.
 */
export function absoluteUrl(path = '/') {
  if (!path || path === '/') return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * The locales this site is served in, and the default one.
 *
 * These live here rather than in lib/i18n.js because i18n.js pulls in React and
 * next/router, and the two places that most need to agree with this list are a
 * plain API route (pages/api/sitemap.js) and next.config.js. lib/i18n.js
 * re-exports both names, so existing imports keep working.
 *
 * next.config.js repeats the array literally — a CommonJS config file cannot
 * import an ES module. Changing the list here means changing it there too, and
 * the api-check harness asserts the two have not drifted apart.
 */
export const LOCALES = ['en', 'hi'];
export const DEFAULT_LOCALE = 'en';

/**
 * The hreflang value for a locale.
 *
 * Region-qualified on purpose. A bare "hi" claims Hindi everywhere and a bare
 * "en" claims English everywhere, which for a site about Indian government
 * recruitment is a claim it cannot honour — "en-IN" says English *for India*,
 * which is what this actually is and what it should be ranked as.
 */
export function hreflangFor(locale) {
  return locale === 'hi' ? 'hi-IN' : 'en-IN';
}

/**
 * The absolute URL of one locale's version of a path.
 *
 * Next's i18n routing serves the default locale unprefixed and every other
 * locale under /<locale>, so English lives at /ssc-jobs and Hindi at
 * /hi/ssc-jobs. Callers pass a locale-free path and get the right address back.
 *
 * Every absolute URL that has to name a specific language version goes through
 * here: the canonical tag, the hreflang set, the JSON-LD `url`, and the
 * sitemap. They used to build the string independently, which is how a
 * canonical and a JSON-LD url end up disagreeing about which page they are on.
 */
export function localeUrl(path = '/', locale = DEFAULT_LOCALE) {
  const clean = path && path !== '/' ? path : '';
  if (locale === DEFAULT_LOCALE) return absoluteUrl(clean || '/');
  return absoluteUrl(`/${locale}${clean}`);
}
