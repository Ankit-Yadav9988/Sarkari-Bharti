# Official-notice collection pipeline

This is a producer for the existing admin importer. It discovers candidate
notices from the configured official source pages, extracts only high- or
medium-confidence facts, and creates a CSV for an administrator to review. It
never calls a write endpoint or publishes a job.

There are two collectors here, and they are separate on purpose. `run.js`
collects **vacancies** and writes `out/jobs-YYYY-MM-DD.csv`. `collect-notices.js`
collects **results and admit cards** and writes `out/notices-YYYY-MM-DD.csv`.
They read the same source list but almost nothing else is shared: different
columns, different duplicate rules, different schedules, and — importantly —
different state files and caches. See "Results and admit cards" below.

The source set includes Sarkari Result as a discovery index plus SSC, RRB, UPSC,
and five State PSCs: Uttar
Pradesh, Bihar, Rajasthan, Madhya Pradesh, and Uttarakhand. State PSC rows are
written with `category=STATE_PSC` and their configured state; they still require
the same human review as every other row.

Sarkari Result is never treated as the authority. Its detail pages supply a
candidate title, dates, and links; official notification/apply links are
preferred, and every candidate remains `PENDING_MANUAL` in the report until an
administrator checks it against the official notice.

## Local checks

```powershell
cd pipeline
npm test
node discover.js --dry-run
```

The dry run prints the page links and candidates but does not alter `seen.json`
or produce a CSV. Review that output after a source site changes, then adjust
the source URL or keyword list in `lib/sources.js` if necessary.

To create review files, configure the optional public backend API base and run:

```powershell
$env:SARKARI_API_URL = 'https://your-api.example/api'
node run.js
```

The output is `out/jobs-YYYY-MM-DD.csv` plus a matching Markdown report. The
CSV is a full current review queue, not only rows changed since the previous
run. Candidate rows and their extraction metadata are retained in `state` so
unchanged jobs are still written on subsequent runs.
API value is only read to avoid duplicating an already-published notification;
without it the run is still safe and reports that this filter was skipped.

`cache/` holds fetched document bodies and lets conditional GET responses reuse
their local copy. It is intentionally untracked. The GitHub workflow restores
that cache between runs.

## Results and admit cards

```powershell
cd pipeline
$env:SARKARI_API_URL = 'https://your-api.example/api'
npm run notices
```

The output is `out/notices-YYYY-MM-DD.csv` plus a matching Markdown report, in
the column shape the admin Import screen already accepts for notices. Two notice
types are collected: `RESULT` and `ADMIT_CARD`.

**Answer keys are excluded on purpose, not by oversight.** An answer key is
usually posted as a challenge window with a fee and a deadline, and it is
superseded by a revised key days later. A CSV reviewed once a day is the wrong
shape for that, so anything reading as an answer key is refused by the
classifier and listed in the report's "Looked at and left out" table. A notice
that is *both* — "Result cum Answer Key" — is refused too, rather than being
filed as a result, because the safer mistake is the one you can see.

**It does not download the linked documents.** Everything a notice row needs
(type, title, organisation, category, link, release date) is printed on the
listing page, so there is nothing inside the PDF to extract. Fetching each
candidate would mean downloading every result PDF in India, twice a day, to
change no column. The cost of that choice is worth stating plainly: a link that
404s is not caught here, so the import screen is where a dead link gets noticed.
This is also why the notice workflow installs no PDF text extractor.

**Its state and cache are its own.** `state/notices.json` and `cache-notices/`,
never the job run's `state/seen.json` and `cache/`. Two workflows on two
schedules both committing one state file would conflict on every overlap, and
sharing one cache directory would let each send an etag for a body the other had
since overwritten — which is exactly the failure that produced five
`Received 304 ... but its local cache is unavailable` errors on 2026-09-27.

A notice is deduplicated on type plus normalised title, with no date component,
because a result is published once. That key is mirrored in `frontend/lib/csv.js`
so the Import screen rejects the same repeat the collector would have. With
`SARKARI_API_URL` set, rows already live on the site are dropped before the CSV
is written; without it the run still produces a CSV and says in the report that
this check was skipped.

The schedule is 07:30 and 19:30 IST — twice the job collector's once, because a
result is refreshed by thousands of people the hour it is declared and an admit
card is only useful before the exam.

### Reading the report

The section worth reading first is "Looked at and left out". It lists the links
the collector saw and refused, each with the rule that refused it. An empty CSV
with a full "left out" table means the rules are working; an empty CSV with an
empty table means a source stopped answering. Menu items such as "About us"
appear there too, reading "no result or admit-card wording" — expected, because
the filter judges link text and has no separate idea of what a menu is. What to
scan for is a row whose text plainly announces a result or an admit card: that
means a rule has become too broad and is eating real notices.

## When a run goes red

A run fails when a source that *was* working stops working, or when nothing was
found at all. A source that has been failing for three runs or more is treated
as a known block: it stays listed as FAILED in the report, with how long it has
been down, but it no longer fails the run. The point is that red should mean
"something changed today", which is the only version of red worth reading.

Two consequences follow, and both are normal rather than broken. A newly added
source that has never answered will fail the run for its first two attempts,
because "never worked" and "blocked" are not distinguishable yet. And a report
can be green while listing six failed sources — read the health table, not the
badge, before deciding whether the day's CSV is a full picture.
