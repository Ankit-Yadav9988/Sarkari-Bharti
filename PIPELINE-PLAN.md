# Automated job collection — the plan

**Status: for your approval. Nothing here is built yet.**

This describes how `DISCOVER → EXTRACT → VALIDATE → DRAFT → YOU APPROVE → PUBLISH`
will actually work for Sarkari Bharti, what it will genuinely do for you, and —
just as important — what it will **not** do. Read the "What this does not do"
section before you approve. If the plan oversells itself you will trust its
output more than you should, and that is how a wrong last date reaches a reader.

---

## 1. The most important thing: you are already two-thirds done

Your six stages are not six things to build. Four of them exist and are tested:

| Stage | Where it already lives | Tested by |
|---|---|---|
| VALIDATE | `frontend/lib/csv.js` (520 lines) | 142 assertions in `api-check.js`, 51 differential cases in `csv-diff.js` |
| DRAFT | `pages/admin/import.js` — parses, then shows you the rows | same |
| YOU APPROVE | the same screen — bad rows are listed with the reason, nothing is sent until you press **Import** | same |
| PUBLISH | `POST /jobs`, one row at a time, so one bad row cannot poison the batch | same |

`csv.js` already refuses a row where `lastDate` is before `applicationStartDate`,
where `ageMax` is below `ageMin`, where a `STATE_GOVT` posting has no state, where
a date is not a real date (it catches `2026-02-31`, which `new Date()` silently
turns into 3 March), and where two rows in the same file share a title and type.

**So we are not building a pipeline. We are building a producer** that writes a
CSV in exactly the shape `CSV_COLUMNS` already accepts, and then your existing
screen does the rest. This matters for a practical reason: the review-and-approve
code is the part that must never be wrong, and it is the part that already has
193 tests behind it. Rewriting it to make it "part of the pipeline" would throw
that away for no gain.

What is actually missing is **DISCOVER** and **EXTRACT**.

---

## 2. Where it runs

A **GitHub Actions scheduled workflow**, in your existing repo, on a cron.

Reasons, in order of importance:

1. **It cannot take your site down.** If a government server hangs for 90 seconds
   or a malformed PDF crashes the parser, that happens on GitHub's machine. Your
   Render service never notices. If this ran inside Spring Boot, a stuck download
   would hold a thread that should be serving a visitor.
2. **Free, and the free tier is not tight.** 2,000 minutes a month; this job
   should use 2–4 minutes a day.
3. **It gives us free memory.** The list of links we have already seen gets
   committed back to the repo as a small JSON file. No new table, no new
   Supabase rows, and you can read the file yourself to see what it knows.
4. **The logs are kept for you.** Every run's output is visible in the Actions
   tab, so when something looks wrong you can see exactly what it fetched.

It will run **once a day, early morning IST**, not hourly. Government
notification pages do not change hourly, and a polite crawler is one that does
not ask more often than the data changes.

---

## 3. DISCOVER — finding what is new

### The design decision that matters

The obvious way to scrape a site is to write CSS selectors: "the table with
class `notice-table`, third column, the link inside it". **I am not going to do
that**, for two reasons.

The honest one: I have no internet access in this sandbox, so I cannot look at
`ssc.gov.in` to see what its markup is. Any selector I wrote would be a guess
dressed up as code.

The better one: **selectors fail silently.** When a government site redesigns —
and they do, without notice — a selector stops matching and returns zero rows.
The pipeline then reports "no new jobs today" every day, forever, and looks
perfectly healthy while doing nothing. You would not find out for weeks.

### What it does instead

For each source page:

1. Fetch the page.
2. Pull out **every** `<a href>` and its text. No selectors, nothing
   site-specific. This is just "what links are on this page".
3. Resolve relative links against the page URL, drop anchors/`mailto:`/
   `javascript:`, and normalise (strip tracking parameters, lowercase the host).
4. Keep links whose **text or URL** matches recruitment keywords —
   `recruitment`, `vacancy`, `advertisement`, `advt`, `notification`, `apply
   online`, `notice`, plus `result`, `admit card`, `answer key` for the notice
   side. Case-insensitive, and Hindi equivalents too.
5. Compare against `seen.json` in the repo. Anything not in it is a **candidate**.

This survives a redesign, because a redesigned page still has links.

### The anti-silent-failure rule

A source that returns **fewer than 5 links in total** is reported as a **FAILURE**,
not as "nothing new".

