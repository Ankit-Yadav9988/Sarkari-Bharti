# RojgarHub — audit and improvement plan

Reviewed 3 September 2026. Covers the whole repo: 47 frontend source files, the
Spring Boot backend, and the deployment config. The frontend look was rebuilt in
this session; everything below the "what changed" section is what I found and
did *not* touch, because backend and security were out of scope.

---

## The short version

The frontend is now competitive. Structurally, this project is not ready to go
live, and the gap between it and Sarkari Result is no longer a design gap — it's
a content-velocity and SEO gap, with one outright security hole in front of it.

Three things in priority order:

1. **The JWT secret is still the placeholder string committed in
   `application.properties`.** Anyone who can read the repo can mint themselves
   an admin token. This is a full authentication bypass and it has to be fixed
   before the site is publicly reachable.
2. **Nothing is cached and every request scans the whole jobs table.** The
   homepage alone fires six of those scans. Result-day traffic will take it down.
3. **There is no way to publish fast enough to compete.** Sarkari Result's moat
   is 20–40 hand-posted items a day. Yours needs one person to fill one long
   form per posting. Design was never the thing holding this back.

---

## 1. Blocking before public deploy

These are all in the backend, which I left alone deliberately. Listed worst
first.

**The JWT signing secret is a known public string.** `jwt.secret` in
`application.properties` is still
`replace-this-with-a-long-random-string-at-least-32-chars`. Because
`JwtAuthFilter` accepts any correctly-signed token and grants it whatever
username the token claims, an attacker signs `{sub: "admin"}` with that known
value and has full write access to every endpoint. Fix: generate a real 256-bit
secret, load it from an environment variable, and never commit it. Rotate it —
changing the file is not enough if the old value was ever pushed.

**The admin password is stored in plaintext and compared with `.equals()`.**
`AuthController` does a direct string comparison against a plaintext value in
the properties file. Two problems: the credential is readable by anyone with
repo or filesystem access, and `.equals()` is not constant-time. Fix: store a
BCrypt hash, verify with `PasswordEncoder`, source it from the environment.

**The database password is plaintext in the same file.** Same fix — environment
variable.

**CORS is hardcoded to `http://localhost:3000`.** `CorsConfig` pins the single
allowed origin to localhost, so every API call from the deployed frontend will
be blocked by the browser the moment you ship. Make the origin list an
environment variable with the production domain in it.

**No rate limiting anywhere.** `POST /api/auth/login` accepts unlimited password
guesses. `POST /api/subscribers` lets anyone flood the mailing list with junk
addresses. `POST /api/jobs/{id}/view` is unauthenticated with no deduplication
at all, so the view counts you display as social proof can be inflated to any
number with a shell loop. Add a bucket filter (Bucket4j is the least invasive
option in Spring), and gate the view counter on an IP-or-session window.

**Production JPA settings are development settings.**
`spring.jpa.hibernate.ddl-auto=update` lets Hibernate mutate your live schema on
every boot — this is how production data gets silently dropped. Move to
`validate` plus Flyway migrations. Turn `show-sql=true` off; it logs every query.

**I added a `.gitignore` at the repo root, because there wasn't one.** Nothing
has leaked yet — no git repository has been initialised — but before that file
existed, `git init && git add .` would have committed `frontend/.env.local` and
97 MB of `backend/target/` build artifacts. Verify the ignore rules take effect
before your first commit.

---

## 2. It will not survive its first busy day

**Every list request reads the entire table.** `JobService.getJobs()` calls
`findAll()` and then filters in memory; `paginate()` on the frontend slices an
array that was already fetched in full. So the API ships every row over the wire
and the page throws most of them away. The code comment reasons that this is
"hundreds, not millions" of rows — true today, but a portal that covers state
boards accumulates tens of thousands, and the homepage now issues six of these
calls concurrently. Push filtering, sorting, and `LIMIT`/`OFFSET` into the query;
add indexes on `category`, `state`, and `lastDate`.

