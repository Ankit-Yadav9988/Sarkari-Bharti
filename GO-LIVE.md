# Go live — every command, and how the live site is put together

This is the practical companion to `DEPLOY.md`. Same project, different goal:
`DEPLOY.md` explains how each piece works and walks through a deploy from
scratch. This one is the copy-paste command reference, plus what the live setup
actually is, ending with the site submitted to Google Search Console.

**The site is already live**, at <https://sarkari-bharti.vercel.app>. So most of
this document is now a reference for changing something rather than a build
order. Part 4 describes the hosting as it really is — if you are deploying the
backend again from nothing, follow `DEPLOY.md` Part 4 instead, which is the
step-by-step version and is kept as the single source of truth for it.

Read Part 0 once. After that you can jump to whichever part you need.

**Contents**

| Part | What it covers |
|---|---|
| 0 | The rules, and what "free forever" really means |
| 1 | Every command, with demo values you can copy |
| 2 | Put the code on GitHub |
| 3 | The architecture as deployed |
| 4 | The backend and database (Render + Supabase) |
| 5 | The frontend (Vercel free) |
| 6 | Connecting the two (CORS) |
| 7 | Google Search Console |
| 8 | The rename, and moving to a real domain |
| 9 | When something breaks |
| 10 | Honest caveats — read before you trust anything here |

---

# Part 0 — Rules and expectations

## Rule 1: never commit a secret

There is no git repository yet (Part 2 creates one). The moment there is, four
values must stay out of it forever:

- `JWT_SECRET`
- `ADMIN_PASSWORD_HASH`
- `DB_PASSWORD`
- your admin password in plaintext, which should not exist in a file at all

`.gitignore` already blocks `.env`, `.env.*`, `*.key`, `*.pem` and the build
folders. That covers the common accidents. It does not cover pasting a secret
into a README, a code comment, a screenshot, or a support forum.

If a secret ever reaches GitHub, deleting the line is not enough — git keeps the
old commit. Rotate the value instead (Part 1.10).

## Rule 2: the app refuses to start on a bad secret, on purpose

Four things are checked before the backend will boot:

| Variable | Rejected if |
|---|---|
| `JWT_SECRET` | missing, under 32 characters, fewer than 8 distinct characters, or contains a placeholder marker like `change-this`, `dev-secret`, `example-`, `placeholder` |
| `ADMIN_PASSWORD_HASH` | missing, or does not start with `$2a$`, `$2b$` or `$2y$` (i.e. you set the password instead of the hash) |
| `DB_PASSWORD` | missing |
| `CORS_ALLOWED_ORIGINS` | empty, contains `*`, missing `http://` or `https://`, or ends with `/` |

A crash on startup with a clear message is the intended behaviour. If it starts,
the configuration is sane.

Every demo secret in this document deliberately contains the word `EXAMPLE`, which
is on that reject list. Copy them to see the shape, not to use.

## What "totally free" means here

| Piece | Provider | Free? | Sleeps? |
|---|---|---|---|
| Frontend | Vercel Hobby | Yes, no card | No — static/CDN, always warm |
| Backend | Render free web service | Yes, no card | **Yes** — after ~15 idle minutes |
| Database | Supabase free project | Yes, no card | **Yes** — paused after ~a week idle |
| HTTPS certificates | Managed by Vercel and Render | Yes | Renewed for you |
| API hostname | `<service>.onrender.com` | Yes | — |

Two of those sleep, and that is the honest trade for paying nothing. What it
means in practice: the first visitor after a quiet spell waits 30–60 seconds for
the backend to wake, and a project nobody has queried for a week needs a click in
the Supabase dashboard to come back. Part 4.4 covers keeping the backend warm and
why it is not obviously worth doing yet.

The pairing is deliberate. Render's own free Postgres expires after 90 days and
takes the data with it, so the database lives on Supabase instead, where there is
no such clock. That also means the backend service can be rebuilt, renamed or
moved without touching the data.

> **If sleeping is unacceptable**, the fix is a paid instance on Render (the
> cheapest tier removes the sleep), not a free VM elsewhere. An always-free VM
> from a cloud provider avoids the sleep but hands you Linux patching, your own
> TLS certificates and your own backups — and providers reclaim instances they
> consider idle, so even that is not unconditional.

---

# Part 1 — Every command, with demo data

## 1.0 The demo values used below

Substitute your own. These are written to be obviously fake.

| Placeholder | Demo value used in this document |
|---|---|
| Admin username | `ankit` |
| Admin password | `Sarkari@2026#Live` |
| Postgres password | `Str0ng-Local-Pg-Pass` |
| Database name | `sarkari_portal` |
| JWT secret | `EXAMPLE-ONLY-DO-NOT-USE-ThisIsNotRandomGenerateYourOwnWithOpenssl` |
| Password hash | `$2a$12$EXAMPLEonlyEXAMPLEonlyNotARealHashDoNotUseThisValue00` |
| API hostname | `sarkari-bharti-api.onrender.com` |
| Frontend URL | `https://sarkari-bharti.vercel.app` |

Two paths appear constantly:

```
<project>/backend      the Spring Boot API
<project>/frontend     the Next.js site
```

On your machine `<project>` is the folder containing `DEPLOY.md`.

## 1.1 Generate the JWT secret

Linux, macOS, or Git Bash on Windows:

```bash
openssl rand -base64 48
```

Windows PowerShell without openssl — use the cryptographic RNG, not `Get-Random`:

```powershell
$b = [byte[]]::new(48)
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b)
```

Output is a 64-character string on one line, for example the shape of:

```
EXAMPLE-ONLY-DO-NOT-USE-ThisIsNotRandomGenerateYourOwnWithOpenssl
```

Save it in a password manager. You will paste it in two places only: your local
shell, and the Environment tab of the Render service.

