# SPEED.md — measuring and fixing slow pages

You asked to use **Lighthouse and GTmetrix** for slow loading, especially
"when a user is clicking on job it is taking time to load".

Read the next section before you run either tool, because it decides how you
read the scores.

---

## 1. The most important thing on this page

**Lighthouse and GTmetrix cannot measure the problem you described.**

That is not a criticism of the tools. It is what they do:

- Both tools open a **fresh browser**, type a URL, and measure the page loading
  from nothing. That is called a **document load**.
- When a visitor is already on your site and **clicks a job**, no document
  loads. Next.js keeps the page open and quietly asks the server for the new
  page's data in the background. That is a **client-side navigation**.

Lighthouse and GTmetrix never see that click. So you can score 95+ in both
tools and clicking a job can still feel slow. Both things can be true at once.

So this file has two halves:

- **Part A** — the click problem, which is the one you actually reported.
- **Part B** — Lighthouse and GTmetrix, which measure the *first* page load.
  Still worth doing. Just a different problem.

---

## Part A — clicking a job feels slow

### What is happening, step by step

1. Visitor is on the job list. They click a job.
2. Next.js asks your Render backend for that job's data.
3. Render answers. **Nothing on the screen changes while this happens.**
4. The job page appears.

Step 3 is the whole problem. Every page on this site uses
`getServerSideProps` (I checked all 15 pages — none of them use
`getStaticProps`), which means every single click waits for your server.

### Why it felt broken, not just slow

Until now there was **no loading indicator anywhere on the site.** I searched
the whole frontend for one and there was nothing.

This matters more than it sounds. When you click a link on a normal website,
the browser shows its own spinner in the tab. On a client-side navigation the
browser shows **nothing**, because as far as the browser is concerned you
never left the page.

So a visitor clicked a job and the screen sat completely still for two or three
seconds. That does not read as "loading". It reads as "the click didn't work"
— so they click again. A second click starts a second request, which makes the
first one slower. The site punished people for being impatient.

### What I changed

I added a thin progress bar across the top of the page during navigation.

- `frontend/components/RouteProgress.js` — new file
- `frontend/pages/_app.js` — mounts it on every page
- `frontend/styles/globals.css` — the bar's styling

Details that matter:

- **It waits 150ms before appearing.** Fast navigations show no bar at all. A
  bar that flashes for 80ms is worse than no bar.
- **It never reaches 100% on its own.** It creeps to 90% and stops there until
  the page actually arrives. A bar that fills up and then keeps waiting is a
  bar nobody trusts the second time.
- **It survives double-clicks.** If someone clicks twice, the first navigation
  is cancelled and the bar carries on with the second one instead of getting
  stuck.
- **It adds no dependency.** The usual library for this (NProgress) is about
  4 kB plus its own stylesheet, for something that is one file here.

**Be clear about what this does:** it does not make anything faster by one
millisecond. It makes the wait *visible*. That is the difference between a site
that feels slow and a site that feels broken — but the wait is still there.

To actually shorten the wait, see the next section.

### The real fix, which I have NOT done — please decide

The job page could stop asking your server on every click.

Right now `frontend/pages/jobs/[id].js` uses `getServerSideProps`: the server
builds the page fresh for every single visitor, every single time. But a job
posting barely changes. The same job is rebuilt from scratch for a thousand
visitors when one build would have served all of them.

The alternative is **ISR** (Incremental Static Regeneration): Next.js builds
the page once, serves that copy instantly from the CDN, and quietly rebuilds it
in the background every few minutes.

The difference for your visitors:

| | Now (`getServerSideProps`) | With ISR |
|---|---|---|
| Where the page comes from | Your Render backend, every click | Vercel's CDN, usually |
| If Render is slow | Visitor waits | Visitor does not notice |
| If Render is down | Page fails | Old copy still shows |
| How fresh | Always current | Up to a few minutes old |

**Why I have not done it:** it changes how your site deploys, and it has a real
trade-off. With `revalidate: 300`, a job you edit in the admin panel can take
up to 5 minutes to update on the live site. For a closing date correction on a
deadline day, that delay is not nothing.

This is your call, not mine. Tell me yes and I will do it and test it properly.

Two smaller things I can also do if you want them, both lower risk:

1. **Prefetch on hover.** When someone's mouse rests on a job link, start
   fetching that page before they click. On desktop this often removes the wait
   entirely. Does nothing on mobile, where there is no hover.
2. **Keep the backend warm.** You already solved Render's sleeping with your
   health API. Worth confirming the pinger is still running, because if it ever
   stops, every one of these problems comes back at once.

---

## Part B — Lighthouse and GTmetrix

These measure the first load of a page. Worth doing, and worth doing **after**
you deploy the changes above, so you are measuring the real site.

### Running Lighthouse

You need Node installed, which you already have. Open a terminal and run these
one at a time.

