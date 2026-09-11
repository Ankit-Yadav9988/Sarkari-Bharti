# RojgarHub — run it, change the admin password, deploy it live

Everything needed to take this repository from a fresh clone to a public site.
Three independent things live in here, so jump to the one you need:

- [Part 1 — Run it on your machine](#part-1--run-it-on-your-machine)
- [Part 2 — Change the admin password](#part-2--change-the-admin-password)
- [Part 3 — Rotate the JWT secret](#part-3--rotate-the-jwt-secret)
- [Part 4 — Deploy from scratch to live](#part-4--deploy-from-scratch-to-live)
- [Environment variable reference](#environment-variable-reference)
- [When it refuses to start](#when-it-refuses-to-start)

## The one rule

**No secret goes in a file that git tracks.** The backend reads every credential
from an environment variable with no fallback, and refuses to boot if one is
missing or looks like a placeholder. That is deliberate: a missing secret should
be a loud crash on startup, never a weak default that quietly works.

`.gitignore` already excludes `.env`, `.env.*` (except `*.example`), `*.pem` and
`*.key`. The two `*.example` files are templates with the values left blank —
fill in copies, not the originals.

## What you need installed

| Tool | Version | Where |
|---|---|---|
| Java JDK | 17 | <https://adoptium.net> |
| Maven | 3.8+ | <https://maven.apache.org/install.html> (or your IDE's bundled copy) |
| PostgreSQL | 14+ | <https://www.postgresql.org/download/> |
| Node.js | 18+ | <https://nodejs.org> |

Check all four before going further:

```powershell
java -version      # must say 17
mvn -version
node -v            # must be 18 or higher
psql --version
```

---

# Part 1 — Run it on your machine

## 1.1 Create the database

The application never creates its own database, only its own tables. Make the
empty database first:

```powershell
psql -U postgres -c "CREATE DATABASE sarkari_portal;"
```

If `psql` is not on your PATH, do the same thing in pgAdmin: right-click
*Databases* → *Create* → *Database*, name it `sarkari_portal`.

You do **not** need to create any tables. Flyway owns the schema and runs the
four migration files in `backend/src/main/resources/db/migration` automatically
the first time the backend starts. Hibernate is set to `validate`, which means it
checks the tables match the entity classes and then leaves them alone — it will
never alter a live table by itself.

## 1.2 Generate the two secrets

Two values have to be generated once, and neither is a password you type in
anywhere. Do this before setting any environment variables.

### The JWT signing secret

This signs the admin session token. Anyone who knows it can mint their own admin
token, so it must be random and it must never be committed.

```bash
openssl rand -base64 48
```

Windows without openssl — use the cryptographic RNG, not `Get-Random`:

```powershell
$b = [byte[]]::new(48)
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b)
```

Copy the output somewhere safe (a password manager). The application validates it
at startup and refuses to boot if it is shorter than 32 characters, if it contains
a known placeholder marker such as `change-this` or `dev-secret`, or if it has
fewer than 8 distinct characters. A genuinely generated base64 string passes all
three; a value copied out of a tutorial does not.

### The admin password hash

The backend stores a BCrypt hash, never the password. Generate the hash from the
password you have chosen:

```powershell
cd backend
mvn -q compile exec:java `
  -Dexec.mainClass=com.sarkariportal.backend.tool.HashPassword `
  -Dexec.args="the-password-you-chose"
```

On Linux or macOS, replace the backticks with `\` for line continuation.

It prints a string starting with `$2a$12$`. That is what goes in
`ADMIN_PASSWORD_HASH`. The tool refuses passwords shorter than 12 characters —
this single credential protects every write endpoint on the site, so that floor is
not negotiable. Once you have the hash, discard the plaintext; nothing in the
system needs it again except you, at the login screen.

> The hash is not secret in the way the password is — it cannot be reversed — but
> it can be attacked offline if it leaks, so still keep it out of git.

## 1.3 Set the backend environment variables

Spring Boot does not read `.env` files. These are real environment variables, so
set them in your shell, your IDE's run configuration, or your OS.

Windows PowerShell, for the current window only:

```powershell
$env:DB_PASSWORD        = 'your-postgres-password'
$env:JWT_SECRET         = 'the-base64-string-from-1.2'
$env:ADMIN_PASSWORD_HASH = 'the-$2a$12$-hash-from-1.2'
```

Windows, persisted for your user account (survives a reboot; open a **new**
terminal afterwards, `setx` does not affect the current one):

```powershell
setx DB_PASSWORD "your-postgres-password"
setx JWT_SECRET "the-base64-string-from-1.2"
setx ADMIN_PASSWORD_HASH "the-hash-from-1.2"
```

Linux or macOS:

```bash
export DB_PASSWORD='your-postgres-password'
export JWT_SECRET='the-base64-string-from-1.2'
export ADMIN_PASSWORD_HASH='the-hash-from-1.2'
```

Those three are the only required ones locally. `DB_URL`, `DB_USERNAME`,
`CORS_ALLOWED_ORIGINS` and everything else default to sensible local values — see
`backend/.env.example` for the full annotated list.

Single quotes matter in PowerShell: a BCrypt hash contains `$` characters, and
double quotes make PowerShell try to expand them as variables.

## 1.4 Start the backend

```powershell
cd backend
mvn spring-boot:run
```

The first run downloads dependencies and takes a few minutes. On startup Flyway
creates the tables, so watch for lines like `Migrating schema "public" to version
1 - baseline schema`. Then check it answers:

```
http://localhost:8080/api/jobs
```

An empty page of results (`{"content":[],...}`) is success — there is no data yet.

## 1.5 Start the frontend

In a second terminal:

```powershell
cd frontend
copy .env.local.example .env.local     # cp on Linux/macOS
npm install
npm run dev
```

The defaults in `.env.local.example` already point at `http://localhost:8080/api`,
so nothing needs editing for local work. The site is at
<http://localhost:3000>, Hindi at <http://localhost:3000/hi>.

## 1.6 Log in and add something

Go to <http://localhost:3000/admin/login> and sign in with username `admin` (or
whatever you set `ADMIN_USERNAME` to) and the plaintext password you hashed in
1.2. You then have Jobs, Admit cards, Results, Answer keys, Syllabus, Cut offs,
Calendar, Papers and Subscribers in the admin bar.

Login is rate limited to 5 attempts per 15 minutes per IP. If you lock yourself
out, restarting the backend clears the counter — it is held in memory.

---

# Part 2 — Change the admin password

There is one admin account and it lives entirely in environment variables. There
is no "change password" screen, and no row in the database to edit — changing the
password means generating a new hash and restarting the backend.

**Step 1.** Generate the hash for the new password:

```powershell
cd backend
mvn -q compile exec:java `
  -Dexec.mainClass=com.sarkariportal.backend.tool.HashPassword `
  -Dexec.args="your-new-password"
```

**Step 2.** Replace `ADMIN_PASSWORD_HASH` with the printed value.

- Locally: `setx ADMIN_PASSWORD_HASH "$2a$12$…"`, then open a new terminal.
- On a host: edit the environment variable in the dashboard (Render → your
  service → *Environment*), which triggers a restart on its own.

**Step 3.** Restart the backend. The new password works immediately.

To change the **username** as well, set `ADMIN_USERNAME`. It is compared
case-insensitively and trimmed, so `Admin` and `admin ` both match.

### One thing that surprises people

Changing the password does **not** log out a session that is already signed in.
The session token is signed with `JWT_SECRET` and carries no reference to the
password, so a token issued before the change stays valid until it expires —
24 hours by default (`JWT_EXPIRATION_MS`).

If the reason you are changing the password is that it may have leaked, that is
not enough. Rotate the JWT secret too, which is Part 3, and every existing token
dies instantly.

### If you are locked out

There is nothing to recover — the plaintext is not stored anywhere. Generate a
hash for a new password, set it, restart. That is the whole recovery procedure,
and it works because the credential is configuration rather than data.

---

# Part 3 — Rotate the JWT secret

Rotating `JWT_SECRET` invalidates every session token in existence, everywhere,
at once. Do it when: the value may have been exposed, you are moving from a
development value to a production one, or you need to force-log-out after a
password change.

1. Generate a new one exactly as in [1.2](#the-jwt-signing-secret).
2. Set `JWT_SECRET` to the new value in every environment that runs the backend.
3. Restart. Anyone signed in gets a 401 on their next action and the admin UI
   sends them back to the login screen — the frontend already handles this and
   shows "Session expired. Please log in again." rather than failing silently.

Nothing else needs changing. The frontend holds no copy of the secret, and there
is no server-side session store to clear.

> If this repository was ever pushed to a public host with a `JWT_SECRET` filled
> in anywhere — including an old `.env.example` — treat that value as public and
> rotate it before going live. The startup validator now rejects the specific
> placeholder that used to ship in this repo, but it cannot know about a value
> you chose yourself and pushed by accident.

---

# Part 4 — Deploy from scratch to live

The shape of the deployment: a managed PostgreSQL database, the Spring Boot jar
running as a web service, and the Next.js site on a separate host, talking to the
API over HTTPS. Render for the backend and Vercel for the frontend are the worked
example below because they are free to start and neither needs a Dockerfile, but
nothing here is specific to them — any host that runs a JVM and any host that runs
Next.js will do.

Budget an hour for the first time through, most of which is waiting for builds and
for DNS.

## 4.0 Decide the two addresses first

Almost every deployment problem in this stack is a mismatch between three values
that all have to agree. Write them down before you start:

| | Example |
|---|---|
| Frontend origin | `https://rojgarhub.in` |
| Backend origin | `https://rojgarhub-api.onrender.com` |
| API base URL | `https://rojgarhub-api.onrender.com/api` |

The rules that trip people up: the API base URL **includes** `/api`; neither
origin has a trailing slash; and both must be `https`, because an https page is
not allowed to call an http API — the browser blocks it as mixed content and the
site looks broken with nothing in the server logs.

## 4.1 Provision the database

On Render: *New* → *Postgres*, pick a region close to your users (Singapore for
India), and copy the **Internal Database URL** — internal, not external, because
traffic then stays on Render's network and is faster and not exposed.

That URL looks like `postgres://user:pass@host/dbname`, which is **not** what JDBC
wants. Convert it:

```
DB_URL=jdbc:postgresql://<host>:5432/<dbname>
DB_USERNAME=<user>
DB_PASSWORD=<pass>
```

Some managed providers also require `?sslmode=require` on the end of `DB_URL`.
Render's internal URL does not; Neon, Supabase and most others do. If the backend
starts and then fails with an SSL error, that is the missing piece.

You do not need to create tables, run any SQL, or run Flyway by hand. The four
migrations in `db/migration` run automatically on first boot, and Flyway records
what it has applied in a `flyway_schema_history` table so restarts are safe.

## 4.2 Deploy the backend

Confirm it packages locally first — a build that fails on the host costs ten
minutes to find out about, and thirty seconds locally:

```powershell
cd backend
mvn clean package -DskipTests
```

That produces `target/backend-0.0.1-SNAPSHOT.jar`, which is self-contained: it has
Tomcat inside it and runs with `java -jar`.

On Render: *New* → *Web Service* → connect the repository.

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Runtime | Java |
| Build command | `mvn clean package -DskipTests` |
| Start command | `java -jar target/backend-0.0.1-SNAPSHOT.jar` |
| Health check path | `/api/jobs` |

Then set the environment variables. **Generate a fresh `JWT_SECRET` for
production** — do not reuse the local one; a development value that has been on
your machine, in your shell history and possibly in a screenshot is not a
production secret.

| Variable | Value |
|---|---|
| `DB_URL` | `jdbc:postgresql://…` from 4.1 |
| `DB_USERNAME` | from 4.1 |
| `DB_PASSWORD` | from 4.1 |
| `JWT_SECRET` | a **new** `openssl rand -base64 48` |
| `ADMIN_PASSWORD_HASH` | a **new** hash, for a different password than local |
| `ADMIN_USERNAME` | optional, defaults to `admin` |
| `CORS_ALLOWED_ORIGINS` | your frontend origin — see 4.4 |
| `LOG_LEVEL` | `INFO` |

The port needs no configuration. Render, Railway, Fly and Heroku all inject `PORT`
and `application.properties` reads it first, falling back to `SERVER_PORT` and then
8080. If you are deploying somewhere that does neither, set `SERVER_PORT`.

Deploy, then watch the log for `Started BackendApplication`. If it exits during
startup instead, the message names the variable — see
[When it refuses to start](#when-it-refuses-to-start).

Verify from your own machine before moving on:

```bash
curl https://your-backend.onrender.com/api/jobs
```

On Render's free tier the first request after 15 idle minutes takes 30–60 seconds
while the container wakes. This is worth knowing before you conclude something is
broken, and it is the main reason to move to a paid instance once the site has
real visitors.

## 4.3 Deploy the frontend

On Vercel: *Add New* → *Project* → import the repository, and set the **root
directory to `frontend`**. Framework detection, build command and output directory
all take care of themselves for Next.js.

Set the environment variables before the first deploy:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://your-backend.onrender.com/api` |
| `NEXT_PUBLIC_SITE_URL` | `https://rojgarhub.in` |
| `NEXT_PUBLIC_GA_ID` | `G-…` if you want analytics, else leave empty |
| `NEXT_PUBLIC_GSC_VERIFICATION` | from Search Console, later — see 4.7 |
| `NEXT_PUBLIC_ALLOW_INDEXING` | `true` on the real site only |

Every one of these is `NEXT_PUBLIC_*`, which means Next inlines the value into the
browser bundle **at build time**. Two consequences:

- Nothing here can hold a secret. It ships to every visitor. The API URL and the
  site URL are public information anyway; do not be tempted to add anything else.
- Changing one in the dashboard does nothing until you **redeploy**. A restart does
  not pick it up. This is the single most common "I changed the variable and
  nothing happened" in this stack.

Preview deployments on `*.vercel.app` are detected and serve `Disallow: /` in
robots.txt automatically, so a preview build cannot compete with the real site in
search results. A custom staging domain is not detectable, so set
`NEXT_PUBLIC_ALLOW_INDEXING=false` there explicitly.

## 4.4 Point CORS at the real frontend

This is the step that is easy to skip and guarantees a broken site.
`CORS_ALLOWED_ORIGINS` defaults to `http://localhost:3000`. Left at that, the
deployed frontend's every API call is blocked by the browser, with a CORS error in
the console that reads like a frontend bug.

Go back to the backend's environment and set:

```
CORS_ALLOWED_ORIGINS=https://rojgarhub.in,https://www.rojgarhub.in
```

Exact origins, comma-separated. Include the `www` variant if it resolves. No
wildcards, no trailing slashes, scheme always included — all three are rejected at
startup with a message naming the offending value, rather than failing later as a
browser error nobody can trace.

Restart the backend, then load the deployed site and confirm the job listings
appear. If they do, the frontend, the API and CORS all agree.

## 4.5 Custom domain and HTTPS

Point the domain at the frontend host (Vercel → *Settings* → *Domains*, then the
CNAME or A record it gives you at your registrar). Certificates are issued
automatically; allow up to an hour for DNS and the certificate.

Optionally give the backend a subdomain of its own — `api.rojgarhub.in` — which
means the API keeps working if you ever move hosts. If you do, remember it changes
two things: `NEXT_PUBLIC_API_URL` on the frontend (and a redeploy), and nothing on
the backend, since `CORS_ALLOWED_ORIGINS` lists the *frontend* origin, not its own.

The backend already sends HSTS with a one-year max-age and `includeSubDomains`.
That header is only honoured over https, so it costs nothing while you are on
localhost and starts protecting the moment you are live.

## 4.6 First login on production

Go to `https://rojgarhub.in/admin/login` and sign in with the production password
from 4.2. If it fails, check in this order:

1. Does `curl https://your-backend.onrender.com/api/jobs` answer? If not, the
   backend is down, not the login.
2. Is `NEXT_PUBLIC_API_URL` right, including `/api`, and has the frontend been
   **redeployed** since you set it?
3. Did you set `ADMIN_PASSWORD_HASH` to the hash and not to the password? The
   backend refuses to start in that case, so if it is running, this is not it.
4. Five failed attempts locks the IP out for 15 minutes and answers `429`. Wait, or
   restart the backend.

Then add one job through the admin UI and confirm it appears on the public
homepage. That single round trip exercises the database, Flyway's schema, the JWT,
CORS and the frontend together — it is the real smoke test.

## 4.7 Tell search engines the site exists

The site generates its own sitemap from the live database, so there is nothing to
regenerate by hand as content grows.

1. Confirm both feeds answer: `https://rojgarhub.in/sitemap.xml` and
   `https://rojgarhub.in/robots.txt`. The sitemap should list the static pages, the
   category and state landing pages, and every job — each in both English and
   Hindi, with `hreflang` annotations.
2. Google Search Console → *Add property* → *Domain* and verify by DNS if you can
   (it covers every subdomain and never expires). If you would rather use the HTML
   tag method, paste **only the content value** into
   `NEXT_PUBLIC_GSC_VERIFICATION` and redeploy.
3. Search Console → *Sitemaps* → submit `sitemap.xml`.
4. Bing Webmaster Tools can import the verified Search Console property, which is
   less work than verifying again.

Indexing takes days to weeks. Submitting the sitemap is what starts the clock;
nothing else you do here speeds it up.

## 4.8 After the first deploy

- **Adding content types or columns** means a new `V5__*.sql` migration. Never edit
  a migration that has already run — Flyway records a checksum and refuses to start
  if one changes. Add a new file.
- **Redeploy order matters** when a change touches both sides: backend first, then
  frontend. `lib/api.js` tolerates the old response shape as well as the new one for
  exactly this reason, but a frontend that expects a field the API does not send yet
  is still a bad few minutes.
- **Back the database up.** Render's free Postgres has no automatic backups and is
  deleted after 90 days. `pg_dump` on a schedule, or a paid tier.

---

# Environment variable reference

## Backend

Required — the application will not start without these:

| Variable | Notes |
|---|---|
| `DB_PASSWORD` | Database password. |
| `JWT_SECRET` | ≥32 chars, random. Rejected if it looks like a placeholder or has fewer than 8 distinct characters. |
| `ADMIN_PASSWORD_HASH` | BCrypt hash, starts `$2a$`/`$2b$`/`$2y$`. Rejected if it is not one. |

Optional — defaults in brackets:

| Variable | Default | Notes |
|---|---|---|
| `DB_URL` | `jdbc:postgresql://localhost:5432/sarkari_portal` | |
| `DB_USERNAME` | `postgres` | |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | **Must** be changed in production. |
| `ADMIN_USERNAME` | `admin` | |
| `PORT` / `SERVER_PORT` | `8080` | `PORT` wins; most hosts set it for you. |
| `JWT_EXPIRATION_MS` | `86400000` (24h) | How long a login lasts. |
| `DB_POOL_SIZE` | `10` | |
| `RATELIMIT_LOGIN_MAX` | `5` | Per IP, per window. |
| `RATELIMIT_LOGIN_WINDOW` | `900` | Seconds. |
| `RATELIMIT_SUBSCRIBE_MAX` | `3` | |
| `RATELIMIT_SUBSCRIBE_WINDOW` | `3600` | |
| `VIEWCOUNT_DEDUP_SECONDS` | `21600` | How long one IP is ignored re-viewing a job. |
| `LOG_LEVEL` | `INFO` | |

## Frontend

All are `NEXT_PUBLIC_*`, all are baked in at build time, none can hold a secret.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_URL` | Include `/api`. https in production. |
| `NEXT_PUBLIC_SITE_URL` | This site's own origin, no trailing slash. Drives canonical tags, Open Graph, JSON-LD, the sitemap and share links. |
| `NEXT_PUBLIC_GA_ID` | GA4 measurement ID. Empty = no analytics script at all. Skipped on localhost and on non-production builds regardless. |
| `NEXT_PUBLIC_GSC_VERIFICATION` | Search Console HTML-tag content value only. |
| `NEXT_PUBLIC_BING_VERIFICATION` | Bing `msvalidate.01` content value. |
| `NEXT_PUBLIC_ALLOW_INDEXING` | `false` on anything that is not the real site. `*.vercel.app` and localhost are blocked automatically. |

---

# When it refuses to start

The backend fails loudly and names the problem. Every message below is a
deliberate startup guard, not a bug — it is choosing to crash rather than run
insecurely or against the wrong schema.

| Message contains | Cause | Fix |
|---|---|---|
| `JWT_SECRET is not set` | Variable missing or empty. | Generate one, [1.2](#the-jwt-signing-secret). |
| `JWT_SECRET is too short` | Under 32 characters. | `openssl rand -base64 48`. |
| `JWT_SECRET is a known placeholder value` | Value copied from a template or contains `change-this`, `dev-secret`, `example-`, `placeholder` and similar. | Generate a real one. |
| `JWT_SECRET has too little variety` | Something like `aaaa…`. | Generate a real one. |
| `ADMIN_PASSWORD_HASH is not set` | Variable missing. | Run the hash tool, [1.2](#the-admin-password-hash). |
| `does not look like a BCrypt hash` | You set the password instead of its hash. | Run the hash tool and use its output. |
| `CORS_ALLOWED_ORIGINS is empty` | Set to a blank string. | List your frontend origin. |
| `must list exact origins, not wildcards` | A `*` in the value. | Spell the origins out. |
| `CORS origin must include the scheme` | `rojgarhub.in` instead of `https://rojgarhub.in`. | Add `https://`. |
| `CORS origin must not end with a slash` | Trailing `/`. | Remove it. Browsers send `Origin` without one, so it would match nothing. |
| `Schema-validation: missing table` / `missing column` | Flyway did not run, or is pointing at a different database than the entities expect. | Check `DB_URL`; confirm `flyway_schema_history` exists and lists all four versions. |
| `password authentication failed` | Wrong `DB_PASSWORD`, or PowerShell expanded a `$` in a double-quoted value. | Re-set it with single quotes. |
| `Connection refused` on startup | PostgreSQL not running, or wrong host/port. | Start Postgres; check `DB_URL`. |
| `Validate failed: migration checksum mismatch` | A migration file that already ran was edited. | Restore the file; put the change in a new `V5__*.sql`. |

Frontend problems have a different shape, because the build almost always
succeeds and the failure is visible only in the browser:

| Symptom | Cause |
|---|---|
| Listings empty, CORS error in console | `CORS_ALLOWED_ORIGINS` does not include the frontend origin. |
| Listings empty, mixed-content error | `NEXT_PUBLIC_API_URL` is `http` on an `https` page. |
| "Could not load. Is the backend running?" | Backend down, or asleep on a free tier — retry in a minute. |
| Changed a variable, nothing happened | `NEXT_PUBLIC_*` values are baked in at build time. Redeploy. |
| Canonical tags point at the wrong domain | `NEXT_PUBLIC_SITE_URL` unset or left at the default on that deployment. |
| Login works, then every action 401s | Token expired (24h), or `JWT_SECRET` changed on the backend. Log in again. |

---

# Notes and honest caveats

The backend Java in this repository has not been compiled in the environment where
these files were most recently edited — no JDK or Maven was available there — so
`mvn clean package` on your machine is the first real compile. Likewise
`npm run build` has not been run against the current frontend tree; the frontend
was checked with a parse-and-server-render harness instead, which catches import
errors, missing translation keys and undefined CSS classes but is not a substitute
for a real Next build. Run both before the first deploy.

Content ingestion is manual. There is no scraper and no RSS import — every job,
notice, cut-off, calendar entry and paper is entered through the admin UI. That is
a deliberate boundary: the source notifications are PDFs on dozens of inconsistent
government sites, and a wrong date on a job posting is worse than a missing one.

The public pages are bilingual. `about`, `contact`, `privacy`, `disclaimer` and the
entire admin area are English only, on purpose — the first four are legal text that
should not be machine-translated, and the admin area has exactly one user.