**There is no caching layer of any kind.** Every page uses
`getServerSideProps`, so every single visitor triggers fresh backend calls.
Traffic on this kind of site is extremely spiky — a result declaration is 100×
baseline within minutes. Switch the listing pages to `getStaticProps` with
`revalidate` (60–300 seconds is plenty; nothing here is real-time), or at
minimum set `Cache-Control: s-maxage` so a CDN can absorb the spike.

**The view counter writes to Postgres on every page load.** `findById` followed
by `save`, synchronously, in the request path. Batch these in memory and flush
periodically, or move them to a separate counter table.

**Full JPA entities are serialised straight to JSON.** No DTO layer means any
field you add to `Job` is immediately public, and internal fields leak by
default. Add response records.

---

## 3. The actual competitive gap

This section matters more than the two above, because the two above are
solvable in a week and this one is the business.

**You cannot publish fast enough.** Sarkari Result wins on latency: a
notification drops and it's live within minutes, 20–40 items a day, across every
state board. Your admin flow is one human filling one long form per posting.
Nothing about the design fixes this. The options, cheapest first: a "duplicate
this posting" button (most notifications are near-copies of last year's); bulk
CSV import; then RSS or scraper ingestion from the official sites into an
approval queue, so the human reviews rather than types. Until publishing is
cheap, the site cannot be a competitor regardless of how it looks.

**There are no pages for the queries people actually search.** Traffic on these
portals comes from "ssc gd result", "up police admit card", "rrb ntpc syllabus" —
exam-specific and organisation-specific searches. You have category *filters*
(`/jobs?category=SSC`) but no landing pages, and Google treats query-string
variants as weak duplicates. Add real static routes: `/ssc-jobs`,
`/railway-jobs`, `/uttar-pradesh-jobs`, and ideally `/exam/[slug]` pages that
aggregate a single exam's notification, admit card, answer key, result, and
syllabus in one place. This is the single highest-return SEO change available.

**Job URLs are bare IDs.** `/jobs/5` carries no keywords and looks untrustworthy
when forwarded. Move to `/jobs/sbi-clerk-recruitment-2026-5` — keep the numeric
suffix so existing links still resolve.

**The highest-traffic content types are missing.** You cover admit cards,
results, answer keys, and syllabi. Competitors also run cut-off marks, an exam
calendar, previous-year papers, and pay-scale detail. Cut-offs and previous-year
papers are consistently among the most-visited pages on sites like this, and
they're evergreen rather than expiring.

**The Hindi version does not exist as far as Google is concerned.** The language
toggle is client-side localStorage only, so both languages share one URL. Google
indexes the English text and you rank for nothing in Hindi — a large share of
this audience. Fix properly with Next.js i18n routing (`/hi/...`) plus
`hreflang` tags, so there are real server-rendered Hindi URLs.

**Hindi coverage is also incomplete in the UI.** I moved the backend-error
message into the dictionary this session, but page subheadings, several empty
states, and some action labels are still hardcoded English. A Hindi user
currently sees a half-translated page.

**The sitemap is not reachable.** `robots.txt` advertises
`https://rojgarhub.in/sitemap.xml`, but the generator is served from
`/api/sitemap` — so Search Console fetches a 404 and none of your pages get
submitted. I fixed this with a rewrite in the `next.config.js` I added; verify it
after deploy.

**No analytics, no Search Console verification, no ad slots.** For an
ad-supported traffic business, measurement and monetisation are the product, and
there is currently zero instrumentation. Add these before launch, not after —
you want the baseline.

**`NEXT_PUBLIC_SITE_URL` is not set.** Canonical tags and OG URLs currently fall
back to the hardcoded `https://rojgarhub.in`. If you deploy anywhere else first,
every canonical URL will point at a domain you don't control yet. Also:
`.env.local` points at port 8081 while `.env.local.example` says 8080 — worth
reconciling so a new machine works on first run.

---

## 4. Trust signals worth adding

These are cheap and they matter in a category full of scam sites.

