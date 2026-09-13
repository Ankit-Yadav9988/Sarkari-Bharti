# Sarkari Bharti

A government-job portal for Indian aspirants — notifications, admit cards,
results, answer keys, syllabi, cut-offs, an exam calendar and previous-year
papers, in English and Hindi.

Live at <https://sarkari-bharti.vercel.app> — frontend on Vercel, backend on
Render, PostgreSQL on Supabase.

Two projects that talk to each other over HTTP:

- `backend/` — Spring Boot 3.2 REST API on PostgreSQL, schema owned by Flyway
- `frontend/` — Next.js 14 (pages router), server-rendered, plain CSS

## Getting started

**Setup, changing the admin password, and deploying to production are all in
[DEPLOY.md](DEPLOY.md).** Read that rather than improvising from this file — every
credential is an environment variable with no fallback, and the application
refuses to start if one is missing or looks like a placeholder.

Turning on subscriber email alerts is a separate, optional step:
[SETUP-EMAIL.md](SETUP-EMAIL.md).

The short version, once the prerequisites in DEPLOY.md are installed and
`DB_PASSWORD`, `JWT_SECRET` and `ADMIN_PASSWORD_HASH` are set:

```bash
psql -U postgres -c "CREATE DATABASE sarkari_portal;"

cd backend && mvn spring-boot:run          # http://localhost:8080/api
cd frontend && npm install && npm run dev  # http://localhost:3000
```

Flyway creates the tables on first start. Hibernate runs with `ddl-auto=validate`,
so it checks the schema matches the entities and never alters a table itself.

## Public pages

| Page | URL |
|---|---|
| Home — digest of every section, with search | `/` |
| Latest jobs — open applications, days-left badges | `/latest-jobs` |
| Upcoming jobs — notified, not yet open | `/upcoming-jobs` |
| All jobs — filterable by category and state | `/jobs` |
| Job detail | `/jobs/[slug]` |
| Admit card / Result / Answer key | `/admit-card`, `/result`, `/answer-key` |
| Syllabus | `/syllabus` |
| Cut off | `/cut-off` |
| Exam calendar | `/exam-calendar` |
| Previous year papers | `/previous-year-papers` |
| Admission | `/admission` |
| Category and state landings | `/ssc-jobs`, `/railway-jobs`, `/uttar-pradesh-jobs`, … |
| About, Contact, Privacy, Disclaimer | `/about`, `/contact`, `/privacy`, `/disclaimer` |

Every public page also exists in Hindi under `/hi/…`, cross-declared with
`hreflang` and listed in the sitemap. The Hindi routes are real URLs, not a
client-side toggle, so they are linkable and indexable.

`/sitemap.xml` and `/robots.txt` are generated per request from the live database.

## Admin pages

One admin account, configured entirely by environment variable — there is no user
table and no signup. All reads are public; every write requires the token.

| Screen | URL |
|---|---|
| Login | `/admin/login` |
| Jobs | `/admin/manage`, `/admin/add-job`, `/admin/edit-job/[id]` |
| Bulk import | `/admin/import` |
| Admit cards / results / answer keys | `/admin/notices?type=ADMIT_CARD` |
| Syllabi | `/admin/syllabi` |
| Cut offs | `/admin/cutoffs` |
| Exam calendar | `/admin/exam-calendar` |
| Previous year papers | `/admin/papers` |
| Subscribers | `/admin/subscribers` |

The admin area sends `X-Robots-Tag: noindex, nofollow` and is disallowed in
robots.txt, under both locale prefixes.

## Security posture

- Admin password stored as a BCrypt hash at cost 12, never plaintext; verification
  runs unconditionally so a wrong username and a wrong password take the same time
- JWT signed with an env-sourced secret, validated at startup for length, variety
  and known placeholder values; tokens carry an explicit role claim and issuer, and
  both are required on the way back in
- CORS origins from the environment, validated at startup — no wildcards, scheme
  required, trailing slash rejected
- Rate limiting per client IP on login and on the subscribe endpoint
- Error responses carry no stack traces, no exception messages and no binding
  errors; SQL parameters are never logged
- HSTS, `X-Frame-Options: DENY`, `nosniff`, and a strict referrer policy

Details, and how to rotate either secret, are in [DEPLOY.md](DEPLOY.md).

## Known limitations

Content entry is manual — there is no scraper and no RSS ingestion. `about`,
`contact`, `privacy`, `disclaimer` and the whole admin area are English only.
Notification PDFs are linked by URL rather than uploaded.
