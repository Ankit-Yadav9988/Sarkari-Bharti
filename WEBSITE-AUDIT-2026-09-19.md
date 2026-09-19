# Website audit — 19 September 2026

## Scope and result

This audit covered the Next.js frontend, Spring Boot source, production build,
local HTTP behaviour, security headers, public feeds, and the new official-notice
collection pipeline.

The frontend production build and the new pipeline's offline contract suite
pass. Static public pages, `/sitemap.xml`, and `/robots.txt` return HTTP 200
locally. Data-backed pages correctly return HTTP 503 with `Retry-After: 120`
when their API is unavailable, rather than caching an empty page as a false
success.

## Completed in this change

- Added the complete `pipeline/` producer: link discovery, robots-aware polite
  HTTP client, conditional document cache, strict Indian-date extraction,
  conservative job skeleton extraction, generated importer CSV, review report,
  persistent seen state, and a 40-check offline test harness.
- Added official sources for SSC, RRB, UPSC, and five State PSCs (UPPSC, BPSC,
  RPSC, MPPSC, and UKPSC). The extractor now follows linked notification PDFs,
  rejects untranslated/placeholder portal rows, and fills labelled age,
  qualification, selection, fee, relaxation, apply-link, and milestone fields
  when the official document contains them.
- Added `.github/workflows/collect.yml`, scheduled for 06:00 IST, with PDF text
  extraction and persisted document cache.
- Made the producer read the frontend's actual `CSV_COLUMNS`, then validate its
  own output through the frontend's importer before writing it. It never writes
  to the application database.
- Added pipeline usage and configuration notes in `pipeline/README.md`.

## Verification evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Pipeline contract test | Pass | `npm test` in `pipeline/`: 40 checks passed |
| Frontend production build | Pass | `npm run build` completed all 87 pages |
| Static public routes | Pass | `/about`, `/contact`, `/privacy`, `/disclaimer`, `/unsubscribe`, `/sitemap.xml`, and `/robots.txt` each returned 200 |
| Public-page protections | Pass | `nosniff`, `SAMEORIGIN`, strict referrer policy, restrictive Permissions Policy, and framework header removal present |
| API outage handling | Pass | `/latest-jobs` returned 503 plus `Retry-After: 120` while localhost API was offline |
| Backend automated tests | Not run | Maven is not installed in this environment |
| Browser visual audit | Not run | No browser automation surface was available in this environment |

## Findings requiring follow-up

### P1 — Start and monitor the backend in local and preview environments

`frontend/.env.local` points to `http://localhost:8080/api`, but no backend was
running during the audit. All data-backed routes (`/`, job listings, notices,
syllabus, cut-offs, calendar, and papers) consequently returned 503. This is
the intended temporary-failure response and the page body remains styled, but a
working backend is required before local or preview content can be reviewed.

**Action:** install Maven or use the project's supported backend runtime,
configure the required database and secrets, then start the backend before
visual smoke testing.

### P1 — Run the first real pipeline dry run before enabling trust in output

The source URLs and filters are configured against current official SSC, RRB,
and UPSC pages, but no live crawler run was made from this restricted workspace.
The first real run must be reviewed because government sites can alter wording,
markup, robots policies, or link destinations without notice.

**Action:** run `cd pipeline; node discover.js --dry-run`, inspect the printed
links/candidates, and tune `pipeline/lib/sources.js` only from that output.

### P2 — Configure `SARKARI_API_URL` as a GitHub Actions repository secret

The workflow remains safe without this value, but cannot exclude notices whose
PDF URLs are already published. It reports that duplicate filtering was skipped
instead of silently pretending it ran.

**Action:** set `SARKARI_API_URL` to the public backend base ending in `/api`.

### P2 — Enforce job validation at the API boundary

The job create and update endpoints accept `@RequestBody Job` directly. The
browser form and CSV importer catch common mistakes, but an authenticated
direct API call can still submit blank strings, dates in the wrong order,
negative counts, or an invalid state/category relationship. Database constraints
cover only some of those cases.

**Action:** introduce a request DTO with Bean Validation annotations, add
`@Valid` in `JobController`, and enforce the cross-field checks in the service.

### P3 — Add a Content-Security-Policy after testing ads and analytics

The site already sends several useful security headers, but it does not send a
Content-Security-Policy. JSON-LD is safely escaped before its inline script is
rendered, so this is defence-in-depth rather than evidence of an active XSS
issue.

**Action:** deploy CSP in report-only mode first, allow the required AdSense and
analytics origins, then enforce it after observing violations.

### P3 — Complete a visual/browser pass once a browser is available

Build and HTTP checks prove routes compile and respond, but they cannot prove
mobile layout, focus order, visual overflow, or client-side navigation. The
attempted local browser audit could not start because this workspace exposes no
browser surface.

**Action:** with backend running, verify home, a populated listing, a job detail,
search, language switch, subscribe/unsubscribe, and admin import in a real
browser at desktop and mobile widths.

## Notes

- The existing uncommitted change in `frontend/lib/csv.js` was preserved. The
  pipeline intentionally consumes that file's current column contract rather
  than duplicating it.
- The `robots.txt` result of `Disallow: /` is correct for this local/preview
  environment. The generator does that when the configured site URL is not the
  production URL, protecting previews from indexing.
- The PowerShell `npm.ps1` wrapper emitted an environment-level access warning,
  but both the pipeline suite and the frontend build completed successfully.
