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

/** Fresh for a minute, servable stale for ten while it refreshes behind you. */
const LISTING = 'public, max-age=0, s-maxage=60, stale-while-revalidate=600';

/**
 * A single posting: the row itself changes rarely after it goes up, so a longer
 * fresh window is safe. The dates are the volatile part and they are absolute,
 * not relative, so a five-minute-old copy says the same thing as a live one.
 */
const DETAIL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600';

/**
 * Sets the header, unless the render is a failure.
 *
 * Skipping the header when the backend was unreachable is the whole reason this
 * is a function and not a constant. Caching an error page pins the outage to the
 * edge for the full window: the backend comes back, and the site stays broken
 * for everyone whose request lands on that cached copy. An uncached error page
 * is slow and correct; a cached one is fast and wrong.
 *
 * `res` is absent when Next calls getServerSideProps during a client-side
 * transition, so the guard is required rather than defensive.
 */
export function setListingCache(res, { backendError = false, detail = false } = {}) {
  if (!res || backendError) return;
  res.setHeader('Cache-Control', detail ? DETAIL : LISTING);
}

/** Same policy, for the API routes (sitemap, robots) that Next serves directly. */
export function setFeedCache(res, seconds = 3600) {
  if (!res) return;
  res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 4}`);
}
