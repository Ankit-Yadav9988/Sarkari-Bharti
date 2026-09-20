# Official-notice collection pipeline

This is a producer for the existing admin importer. It discovers candidate
notices from the configured official source pages, extracts only high- or
medium-confidence facts, and creates a CSV for an administrator to review. It
never calls a write endpoint or publishes a job.

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