## 1.2 Generate the admin password hash

The backend never stores your password, only a BCrypt hash of it. Generate the
hash from the password you chose:

**Windows PowerShell**

```powershell
cd backend
mvn -q compile exec:java `
  -Dexec.mainClass=com.sarkariportal.backend.tool.HashPassword `
  -Dexec.args="Sarkari@2026#Live"
```

**Linux / macOS**

```bash
cd backend
mvn -q compile exec:java \
  -Dexec.mainClass=com.sarkariportal.backend.tool.HashPassword \
  -Dexec.args="Sarkari@2026#Live"
```

It prints a 60-character string starting with `$2a$12$`, shaped like:

```
$2a$12$EXAMPLEonlyEXAMPLEonlyNotARealHashDoNotUseThisValue00
```

The tool refuses any password under 12 characters. That one credential protects
every write endpoint on the site, so the floor is not adjustable.

> **PowerShell users:** never wrap a hash in double quotes. `$2a` looks like a
> variable to PowerShell and gets replaced with nothing. Single quotes always.

## 1.3 Change the admin **name** (username)

There is no user table. The admin account is two environment variables, so
changing the name means changing one variable and restarting.

**Locally, Windows PowerShell (this window only)**

```powershell
$env:ADMIN_USERNAME = 'ankit'
```

**Locally, Windows (permanent — open a NEW terminal afterwards)**

```powershell
setx ADMIN_USERNAME "ankit"
```

**Locally, Linux / macOS**

```bash
export ADMIN_USERNAME='ankit'
```

**On the live site:** Render → your service → **Environment** → edit
`ADMIN_USERNAME` → *Save changes*. Render restarts the service itself; there is
no file to edit and no shell to edit it from.

Notes that matter:

- Unset, it defaults to `admin`. Change it — `admin` is the first username every
  scanner tries.
- The comparison is case-insensitive and trims spaces, so `Ankit` and ` ankit `
  both log in.
- Changing the username does **not** invalidate existing tokens immediately, but
  any token whose subject is the old name stops being accepted, so in practice
  you are logged out. Log in again with the new name.

## 1.4 Change the admin **password**

Three steps: new hash, new variable, restart.

**Step 1 — hash the new password**

```bash
cd backend
mvn -q compile exec:java \
  -Dexec.mainClass=com.sarkariportal.backend.tool.HashPassword \
  -Dexec.args="MyNewPassword2026!"
```

**Step 2 — set it**

Locally, PowerShell:

```powershell
$env:ADMIN_PASSWORD_HASH = '$2a$12$EXAMPLEonlyEXAMPLEonlyNotARealHashDoNotUseThisValue00'
```

Locally, Linux / macOS:

```bash
export ADMIN_PASSWORD_HASH='$2a$12$EXAMPLEonlyEXAMPLEonlyNotARealHashDoNotUseThisValue00'
```

On the live site: Render → your service → **Environment** → replace
`ADMIN_PASSWORD_HASH`. Paste it carefully — a BCrypt hash is exactly 60
characters, starts `$2a$12$`, and a trailing space is enough to make every login
fail.

**Step 3 — restart**

Saving the variable on Render restarts the service for you, so there is nothing
to do there. Locally: stop `mvn spring-boot:run` with Ctrl+C and start it again —
variables are read once at boot.

The thing that surprises people: **any admin browser session created before the
change still works** until the token expires (24 hours by default). The token is
signed with `JWT_SECRET`, and it was already issued — changing the password does
not reach backwards and cancel it. If you are changing the password *because
someone else may have got in*, you must also rotate `JWT_SECRET` (1.10). That is
what actually kicks everyone out instantly.

**Locked out?** Login is limited to 5 attempts per 15 minutes per IP, and the
counter is in memory — restarting the backend clears it. If you forgot the
password, generate a new hash and restart; there is nothing to recover.

## 1.5 Run the backend

**First time only — create the empty database**

```bash
psql -U postgres -c "CREATE DATABASE sarkari_portal;"
```

Do not create tables. Flyway builds the schema on first start, and Hibernate runs
in `validate` mode so it never alters a live table by itself.

**Set the required variables**

Windows PowerShell:

```powershell
$env:DB_PASSWORD         = 'Str0ng-Local-Pg-Pass'
$env:JWT_SECRET          = 'EXAMPLE-ONLY-DO-NOT-USE-ThisIsNotRandomGenerateYourOwnWithOpenssl'
$env:ADMIN_USERNAME      = 'ankit'
$env:ADMIN_PASSWORD_HASH = '$2a$12$EXAMPLEonlyEXAMPLEonlyNotARealHashDoNotUseThisValue00'
```

Linux / macOS:

```bash
export DB_PASSWORD='Str0ng-Local-Pg-Pass'
export JWT_SECRET='EXAMPLE-ONLY-DO-NOT-USE-ThisIsNotRandomGenerateYourOwnWithOpenssl'
export ADMIN_USERNAME='ankit'
export ADMIN_PASSWORD_HASH='$2a$12$EXAMPLEonlyEXAMPLEonlyNotARealHashDoNotUseThisValue00'
```

**Start it**

```bash
cd backend
mvn spring-boot:run
```

First run downloads dependencies and takes a few minutes. Watch for Flyway lines
like `Migrating schema "public" to version 1`.

**Check it answers**

```bash
curl http://localhost:8080/api/health
# {"status":"ok","db":"up"}

curl http://localhost:8080/api/jobs
# {"content":[],"page":0,...}   <- empty is correct, there is no data yet
```

## 1.6 Run the frontend

```bash
cd frontend
cp .env.local.example .env.local     # Windows: copy .env.local.example .env.local
npm install
npm run dev
```

The defaults already point at `http://localhost:8080/api`, so nothing needs
editing for local work.

