// /robots.txt, generated rather than static.
//
// It was a file in public/ with the production domain hard-coded in the Sitemap
// line. That is wrong in two situations that both actually happen: a preview
// deploy (which then advertises the live site's sitemap and invites Google to
// index a staging copy of the whole portal), and a domain change (which leaves
// a robots.txt pointing at a sitemap that 404s, silently stopping discovery).
//
// Driven from the same SITE_URL every canonical tag uses, so those cannot drift.

import { SITE_URL } from '../../lib/site';
import { setFeedCache } from '../../lib/cache';

// Indexing is opt-out: a deploy is crawlable unless it says otherwise. The
// alternative — opt-in — means the one deploy that matters silently stays out
// of the index because an env var was missed, and that failure is invisible
// until someone notices the site has no traffic.
//
// The *.vercel.app rule is about preview deploys, not about the host. Every
// branch and every pull request gets its own vercel.app URL serving the whole
// portal, and letting those into the index means competing with the real site
// using copies of its own pages. But a site whose public address genuinely is
// name.vercel.app — no custom domain bought yet — is not a preview, and
// blanket-blocking it keeps the live site out of Google entirely.
//
// So the vercel.app check is qualified by VERCEL_ENV, which Vercel sets to
// "production" only for the production deployment and "preview" for every
// branch build. This is a server-rendered API route, so it reads the real
// runtime value rather than something inlined at build time.
//
// An explicit NEXT_PUBLIC_ALLOW_INDEXING=false still wins over all of it: the
// kill switch has to work everywhere, or it is not a kill switch.
const IS_VERCEL_PREVIEW =
  /\.vercel\.app$/.test(SITE_URL) && process.env.VERCEL_ENV !== 'production';

const INDEXING_BLOCKED =
  String(process.env.NEXT_PUBLIC_ALLOW_INDEXING || '').toLowerCase() === 'false'
  || /localhost|127\.0\.0\.1/.test(SITE_URL)
  || IS_VERCEL_PREVIEW;

const CRAWLABLE = `User-agent: *
Allow: /

# Behind a login — nothing to index, and the pages 302 to /admin/login anyway.
# The /hi/ twin is listed because Next's i18n routing serves every page under a
# locale prefix as well, so /hi/admin/add-job resolves. A rule for /admin/ says
# nothing about it.
Disallow: /admin/
Disallow: /hi/admin/
Disallow: /api/

# Search results. The query string is unbounded, so every distinct search is a
# separate URL with content that already exists on a listing page. Crawling
# them spends the site's crawl budget on duplicates of itself.
Disallow: /*?q=
Disallow: /*&q=

# The unsubscribe link from an email alert. The token in it is the only
# credential that page has, so it should not be fetched by anything that was not
# handed it deliberately -- and there is nothing on it worth crawling either.
# The page sends X-Robots-Tag: noindex as well, because a rule here is a request
# and a header is not.
Disallow: /unsubscribe
Disallow: /hi/unsubscribe

# Filtered listings are left crawlable on purpose: they carry a canonical tag
# pointing at the landing page that covers the same set, which tells a crawler
# which of the two to keep without hiding either from it.
#
# The /hi/ pages are crawlable for the opposite reason: they are the point. Each
# one declares a reciprocal hreflang pair with its English twin and canonicalises
# to itself, so they are two language versions of one page rather than two
# competing pages.

Sitemap: ${SITE_URL}/sitemap.xml`;

const BLOCKED = `# This deployment is not the public site — it is a preview build or a local
# run. Nothing here should be indexed: serving the same content as the live site
# would compete with it in search results using copies of its own pages.
User-agent: *
Disallow: /`;

export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  setFeedCache(res, 3600);
  res.status(200).send(INDEXING_BLOCKED ? BLOCKED : CRAWLABLE);
}