**Mobile first.** This is the one that counts — most of your visitors are on
phones, and it is the stricter test:

```
npx lighthouse https://sarkari-bharti.vercel.app --view
```

**Then desktop:**

```
npx lighthouse https://sarkari-bharti.vercel.app --preset=desktop --view
```

**Then a job page.** Open your site, click any job, copy the address from the
browser bar, and put it in place of the URL below:

```
npx lighthouse https://sarkari-bharti.vercel.app/jobs/PASTE-REAL-SLUG-HERE --view
```

`--view` opens the report in your browser when it finishes. The first run
downloads Lighthouse, so it will be slow once and fast after that.

Easier option if the terminal is annoying: open the page in Chrome, press
**F12**, click the **Lighthouse** tab, choose Mobile, click **Analyze page
load**. Same tool, same numbers.

### Running GTmetrix

1. Go to https://gtmetrix.com
2. Paste `https://sarkari-bharti.vercel.app`
3. **Make a free account before testing.** Without one you get a test server in
   Canada, and your visitors are in India. With an account you can pick a test
   location — **choose Mumbai or Hong Kong**, whichever is offered. A Canadian
   test of an India-focused site is measuring a journey nobody makes.
4. Run it once for the homepage and once for a real job page.

### What to do about the first run

**Run it once before you change anything else and save both reports.** Without
a "before", the "after" is just a number with nothing to compare it to.

### What I expect the scores to show

I could not run either tool myself — this sandbox has no network access and no
Chrome, so anything I told you about your actual scores would be invented. What
follows is what I can tell from reading the code, and you should treat it as a
prediction to check, not a result.

The usual reasons a site scores badly mostly **do not apply to you**:

- **No images at all.** I searched — the site has zero `<img>` tags. "Properly
  size images" and "serve images in next-gen formats", normally the biggest
  items in any report, cannot apply.
- **No web fonts.** No Google Fonts, no `@font-face`. Font loading is usually a
  top-three complaint and you have none of it.
- **One third-party script**, Google Analytics, already loaded with
  `strategy="afterInteractive"` so it does not block the page.
- **Compression and security headers** are already on in `next.config.js`.
- **The connection to your API is pre-warmed** with `preconnect` in `_app.js`.

So I expect reasonable scores, and I expect the reports to mostly be quiet.

**The number to actually look at is TTFB** — "Time to First Byte", which
GTmetrix shows directly and Lighthouse reports as "Initial server response
time". This is the one thing on your site that is genuinely slow, because every
page waits on Render's free tier.

**If TTFB is high, do not go hunting through the rest of the report.** Nothing
else in it will be worth as much as fixing that, and the report will happily
distract you with 2 kB of unused CSS while a two-second server wait sits at the
top.

### How to read the scores without being misled

- **A good score is not proof the site feels fast.** Lighthouse runs on a
  simulated connection from a datacentre. Your visitor is on a phone on mobile
  data in a small town.
- **Scores move between runs.** Run three times, take the middle one. Do not
  react to a single run.
- **The score out of 100 is the least useful number in the report.** Read the
  individual timings instead, especially TTFB and LCP.
- **Neither tool will ever show you the click-a-job problem**, for the reason
  at the top of this file. If both tools come back green and clicking a job
  still feels slow, the tools are not wrong and neither are you — they are
  measuring something else.

---

## What was tested, and what was not

Being straight with you about this, because "it works" and "I checked that it
works" are different claims.

**Tested** — I wrote `route-progress-check.js`, which drives the progress bar
through 37 checks: fast navigations show no bar, slow ones do, shallow
navigations are ignored, cancelled navigations clear it, double-clicks do not
strand it, and unmounting cancels its timers. I then deliberately broke the
code **sixteen different ways** to confirm each check actually catches its
failure. Two of my own checks were worthless on the first attempt and passed
against broken code — I found that, fixed the checks, and re-ran the controls.

**A real bug this found:** the reduced-motion CSS did not work. It was written
correctly but placed about thirty lines above the rule it was meant to
override, and in CSS the later rule wins. Anyone who has "reduce motion" on
their phone would have got the full animation anyway. Moved it below the rule
and added a check that asserts the *position*, not just that the text exists.

**Not tested** — I could not run `npm run build`. Your `node_modules` was
installed on Windows, so the Linux build binary this sandbox needs is missing
and there is no network to fetch it. I confirmed this failure is not caused by
my changes: a clean copy of your last commit, which does not contain the
progress bar at all, fails in exactly the same way.

**So before you deploy, run this on your own machine:**

```
cd D:\sarkari-portal\frontend
npm run build
```

If that succeeds, the change is safe to push. If it fails, send me the error.

**Also not tested** — I have never seen the bar on a real screen. The logic is
tested; the way it *looks* is not. Check it yourself after deploying: click a
job and watch the top of the page.