- English: <http://localhost:3000>
- Hindi: <http://localhost:3000/hi>
- Admin: <http://localhost:3000/admin/login>

## 1.7 Build for production

```bash
# frontend — catches errors that `npm run dev` hides
cd frontend
npm run build
npm run start          # serves the production build on :3000

# backend — produces target/backend-0.0.1-SNAPSHOT.jar
cd backend
mvn clean package
java -jar target/backend-0.0.1-SNAPSHOT.jar
```

`mvn clean package` runs the tests. To skip them: `mvn clean package -DskipTests`.

## 1.8 Test the login from the command line

Useful when the browser says "invalid credentials" and you want to know whether
the problem is the backend or the frontend.

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ankit","password":"Sarkari@2026#Live"}'
```

Success returns `{"token":"eyJhbGciOi..."}`. Then use that token:

```bash
TOKEN='eyJhbGciOi...paste-the-token...'
curl http://localhost:8080/api/subscribers -H "Authorization: Bearer $TOKEN"
```

| Response | Meaning |
|---|---|
| `401 {"error":"Invalid username or password"}` | the login itself failed. One message for both cases on purpose — the API never confirms whether a username exists |
| `401 {"error":"Authentication required"}` | no token sent, or the token is expired or invalid, on a protected route |
| `403 {"error":"Forbidden"}` | the token is valid but its subject is not the configured admin |
| `429` + a `Retry-After` header | rate limited; wait it out, or restart the backend to clear the counter |

## 1.9 One-line summary of every backend variable

| Variable | Required | Default | Demo value |
|---|---|---|---|
| `DB_URL` | no | `jdbc:postgresql://localhost:5432/sarkari_portal` | same |
| `DB_USERNAME` | no | `postgres` | `postgres.abcdefghijklm` (Supabase pooler form) |
| `DB_PASSWORD` | **yes** | — | `Str0ng-Local-Pg-Pass` |
| `JWT_SECRET` | **yes** | — | output of `openssl rand -base64 48` |
| `ADMIN_USERNAME` | no | `admin` | `ankit` |
| `ADMIN_PASSWORD_HASH` | **yes** | — | `$2a$12$…` |
| `CORS_ALLOWED_ORIGINS` | **yes in production** | `http://localhost:3000` | `https://sarkari-bharti.vercel.app` |
| `PORT` / `SERVER_PORT` | no | `8080` | injected by Render — do not set it |
| `JWT_EXPIRATION_MS` | no | `86400000` (24h) | `86400000` |
| `DB_POOL_SIZE` | no | `10` | `5` on the free tier |
| `LOG_LEVEL` | no | `INFO` | `INFO` |
| `RATELIMIT_LOGIN_MAX` | no | `5` | `5` |
| `RATELIMIT_LOGIN_WINDOW` | no | `900` | `900` |
| `RATELIMIT_SUBSCRIBE_MAX` | no | `3` | `3` |
| `RATELIMIT_SUBSCRIBE_WINDOW` | no | `3600` | `3600` |
| `VIEWCOUNT_DEDUP_SECONDS` | no | `21600` (6h) | `21600` |