This is the single most important line in the whole design. The failure mode that
actually hurts you is not a crash — you would see a crash. It is the pipeline
quietly succeeding at nothing. A real government notification page always has
dozens of links; five is impossible. So "I found 2 links" means the fetch was
blocked, or the page moved, or the site is serving an error page with HTTP 200 —
and the run stops and tells you, instead of writing an empty CSV and calling it a
day.

Same rule for the summary: if the pipeline has produced **zero new candidates for
7 consecutive days**, the run says so loudly. That is possible but unusual, and
it is worth a human glance.

### Sources, to start

Three, as you chose, because doing three properly beats doing twenty badly:

| Source | `organization` written into the CSV | `category` |
|---|---|---|
| Staff Selection Commission | `Staff Selection Commission` | `SSC` |
| Railway Recruitment Board | `Railway Recruitment Board` | `RAILWAY` |
| Union Public Service Commission | `Union Public Service Commission` | `UPSC` |

Note that `organization` and `category` are **not extracted**. They are constants
attached to the source. A link found on the SSC notification page is an SSC
posting; there is nothing to get wrong. Two fields filled correctly, 100% of the
time, for free.

`state` is left blank for all three, which your site already treats as
central/all-India. Also correct, also free.

### Being a good guest on government servers

These are public-service sites with modest capacity, and this site depends on
them. The crawler will:

- read and obey `robots.txt` before fetching anything from a host;
- make **one request at a time**, with a 2-second pause between them — no
  parallel fetching;
- send a real `User-Agent` naming the site and a contact URL, so an
  administrator who sees the traffic knows who it is and can reach you;
- use **conditional GET** (`If-None-Match` / `If-Modified-Since`), so a page that
  has not changed costs a `304` and no body;
- cache every PDF it downloads and never download the same URL twice;
- give up after 2 retries with a backoff and report the source as failed.

On content: dates, post counts and advertisement numbers are **facts**, and facts
are not copyrightable. What we will not do is republish the body of a
notification PDF wholesale. Your site's existing behaviour — a short factual
summary plus a link to the department's own PDF — is both the legally clean
choice and the one that serves the reader, and the pipeline keeps it.

---

## 4. EXTRACT — the hard part, described honestly

For each new candidate link: download it, get text out of it (PDFs via
`pdftotext`, HTML by stripping tags), and run field extractors over that text.

### The rule: never guess. Leave it blank.

Every extractor returns a value **and a confidence**. If confidence is low, the
cell is written **empty**.

A blank cell costs you thirty seconds of typing. A wrong last date that looks
right costs a reader the job. These are not comparable, so the pipeline is
built to be under-confident on purpose.

### What it can realistically fill, graded honestly

| Field | Realistic | Why |
|---|---|---|
| `postName` | **High** | Usually the link text or the PDF title |
| `organization` | **Certain** | Constant per source, not extracted |
| `category` | **Certain** | Constant per source, not extracted |
| `notificationPdfUrl` | **Certain** | It is the link we followed |
| `advertisementNo` | **Medium** | `Advt. No.` / `Advertisement No.` patterns are common but far from universal |
| `applicationStartDate` | **Medium-low** | Many date formats, often inside a table, often revised later |
| `lastDate` | **Medium-low** | Same, and frequently extended by a separate corrigendum |
| `totalPosts` | **Medium-low** | Sometimes a stated total, often only a per-post table that has to be summed |
| `officialApplyLink` | **Low** | Often not in the PDF at all; the portal opens later |
| `ageMin` / `ageMax` | **Low** | Usually varies per post within one notification |
| `eligibility` | **Low** | Prose, and different for every post in the same advert |
| `selectionProcess` | **Low** | Same |
| `fee*` / `relax*` | **Low** | A table by category, layout varies by department |

Read that table again before you approve, because it is the real answer to
"can we automate this". **The pipeline finds the notification, identifies it, and
types the skeleton. You still read the PDF for the details.**

Concretely: `applicationStartDate` and `lastDate` are **required** by your own
validator. So a row where the dates could not be read with confidence will be
written into the CSV with blanks, and your import screen will list it under
"skipped" with the reason — which is the correct outcome. It appears in front of
you, with its PDF link, asking to be filled in. It does not get published with a
guessed date.

### Dates specifically

Indian notifications use `14/10/2026`, `14-10-2026`, `14.10.2026`,
`14 October 2026`, `October 14, 2026` and more. All of these will be parsed
day-first, matching `toIsoDate()` in your `csv.js`, which already documents why:
`14/10` is unambiguous and `10/14` would be read wrong half the time.

