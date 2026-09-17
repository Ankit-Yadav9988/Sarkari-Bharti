// CDN / shared-cache headers for the server-rendered public pages.
//
// Every public page is getServerSideProps rather than getStaticProps, because a
// job posting is only useful while its dates are current and a rebuild-on-deploy
// model would serve last week's "last date" until someone pushed. The cost is
// that each visitor otherwise hits the Spring backend, and traffic here arrives
// in spikes -- one exam notification getting forwarded around WhatsApp is
// thousands of requests for the same URL inside a few minutes.
//
// s-maxage fixes that without giving up freshness: the shared cache (Vercel's
// edge, Cloudflare, any reverse proxy) answers repeats from memory, while
// browsers are told not to keep their own copy so a visitor who posts a form or
// hits back never reads a stale page from disk.
//
// stale-while-revalidate is the part that matters under a spike: past the fresh
// window the edge serves the old copy *and* refreshes behind it, so exactly one
// request reaches the backend instead of every request that arrives during the
// refetch.

/**
 * Listings: fresh for five minutes, servable stale for an hour while it
 * refreshes behind you.
 *
 * These windows were a minute and ten minutes, which is the right shape for a
 * busy site and the wrong one for this one. At this traffic level almost every
 * visitor arrived after the stale window had also expired, so almost every
 * visit went to the origin and waited on a backend that had spun down. The
 * numbers were tuned for freshness the content does not need: every date on
 * these pages is absolute, so a five-minute-old copy of a listing says exactly
 * what a live one says.
 *
 * An hour of stale-while-revalidate is the part that removes the wait. Past the
 * fresh window the edge answers instantly from its old copy and refetches
 * behind the visitor, so the cold start is paid by a background request nobody
 * is watching instead of by the person who just tapped the link.
 */
const LISTING = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600';

/**
 * A single posting: the row barely changes once it is up, so it gets a longer
 * fresh window than a listing.
 *
 * The stale window deliberately stops at an hour, and that is the ceiling for
 * every page here. Everything on these pages that is *relative* to today — the
 * "3 days left" chip, the NEW badge, the open/closed banner — is baked into the
 * HTML at render time. A stale window long enough to cross midnight therefore
 * serves yesterday's arithmetic: a form that shut last night would still say
 * "applications open". An hour bounds that to the first hour after midnight,
 * when nobody is applying for anything.
 *
 * Lifting this ceiling means moving those three things to the client so the
 * cached HTML carries no opinion about what day it is. Worth doing if the site
 * ever needs day-long caching; not worth the hydration flicker today.
 */
const DETAIL = 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600';

/**
 * Sets the cache header, and the status code when the render is a failure.
 *
 * Skipping the header when the backend was unreachable is the whole reason this
 * is a function and not a constant. Caching an error page pins the outage to the
 * edge for the full window: the backend comes back, and the site stays broken
 * for everyone whose request lands on that cached copy. An uncached error page
 * is slow and correct; a cached one is fast and wrong.
 *
 * The two flags look similar and are not the same thing, which is why they are
 * separate arguments:
 *
 *   backendError — the data is missing. The page renders its empty state, and
 *                  the response is a 503 (see below).
 *   uncacheable  — the data is correct, this URL just should not be held at the
 *                  edge. Search results are the case: the query space is
 *                  unbounded, so caching them fills the cache with entries
 *                  nobody asks for twice. Status stays 200.
 *
 * They were one flag until this was written, with the search page passing
 * `backendError: Boolean(search)` to borrow the skip-caching behaviour. Adding
 * the status code to that flag would have started answering 503 to every search
 * on the site.
 *
 * **Why 503 and not 200.** Without it, a cold or sleeping backend makes this
 * site answer `200 OK` with an empty page — and to a crawler a 200 is a promise
 * that this is the content. Google's documented behaviour is to treat that as
 * the page now being thin or gone, so the real content drops out of the index.
 * A 503 says "this is temporary, keep what you have and come back", which is
 * exactly true. Humans are unaffected: the browser renders the body normally,
 * so the visitor still sees the site's own styled empty state, not a browser
 * error page.
 *
 * **Why not `noindex` instead.** Google's guidance is explicit that a robots
 * `noindex` is the wrong tool for a temporary outage — it is a durable
 * instruction, and one served during a few minutes of downtime can keep a URL
 * out of the index long after the backend is healthy. The status code is the
 * reversible signal; the meta tag is not.
 *
 * `res` is absent when Next calls getServerSideProps during a client-side
 * transition, so the guard is required rather than defensive.
 */
export function setListingCache(res, { backendError = false, detail = false, uncacheable = false } = {}) {
  if (!res) return;
  if (backendError) {
    res.statusCode = 503;
    // A hint, not a contract — crawlers treat it as advisory. Two minutes is
    // roughly a Render cold start, so a crawler that honours it comes back to a
    // warm backend.
    res.setHeader('Retry-After', '120');
    return;
  }
  if (uncacheable) return;
  res.setHeader('Cache-Control', detail ? DETAIL : LISTING);
}

/** Same policy, for the API routes (sitemap, robots) that Next serves directly. */
export function setFeedCache(res, seconds = 3600) {
  if (!res) return;
  res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 4}`);
}