Show a "last updated" timestamp on listings — users need to know the data is
fresh, and competitors date everything. Add a visible "Source: ssc.nic.in" link
on each job page; linking out to the official notification is what makes the
page believable. And note that `AdminGuard` only checks whether a token
*exists*, not whether it's valid, so an expired session renders the full admin
UI and then fails silently on every action; have it verify or handle the 401 by
redirecting to login.

---

## 5. What the rebuild changed

For context on what's already done. The site went from a low-density brown and
cream card layout to a dense, boxed, colour-coded one in the mould of the
competitor — which is the direction you picked.

The homepage now renders **70 links across 7 boxes in 2 three-column grids**, up
from roughly 8 links above the fold. It also surfaces all six content types;
previously answer keys, syllabi, and admissions had pages and nav entries but no
homepage presence at all, because `getServerSideProps` only fetched three of the
six available datasets. Base font dropped to 15px, the container widened to
1180px, and corner radii went to 4px, all in service of density.

Job detail pages were rebuilt around bordered data tables with coloured captions
and `scope="row"` headers, with the apply CTA moved above the tables. The share
row is now server-rendered — it previously waited for a client-side
`window.location` read, so the WhatsApp button, which is your main distribution
channel, was absent from the initial HTML.

Alongside that: a custom 404 that routes people onward (removed postings keep
getting forwarded for months), a closing-soon ticker derived from real dates
rather than hardcoded, countdown tags on expiring applications, a link-dense
four-column footer for internal linking, and `noIndex` on search-result URLs.
Accessibility got a focus-visible ring, `prefers-reduced-motion` handling that
disables the ticker and the NEW pulse, and 16px form inputs so iOS stops zooming
on focus. Every legacy CSS class and variable was kept as an alias so the
untouched admin pages still render correctly.

I also generated the brand assets the code already referenced but that never
existed: `og-default.png` (SeoHead pointed at it, so every forwarded WhatsApp
link previewed as a blank box), a favicon, and an apple-touch-icon.

**Verification.** `next build` cannot run in my Linux environment — your
`node_modules` was installed on Windows and ships only the win32 SWC binary, and
I have no registry access to fetch the Linux one. Instead I parsed all 47 source
files with Next's own bundled Babel parser and server-rendered all 15 pages with
fixtures built from the real JPA entities. Result: every file parses, every
import resolves to an existing export, every page has a default export, all 63
translation keys exist in both languages (71 defined in each), every CSS class
and custom property resolves, 15/15 pages render, and 26/26 markup assertions
pass — including that sparse records never print `null`, that a zero fee renders
as "No fee", and that error states never expose internal detail. That exercises
parse, module wiring, and every render path, but it is not the same as a real
build: **run `npm run build` on Windows before you deploy.**

---

## Suggested order of work

| # | Task | Why now |
|---|---|---|
| 1 | Real JWT secret from env, rotated | Open auth bypass |
| 2 | BCrypt the admin password; move DB password to env | Plaintext credentials |
| 3 | Env-driven CORS origins | Site is broken on deploy without it |
| 4 | `ddl-auto=validate` + Flyway; `show-sql=false` | Protects live data |
| 5 | Rate-limit login, subscribe, view counter | Trivially abusable today |
| 6 | `npm run build` on Windows | Confirms the rebuild compiles |
| 7 | ISR or CDN cache headers on listing pages | First traffic spike |
| 8 | DB-level filtering, pagination, indexes | Same |
| 9 | Analytics + Search Console + sitemap verified live | Get a baseline before launch |
| 10 | Static exam and state landing pages; slugged job URLs | Largest SEO return |
| 11 | Faster publishing: duplicate-posting button, then CSV, then ingestion | The actual moat |
| 12 | Real `/hi/` routes with `hreflang`; finish the translations | Large untapped audience |
| 13 | Cut-offs, exam calendar, previous-year papers | Evergreen traffic |

Items 1–5 are backend changes I did not make, because you asked me to leave
backend and security alone. Say the word and I'll work through them.