A date is only accepted when it appears near a label that says what it is
("last date", "closing date", "online application begins"). A date floating in
the text with no label is ignored. Sanity bounds: nothing before today minus one
year, nothing after today plus two years.

---

## 5. What comes out

One file per run:

```
pipeline/out/jobs-2026-09-20.csv        # matches CSV_COLUMNS exactly
pipeline/out/jobs-2026-09-20.report.md  # what it did, what it skipped, and why
```

The CSV headers are generated **from your `CSV_COLUMNS` array**, not typed by
hand, so the two can never drift apart. The report is for you and lists: each
source, pages fetched, links seen, new candidates, rows written, and for every
row which fields were left blank and why.

You then open `/admin/import`, choose the file, and your existing screen takes
over. Nothing about that screen changes.

### Not publishing the same job twice

Before writing the CSV, the pipeline fetches your live `/api/jobs` and drops any
candidate whose notification URL is already published. Your importer's duplicate
check works *within* one file; this one works *against the site*. Both are worth
having.

---

## 6. How it fails, and what happens when it does

| Failure | What the pipeline does |
|---|---|
| Source site redesigns | Link-count floor trips → run reported as FAILED for that source |
| Source site is down | 2 retries, then that source is marked failed; **the other sources still produce their rows** |
| PDF is a scanned image with no text | Row is written with name + link only, flagged `needs-manual` in the report |
| A date is extended by a corrigendum | The PDF is content-hashed as well as URL-keyed, so a re-issued file at the same URL is re-flagged as a candidate |
| Nothing new for a week | Reported loudly in the summary rather than passing quietly |
| Anything unexpected | The run fails. **It never writes a partial CSV**, because a partial file that looks complete is worse than no file |

---

## 7. What this does NOT do

Stated plainly, so there are no surprises later:

- **It does not decide what to publish.** It has no judgement. You do.
- **It does not read PDFs as well as you do.** Expect to fill in eligibility,
  fees, age limits and often the dates yourself.
- **It will miss notifications.** Keyword filtering is not perfect, and a
  notification posted with an unusual title will not match.
- **It will produce false candidates** — corrigenda, old notices being re-linked,
  non-recruitment circulars. You will reject some rows. That is the system
  working, not failing.
- **It does not touch your database directly.** It cannot. It only writes a file.
- **It does not remove your approval step**, now or later. If that step is ever
  removed, this site becomes a scraper that republishes whatever it finds — and
  the only real advantage you have over the competition is that a person checked.

---

## 8. What I need from you to finish it

Because I cannot reach the internet from here, the last mile has to happen on
your machine. It is two commands.

After I build it, you run:

```
cd pipeline
npm install
node discover.js --dry-run
```

`--dry-run` fetches the three source pages, prints every link it found and which
ones it thinks are recruitment notices, and **writes nothing**. You paste that
output back to me. I then tune the keyword filters and the source URLs against
what the pages really contain, instead of against what I imagine they contain.

That is the honest workflow. One round trip, and the filters are fitted to the
real sites.

---

## 9. Build order

1. `pipeline/lib/csv-out.js` — writes a CSV from `CSV_COLUMNS`, so the contract
   with your importer is generated, not duplicated. **Testable with no network.**
2. `pipeline/lib/dates.js` — Indian date formats → ISO, with the label rule and
   the sanity bounds. **Testable with no network.**
3. `pipeline/lib/extract.js` — the field extractors, each returning
   value + confidence. **Testable with no network**, against text fixtures.
4. `pipeline/discover.js` — fetch, link-extract, keyword filter, `seen.json`
   diff, the link-count floor. Needs the network only for the real run;
   `--dry-run` and the parsing are testable offline.
5. `pipeline/run.js` — ties it together, writes the CSV and the report.
6. `.github/workflows/collect.yml` — the daily cron.
7. `pipeline-check.js` — a harness in the same style as your others, with
   negative controls, so every rule above is proved to bite.

Steps 1, 2, 3 and 7 are the majority of the code and none of them need the
internet, so they can be written and properly tested right now. Step 4's
selectors-free design means it needs your one `--dry-run` round trip to be
finished honestly.

---

## 10. Your decision

Approve, or tell me what to change. Two things especially worth your view:

- **Daily at 6am IST** — or more often?
- **Should notices (results / admit cards) be in the first build?** They are
  genuinely easier: `import-notices.js` needs only a title and a link, so
  extraction confidence is high and almost nothing gets left blank. Doing them
  first would get you a working, high-accuracy pipeline sooner, and the hard
  vacancy extraction could follow.