The email variables (`MAIL_ENABLED`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`,
`MAIL_PASSWORD`, `MAIL_FROM_ADDRESS` and the rest) are deliberately not repeated
here — they have their own table, with defaults and demo values, in
[`SETUP-EMAIL.md`](SETUP-EMAIL.md). Email is off until `MAIL_ENABLED=true` and the
site runs exactly as normal without any of them set.

Frontend variables (all are baked into the browser bundle at **build** time — a
change needs a redeploy, not a restart, and none of them can hold a secret):

| Variable | Required | Demo value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **yes** | `https://sarkari-bharti-api.onrender.com/api` |
| `NEXT_PUBLIC_SITE_URL` | **yes in production** | `https://sarkari-bharti.vercel.app` |
| `NEXT_PUBLIC_GSC_VERIFICATION` | no | `AbCdEf1234567890_exampleTokenOnly` |
| `NEXT_PUBLIC_GA_ID` | no | `G-EXAMPLE1234` |
| `NEXT_PUBLIC_BING_VERIFICATION` | no | — |
| `NEXT_PUBLIC_ALLOW_INDEXING` | no | leave unset in production |

## 1.10 Rotate the JWT secret (kick every session out now)

```bash
openssl rand -base64 48     # 1. generate a new one
```

Then: Render → your service → **Environment** → replace `JWT_SECRET` → *Save
changes*, which restarts the service. Locally, set the variable again and restart
`mvn spring-boot:run`.

Every existing admin token becomes unverifiable immediately. Do this if the
secret was ever committed, pasted into a chat, or you suspect any compromise.

---

# Part 2 — Put the code on GitHub

There is no git repository in this project yet. Both Vercel and the server pull
from GitHub, so this comes first.

**Before the first commit, check what git is about to include:**

```bash
cd <project>
git init
git add -A
git status --short | grep -iE "\.env|secret|password|\.key|\.pem"
```

That last command should print **nothing**. If it prints a filename, do not
commit — remove it from staging (`git rm --cached <file>`) and add it to
`.gitignore` first.

`frontend/.env.local` exists on your machine and is already ignored. `.gitignore`
also excludes `backend/target/` (about 97 MB of build output) and `*.log`.

```bash
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

**Public or private?** Either works. Private is safer if a secret slips through.
Vercel's free tier deploys private repos fine. If you go public, run the grep
above one more time before pushing.

---

# Part 3 — The architecture as deployed

```
   Visitor's browser
          |
          |  https://sarkari-bharti.vercel.app
          v
   +--------------------------+
   |  Vercel (free)           |   Next.js — pages, SEO, sitemap, robots
   |  global CDN, never idle  |   Rebuilds automatically on git push
   +--------------------------+
          |
          |  https://<your-service>.onrender.com/api
          v
   +--------------------------+
   |  Render (free)           |   Spring Boot in a container
   |  HTTPS terminated for    |   Restarted automatically on git push
   |  you; sleeps when idle   |   Binds the PORT Render injects
   +--------------------------+
          |
          |  TLS over the internet, port 5432/6543
          v
   +--------------------------+
   |  Supabase (free)         |   PostgreSQL — Flyway owns the schema
   +--------------------------+
```

Four things worth understanding about this shape:

**HTTPS is not optional, and you get it for free here.** Vercel serves the site
over HTTPS, and a browser on an HTTPS page refuses to call a plain `http://` API
— it blocks it as mixed content, usually with nothing visible to the user. The
pages themselves would still load, because Next fetches those on the server, but
the view counter, the subscribe form and the whole admin area call the API from
the browser and would all fail silently. Render gives every service an
`https://….onrender.com` address with a managed certificate, so there is no nginx
and no certbot in this setup — that is the main reason it is simpler than running
your own server.

**The backend sleeps; the frontend does not.** Render's free tier stops your
service after about 15 minutes with no requests, and the next request has to wait
30–60 seconds for it to start again. Vercel never sleeps, and every public page
is server-rendered *on Vercel*, calling the API — so a cold backend shows up as
one slow page load for whoever is unlucky, not as a broken site. Part 4.4 covers
whether to bother fighting this.

**The database is separate from the backend, on purpose.** Render's own free
Postgres expires after 90 days and then the data is gone. Supabase's free tier
has no such clock, so the database outlives the backend service and you can
rebuild or move the backend without touching the data. The cost of separating
them is one network hop per query and a connection string you have to keep right
— see 4.2.

**Nothing here holds files.** Render's free instances have no persistent disk, and
anything written inside the container is lost on the next deploy or sleep. That is
fine, because this app stores no files: notification PDFs are linked by URL to the
official site rather than uploaded. Keep it that way, or you will need object
storage as well.

---

# Part 4 — The backend and database (Render + Supabase)

This is what the live site actually runs on, and this part is written as a
description of it rather than a build order. **To deploy the backend from
scratch, follow `DEPLOY.md` Part 4** — it is the step-by-step version, and
duplicating it here would just give the two documents a chance to disagree. What
follows is the Render- and Supabase-specific knowledge that does not fit there:
the settings that matter, the two that break the deploy if they are wrong, and
what to expect from the free tier.

## 4.1 The Render service

Created with *New* → *Web Service*, pointed at the GitHub repository from Part 2.
The settings that matter:

| Setting | Value | Why |
|---|---|---|
| Root Directory | `backend` | The repo holds `backend/` and `frontend/` side by side. Left blank, Render finds no project to build. |
| Runtime | Docker | `backend/Dockerfile` is committed, and it pins Maven 3.9.9 and Java 17, so the build does not drift with whatever Render's native builder defaults to. |
| Branch | `main` | Every push here redeploys. |
| Health check path | `/api/health` | Optional but worth setting. See 4.3. |
| Instance type | Free | |

The port needs no configuration at all. Render injects `PORT` and expects the
process to bind it, and `application.properties` reads
`server.port=${PORT:${SERVER_PORT:8080}}` — `PORT` first, then `SERVER_PORT`,
then 8080 for local runs. The `EXPOSE 8080` line in the Dockerfile is
documentation and does not override this. Getting this wrong is a nasty failure:
the container starts, logs a healthy Spring banner, and is killed a minute later
for not answering on the port the platform is watching.

Environment variables go in *Environment* on the service page. The full list is
in 1.9; the ones without which it will not start are `DB_URL`, `DB_USERNAME`,
`DB_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD_HASH` and `CORS_ALLOWED_ORIGINS`.
Render restarts the service when you save them.

## 4.2 The Supabase connection string

This is the one setting most likely to be wrong, and the failure is confusing
because it looks like the database is down.

Get it from the Supabase dashboard: *Project Settings* → *Database* → *Connection
string* → the **JDBC** tab. It looks like:

```
jdbc:postgresql://aws-0-ap-south-1.pooler.supabase.com:5432/postgres?user=postgres.abcdefghijklm&password=...
```

Two details to get right:

- **Use the pooler address, not the direct one.** Supabase offers a direct
  connection (`db.<ref>.supabase.co`) and a pooled one
  (`…pooler.supabase.com`). On newer projects the direct address resolves to
  IPv6 only, and a platform without IPv6 egress cannot reach it at all — the
  backend just fails to connect, with a timeout rather than a useful error. The
  pooler answers on IPv4. It is also the right choice on its own merits: a
  pool-in-front-of-a-pool caps how many connections the free database sees.
- **Keep the username and password out of the URL** if you can, and put them in
  `DB_USERNAME` and `DB_PASSWORD` instead. The Supabase pooler username has the
  project ref in it (`postgres.abcdefghijklm`), which is easy to mistake for a
  typo and easy to truncate. Splitting them means the URL in `DB_URL` is
  shareable in a screenshot and the secret is only in one place.

`DB_POOL_SIZE` is worth setting to `5` on the free tier. The default is 10, and
ten connections from one small service is more than a free database wants to
hold open when it is mostly idle.

Flyway runs on first boot and creates the schema. Hibernate then runs with
`ddl-auto=validate`, so if the database and the entities disagree the service
refuses to start rather than quietly altering a live table — that is the
`Flyway … Validate failed` row in Part 9.

## 4.3 Confirm it is actually up

```bash
curl https://<your-service>.onrender.com/api/health
# {"status":"ok","db":"up"}

curl https://<your-service>.onrender.com/api/jobs
# {"content":[],"page":0,...}   <- empty is correct if there is no data yet
```

`/api/health` checks the database, not just the JVM, which is the point of it: a
process that is alive but cannot reach Postgres serves errors on every page, and
a health check that calls that "ok" stays quiet through exactly the outage it
exists to catch. If it answers `{"status":"down"…}`, the problem is 4.2.

The first of those two calls may take 30–60 seconds if the service was asleep.
That is not a fault.

## 4.4 Sleep, and whether to fight it

Render's free tier stops the service after roughly 15 minutes of no requests.
The free allowance is a pool of instance-hours per month, so a service that is
awake constantly can exhaust it and be stopped until the month rolls over.

You can keep it warm by pointing a free uptime monitor (UptimeRobot and
Better Stack both have free tiers) at `/api/health` every few minutes. Before
doing that, know what you are trading:

- It burns the monthly hour allowance whether or not anyone visits.
- It is polling a cheap endpoint on purpose — never point a keep-alive monitor at
  a listing page, which is a database query and a JSON render several hundred
  times a day so a robot can be told "yes".

For a site with no traffic yet, leaving it to sleep is the more sensible default,
because the only person who meets the cold start is you. Once real visitors
arrive, the calculation changes — and at that point a paid instance is a better
answer than a keep-alive ping, since it fixes the cold start instead of hiding it.

## 4.5 Backups are still your job

Supabase's free plan does not include the automatic daily backups or
point-in-time recovery the paid plans do — confirm the current terms on their
pricing page, because this is exactly the kind of thing that changes. Until you
have checked, assume there is no backup and take your own:

```bash
pg_dump "postgresql://<user>:<password>@<pooler-host>:5432/postgres" \
  --no-owner --no-privileges -f backup-$(date +%F).sql
```

Run it from your own machine, not the server — there is no shell on a Render free
instance. Keep a few of these somewhere that is not the same account as the
database. Every job you have ever posted is in that one file.

A free Supabase project is also **paused after about a week with no queries**, and
restoring it is a manual click in the dashboard. If the backend sleeps and nobody
visits for a week, expect to wake both.

## 4.6 Deploying a backend update later

```bash
git add -A && git commit -m "..." && git push
```

Render builds the Docker image and swaps the service over when the build
succeeds; a failed build leaves the previous version running. Watch it in
*Events* → the running deploy, or *Logs* for the application output.

One caveat specific to this app: **a redeploy mid-send loses an email broadcast.**
Progress is held in memory, so a deploy while alerts are going out stops the send
part-way and leaves `email_broadcasts.finished_at` null on that row. Check the
admin subscribers page is idle before pushing.

---

# Part 5 — The frontend (Vercel free)

Vercel's free tier is a good fit here: it never sleeps, it is a global CDN, and it
rebuilds on every push to `main`. No card required.

## 5.1 Import the project

1. <https://vercel.com> → sign in with GitHub → **Add New → Project**.
2. Import your repository.
3. **Root Directory: `frontend`.** This is the step everyone misses. The repo
   root holds both `backend/` and `frontend/`, and Vercel looks for `package.json`
   at whatever root you give it. Leave it at the repo root and the build fails
   immediately with "No Next.js version detected".
4. Framework preset: Next.js (detected automatically). Leave the build and output
   settings alone.

## 5.2 Environment variables

Under **Settings → Environment Variables**, add these for the *Production*
environment:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://sarkari-bharti-api.onrender.com/api` |
| `NEXT_PUBLIC_SITE_URL` | `https://sarkari-bharti.vercel.app` |

Note the `/api` suffix on the first one and its absence on the second. Neither has
a trailing slash.

**Both values are compiled into the JavaScript bundle at build time.** Changing
either one in the dashboard does nothing at all until a new build runs —
*Deployments → ⋯ → Redeploy*. This is the single most common way to spend an hour
confused by this setup, and it applies every time you touch a `NEXT_PUBLIC_*`
value, including when the name or domain changes (8.3).

On a first deploy there is a chicken-and-egg problem, because you do not know the
Vercel URL until it exists:

1. Deploy once with only `NEXT_PUBLIC_API_URL` set.
2. Read the production URL off the dashboard — the clean one,
   `sarkari-bharti.vercel.app`, not the long per-deployment one with a hash in it.
3. Add `NEXT_PUBLIC_SITE_URL` with that value.
4. Redeploy.

Getting `NEXT_PUBLIC_SITE_URL` wrong is not cosmetic: it is the value behind every
canonical tag, every Open Graph URL, the sitemap and the `hreflang` pairs. Left
unset it falls back to the origin hard-coded in `frontend/lib/site.js`, which is
the deployed address — correct today, and exactly the kind of thing that stops
being correct the moment you buy a domain. Set it explicitly rather than relying
on the fallback.

## 5.3 Confirm the deploy is crawlable

Open `https://sarkari-bharti.vercel.app/robots.txt`. It must start:

```
User-agent: *
Allow: /
```

and end with `Sitemap: https://sarkari-bharti.vercel.app/sitemap.xml`.

If it says `Disallow: /` instead, the site is invisible to Google and nothing in
Part 7 will work. Causes, in order of likelihood:

- `NEXT_PUBLIC_ALLOW_INDEXING` is set to `false` somewhere. Remove it.
- `NEXT_PUBLIC_SITE_URL` still points at localhost.
- You are looking at a preview deployment rather than production. Branch and
  pull-request builds are blocked deliberately, so that copies of the whole site
  do not compete with the real one in search results. Vercel sets `VERCEL_ENV`
  itself; there is nothing to configure.

Then open `https://sarkari-bharti.vercel.app/sitemap.xml` and check it lists real URLs.
It is generated from the live job list, so it needs the backend reachable — an
empty sitemap usually means the API call failed, not that the sitemap is broken.

## 5.4 Deploying a frontend update later

```bash
git add -A && git commit -m "..." && git push
```

That is the whole process. Vercel builds and swaps the production alias when the
build succeeds; a failed build leaves the old version serving.

---

# Part 6 — Connect the two (CORS)

The browser will refuse to let `sarkari-bharti.vercel.app` read responses from
`<your-service>.onrender.com` unless the API says that origin is allowed.

On Render: the service → **Environment** → add or edit

```ini
CORS_ALLOWED_ORIGINS=https://sarkari-bharti.vercel.app
```

Saving it restarts the service, which takes a minute or two. There is no file to
edit and no shell to edit it from — the dashboard is the only place this value
lives.

Rules the application enforces at startup, each of which is a real mistake it is
catching:

- **Exact origins only.** `*` is rejected — a wildcard would let any website on
  the internet read your API through a visitor's browser.
- **Scheme required.** `sarkari-bharti.vercel.app` is rejected;
  `https://sarkari-bharti.vercel.app` is right.
- **No trailing slash.** The browser sends
  `Origin: https://sarkari-bharti.vercel.app` without one, so a configured value
  ending in `/` matches nothing — and it fails as a confusing browser error
  rather than a server error.
- Multiple origins are comma-separated:
  `https://sarkari-bharti.vercel.app,http://localhost:3000`.

A `*.vercel.app` address has no `www` variant, so production needs exactly one
entry. Adding `http://localhost:3000` as a second is convenient while developing
against the live API, and harmless — it only means a browser on your own machine
is also allowed to call it.

Verify from your own machine that the API returns the header:

```bash
curl -s -o /dev/null -D - \
  -H "Origin: https://sarkari-bharti.vercel.app" \
  https://<your-service>.onrender.com/api/jobs | grep -i access-control
# access-control-allow-origin: https://sarkari-bharti.vercel.app
```

No such header means the restart has not finished yet or the value has a typo. An
empty reply with no headers at all usually means the service is asleep — run it
again.

**The real test** is the browser: open the live site, press F12 → Console, and
visit a job page. If you see `blocked by CORS policy`, the origin does not match.
If you see `Mixed Content: … requested an insecure resource`, your
`NEXT_PUBLIC_API_URL` is `http://` where it should be `https://`.

---

# Part 7 — Google Search Console

Do this only after Part 5.3 confirms `Allow: /`. Submitting a site that answers
`Disallow: /` teaches Google to ignore it and wastes weeks.

> **If you already added a property under the old name**, it is now pointing at an
> address that is not yours and nothing will ever be reported for it. A Search
> Console property is tied to an exact URL prefix, so a renamed site needs a new
> property — verification does not follow the rename. Add the current address as
> below, then delete the old property so the two do not sit side by side with one
> permanently empty. There is nothing to migrate: a `vercel.app` property has no
> history worth keeping, and *Change of Address* is for a domain move (8.3), not
> this.
>
> Before adding it, confirm `NEXT_PUBLIC_SITE_URL` in Vercel is
> `https://sarkari-bharti.vercel.app` **and that a build has run since you set
> it.** Every canonical tag, every `hreflang` pair and every URL inside
> `sitemap.xml` is built from that value, so if it is stale or unset, Search
> Console will read a sitemap full of URLs on a domain you do not own and index
> none of them. `curl -s https://sarkari-bharti.vercel.app/sitemap.xml | head -5`
> settles it in one command.

## 7.1 Add the property

<https://search.google.com/search-console> → **Add property** → **URL prefix**
(the left box, not "Domain") → `https://sarkari-bharti.vercel.app`.

The *Domain* option needs a DNS record, which you cannot add on a `vercel.app`
subdomain. URL prefix is the correct choice until you buy a real domain.

## 7.2 Verify ownership

Choose **HTML tag**. Google shows something like:

```html
<meta name="google-site-verification" content="AbCdEf1234567890_exampleTokenOnly" />
```

Copy **only the content value**, not the whole tag. In Vercel → Settings →
Environment Variables:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_GSC_VERIFICATION` | `AbCdEf1234567890_exampleTokenOnly` |

**Redeploy**, wait for the build to finish, then click *Verify*. If it fails,
view the page source of your homepage and confirm the meta tag is actually
present — if it is not, the redeploy did not happen or you pasted the whole tag
instead of the content value.

## 7.3 Submit the sitemap

Search Console → **Sitemaps** → enter `sitemap.xml` → Submit.

Status goes to "Success" with a URL count within a day or so. "Couldn't fetch"
usually means the sitemap 404s — confirm `https://sarkari-bharti.vercel.app/sitemap.xml`
loads in your browser first. (It is generated at `/api/sitemap` and served at
`/sitemap.xml` by a rewrite, so both should work.)

## 7.4 Ask for the first pages to be crawled

**URL Inspection** → paste your homepage URL → **Request indexing**. Do the same
for two or three of your best job pages. This does not guarantee or speed up
ranking, but it does get them looked at rather than waiting for discovery.

## 7.5 Bing, for free extra traffic

<https://www.bing.com/webmasters> → **Import from Google Search Console**. One
click, and it covers Bing, Yahoo and DuckDuckGo. Skip
`NEXT_PUBLIC_BING_VERIFICATION` entirely if you import.

## 7.6 What to actually expect

Being indexed is not the same as ranking. A brand-new site with no links takes
weeks to be crawled properly and months to rank for anything competitive.
`sarkari result` itself is unwinnable for a long time.

What is winnable early is the long tail — the exact strings people type when a
specific notification drops: *"UP Police Computer Operator Grade A syllabus"*,
*"SSC CGL 2026 cut off marks category wise"*. The site is already built for this:
every job gets its own URL with a real title, the Hindi pages are separately
indexable at `/hi/…` with reciprocal hreflang tags, and the syllabus, cut-off,
papers and calendar sections give each exam several pages instead of one.

The practical lever is being early and being complete. A notification posted the
day it appears, with the fee, the age limits, the vacancy table and a working
official link, beats a copy posted a week later.

Check **Search Console → Pages** after a fortnight. "Discovered – currently not
indexed" on most URLs is normal for a new site. "Blocked by robots.txt" is not —
go back to 5.3.

---

# Part 8 — The rename, and moving to a real domain

The site was called **RojgarHub** while it was being built. That name was already
taken by someone else, so it is now **Sarkari Bharti** everywhere in the code.
This part is kept for two reasons: 8.1 is the map of where a name lives, which is
what you need if you ever change it again, and 8.3 is the one you will actually
use, when you buy a domain.

## 8.1 Where the name lives — all of it

Done already, listed so a future rename takes ten minutes instead of an
afternoon.

`frontend/lib/site.js` is the one that matters:

```js
export const SITE = {
  name: 'Sarkari Bharti',
  tagline: "Every vacancy. One place.",
  ...
};
```

That single value drives the header wordmark, the footer line, every page title,
the `og:site_name` used in WhatsApp and Facebook previews, and the About,
Contact, Privacy and Disclaimer pages. Change it and most of a rename is done.

The rest, in rough order of how much they matter:

| File | What it holds | Matters? |
|---|---|---|
| `frontend/lib/i18n.js` — `seo.default.title`, `seo.default.desc` | the brand, hard-coded separately from `SITE.name`, in **both** the English and Hindi dictionaries | **Yes** — this is your Google result text |
| `frontend/lib/site.js` — `SITE_URL` fallback | the origin used when `NEXT_PUBLIC_SITE_URL` is unset | **Yes** — it must never be a domain someone else owns |
| `frontend/public/og-default.png` | the share image, with the name drawn into it | Yes, visible on every WhatsApp share |
| `frontend/public/favicon.ico`, `icon-512.png`, `apple-touch-icon.png` | the logo | Cosmetic but obvious |
| `backend/…/application.properties` — `jwt.issuer` | written into every token | See the warning below |
| `backend/…/application.properties` — `site.name`, `mail.from-name` | the name on outgoing email | Yes, if email alerts are on |
| `frontend/pages/admin/import.js` | the CSV template's download filename | Cosmetic, admin-only |
| `frontend/styles/globals.css` | a comment | No |

> **`jwt.issuer` is not cosmetic.** The issuer is written into every token and
> checked on the way back in, so changing it rejects every admin session that
> already exists. It is now `sarkari-bharti`, which means **the first admin login
> after the rename deploy will need doing again** — log in and carry on. Harmless,
> but do it deliberately rather than in the middle of adding jobs.

Two related things that are *not* part of a rename but get mistaken for one: the
Vercel project name (which is what makes the address `sarkari-bharti.vercel.app`,
and is changed in Vercel's settings, not in the code), and the Render service
name (which makes the API hostname). Renaming either changes a URL, so both have
the same consequences as 8.3 below.

After editing, build the frontend to be sure nothing broke:

```bash
cd frontend && npm run build
```

## 8.2 If you change the name again

Do it in this order, because two of these invalidate things:

1. Edit the files in 8.1, redraw the images, commit and push.
2. Update `SITE_NAME` and `MAIL_FROM_NAME` on Render if email is on.
3. Expect one forced admin re-login if `jwt.issuer` changed.
4. Only then tell Search Console, and only if the *address* changed too — a
   rename with the same URL needs nothing there.

## 8.3 When you buy a real domain

Four things change together, and missing one breaks the site quietly:

1. **Vercel** → Settings → Domains → add `yournewname.in`, then follow the DNS
   instructions at your registrar. Vercel issues the certificate itself.
2. **Vercel env** → `NEXT_PUBLIC_SITE_URL=https://yournewname.in` → **redeploy.**
   Until you redeploy, every canonical tag still points at the `vercel.app`
   address and Google keeps indexing that one. `NEXT_PUBLIC_*` values are
   compiled into the bundle at build time; changing one in the dashboard does
   nothing on its own.
3. **Render** → the service → Environment →
   `CORS_ALLOWED_ORIGINS=https://yournewname.in`. Keep the old `vercel.app`
   origin in the list as a second entry while DNS propagates, then remove it.
   Miss this step and the site loads but the admin panel, the subscribe form and
   the view counter all stop working.
4. **Search Console** → add the new property, verify it, submit the sitemap
   again, and use the *Change of Address* tool to move the old property's history
   across.

The API hostname can stay on `onrender.com` indefinitely — visitors never see it.
If you would rather it were `api.yournewname.in`, Render supports a custom domain
on the service; add it there, point a CNAME at it, and update
`NEXT_PUBLIC_API_URL` in Vercel followed by a redeploy.

One easily-missed file: `frontend/public/robots.txt` hard-codes the domain in its
`Sitemap:` line. It is **not** the file normally served — `/robots.txt` is
generated by `pages/api/robots.js` and routed there by a rewrite in
`next.config.js`, which is what makes the sitemap line follow
`NEXT_PUBLIC_SITE_URL` and lets preview deployments answer `Disallow: /`. The
static file is kept only as a fallback for the day that rewrite is removed or
breaks. Update it when you move domains anyway: a fallback that advertises a
sitemap on the previous address is worse than no fallback, because it fails
silently and looks fine.

---

# Part 9 — When something breaks

Start with the log. On Render: the service → **Logs** for application output,
**Events** for deploy and restart history. There is no shell and no
`journalctl` — the dashboard is the whole toolkit.

The application is built to fail loudly with a readable message, so the log
usually names the problem outright.

| Symptom | Cause | Fix |
|---|---|---|
| `JWT_SECRET is not set` | the variable is missing from the service's Environment | add it on Render; saving restarts the service |
| `JWT_SECRET is a known placeholder value` | you copied a demo value out of a document | generate a real one: `openssl rand -base64 48` |
| `JWT_SECRET must be at least 32 characters` | too short | same command; do not trim its output |
| `ADMIN_PASSWORD_HASH does not look like a BCrypt hash` | you set the password itself instead of the hash | run the HashPassword tool (1.2) |
| `CORS_ALLOWED_ORIGINS must list exact origins` | a `*` in the value | list the exact frontend origin |
| `CORS origin must not end with a slash` | trailing `/` | remove it |
| Starts, but every login says invalid credentials | the hash was mangled by quotes or a trailing space when pasted | re-paste it; a BCrypt hash is exactly 60 characters and starts `$2a$12$` |
| Deploy succeeds, then the service is killed a minute later | it is not listening on the injected `PORT` | nothing to configure — but check nobody has hard-coded `server.port`; see 4.1 |
| `Connection refused` / connect timeout to the database | the direct Supabase host is IPv6-only | use the pooler address, 4.2 |
| `password authentication failed for user "postgres"` | the pooler needs the `postgres.<project-ref>` form of the username | copy it from the Supabase connection-string panel |
| `FATAL: Max client connections reached` | too many connections for the free database | set `DB_POOL_SIZE=5` |
| Database unreachable after a quiet week | a free Supabase project pauses when idle | restore it from the Supabase dashboard, 4.5 |
| `Flyway … Validate failed` | the schema does not match the code | check which migrations ran in the `flyway_schema_history` table; usually an older database |
| First request after a while takes 30–60 seconds | the free instance was asleep | expected, 4.4 |
| `/api/health` says `{"status":"down"}` | the process is up but cannot reach Postgres | the database rows above |
| Site loads, but admin login and view counter are dead | CORS or mixed content | F12 → Console; see Part 6 |
| Vercel build: "No Next.js version detected" | Root Directory not set to `frontend` | Settings → General → Root Directory |
| Canonical tags point at the wrong domain | `NEXT_PUBLIC_SITE_URL` changed without a redeploy | Deployments → ⋯ → Redeploy |
| Google: "Blocked by robots.txt" | the deploy is answering `Disallow: /` | Part 5.3 |
| `429 Too many login attempts` | 5 failures in 15 minutes from your IP | wait it out; the counter is in memory, so a restart also clears it |
| An email broadcast stopped half-way | the service restarted or was redeployed mid-send | progress is in memory and is not resumable; see `SETUP-EMAIL.md` |

Two checks worth running before assuming the backend is at fault:

```bash
curl https://<your-service>.onrender.com/api/health   # {"status":"ok","db":"up"}
curl -s https://sarkari-bharti.vercel.app/robots.txt | head -3
```

If the first answers and the second says `Allow: /`, both halves are working and
the problem is between them — which is almost always CORS.

---

# Part 10 — Honest caveats

Read this part. Everything above is written to be correct, but some of it depends
on things I could not check, and some of it has not been run.

**Free-tier terms were not verified.** I had no web access while writing this, so
every claim about what Render, Supabase, Vercel and the uptime monitors include
for free is from prior knowledge, not from their pricing pages today. Providers
change these terms, and the ones that matter most here are the two that would
cost you data or uptime: Render's monthly free instance-hours and idle-sleep
window, and whether Supabase's free plan includes any backup or point-in-time
recovery. Confirm both before you depend on them.

**Vercel's Hobby plan is for non-commercial use.** If you intend to run ads on
this site — which is how sites in this category normally earn — check Vercel's
current Hobby terms before launch, because you may need their paid plan. Worth
checking early rather than after the site has traffic.

**Backups are entirely your responsibility.** Assume nothing is snapshotting the
database for you until you have checked. If you skip 4.5 and the project is lost,
so is every job you ever posted.

**The backend changes from the most recent working session have never been
compiled.** No `mvn` or `javac` was available in the environment I worked in, so
the following are reviewed-by-reading only: the job-status fix in
`JobService.computeStatus()` and `JobSpecifications.hasStatus()`, the new
`util/LogSafe.java`, and the three places that now call it
(`MailService`, `GlobalExceptionHandler`, `BroadcastService`). The status logic
was additionally cross-checked by transcribing both implementations to Python and
running every combination of listing section and date pair against each other,
which is how I know the Java and the SQL agree — but a logic check is not a
compiler. Before you trust a deploy:

```bash
cd backend  && mvn clean package
cd frontend && npm run build
```

Both must succeed. The frontend half *is* covered by harnesses that parse every
source file, server-render every page and exercise the API routes, but the same
caveat applies: a harness is not a build.

**The job-status fix changes what the live site shows.** Applications whose last
date has passed are now reported as closed even if they were pinned to "Latest
jobs" — previously a pinned job stayed "Active" forever, which is the bug you
reported. The visible consequence is that expired postings will drop out of the
homepage "Latest jobs" box and out of the `?status=ACTIVE` filter. If everything
currently in the database is expired, that box will render its empty-state message
until you post something current. That is correct behaviour, not a regression.

**Email sending is not restart-safe.** A broadcast holds its progress in memory,
so a redeploy or a sleeping instance mid-send stops it part-way and leaves the row
in `email_broadcasts` unfinished. There is no resume. Send when you are not about
to push, and see `SETUP-EMAIL.md` for the rest of the email caveats.

**Rate limits and the view-counter dedup are per-process and in memory.** They
reset on every restart — which on a free instance means every time it wakes up —
and they would not be shared if you ever ran two copies of the backend. Fine for
one service, worth remembering if you ever scale.

**Legal posture.** The site aggregates public government notifications and links
out to the official source on every row. Keep it that way: link out rather than
mirroring PDFs, keep the disclaimer page reachable from the footer, and do not
adopt a name or design that suggests official status. That combination is what
keeps an aggregator on the right side of the line.
