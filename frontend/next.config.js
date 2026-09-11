/** @type {import('next').NextConfig} */

// Security headers. Nothing here changes behaviour for real visitors; they
// close off framing/sniffing and stop the Referer header leaking full URLs
// to the official government sites we link out to.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  reactStrictMode: true,
  compress: true,

  // Don't advertise the framework version.
  poweredByHeader: false,

  // Trailing-slash-free canonical URLs, matching what SeoHead emits.
  trailingSlash: false,

  // --- Hindi at a real URL ---------------------------------------------------
  // The Hindi translation existed before this, but only as a localStorage flag:
  // it had no address, so it could not be linked, shared, or indexed. Google
  // only ever saw the English text, which for a site whose audience searches in
  // Hindi is the larger half of the opportunity thrown away.
  //
  // With this, English stays at /result and Hindi is served at /hi/result, and
  // both are ordinary crawlable URLs that SeoHead cross-declares via hreflang.
  //
  // localeDetection is off deliberately. On, Next 307-redirects "/" according to
  // the visitor's Accept-Language header, which for this audience means most
  // people land on /hi without asking — and, worse, the homepage becomes a
  // redirect that varies per visitor, which breaks the CDN cache the listing
  // pages depend on and makes the crawler's view differ from a visitor's. The
  // language switch in the header is an explicit choice instead.
  //
  // This array is duplicated from LOCALES in lib/site.js. It has to be: a
  // CommonJS config file cannot import an ES module, and Next reads this before
  // any of the app's own code runs. Change one, change the other — the
  // api-check harness fails if the two ever disagree, because a locale that
  // exists here but not there (or vice versa) produces hreflang tags pointing
  // at 404s, which Google discards silently.
  i18n: {
    locales: ['en', 'hi'],
    defaultLocale: 'en',
    localeDetection: false,
  },

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Both feeds are generated per-request but change at most a few times a
      // day; let the CDN hold them briefly. The generators set the same header
      // themselves — this is here so the policy still applies if a future
      // change moves them back to static files.
      { source: '/sitemap.xml', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, s-maxage=3600' }] },
      { source: '/robots.txt', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, s-maxage=3600' }] },

      // The admin area, belt and braces with the Disallow in /robots.txt.
      //
      // A Disallow stops a crawler fetching the page, but it does not stop the
      // URL itself appearing in results when something links to it — Google
      // lists it with no snippet, because it was never allowed to look. This
      // header is the instruction that actually removes it, and it is sent
      // whether or not robots.txt was read. Both locale prefixes, since
      // /hi/admin/add-job resolves too.
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/hi/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },

  async rewrites() {
    // beforeFiles, not the default afterFiles. afterFiles is only consulted
    // once Next has failed to match a page *and* a file in public/, so with
    // public/robots.txt still on disk an afterFiles rewrite for /robots.txt
    // would never fire and the stale hard-coded copy would keep being served.
    return {
      beforeFiles: [
        // robots.txt advertises /sitemap.xml, but the generator lives at
        // /api/sitemap. Without this rewrite the sitemap is effectively
        // unsubmitted — Search Console fetches a 404.
        { source: '/sitemap.xml', destination: '/api/sitemap' },

        // Generated so the Sitemap line follows NEXT_PUBLIC_SITE_URL and a
        // non-production deploy can answer "Disallow: /".
        { source: '/robots.txt', destination: '/api/robots' },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

module.exports = nextConfig;
