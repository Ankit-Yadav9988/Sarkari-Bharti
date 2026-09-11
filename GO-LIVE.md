# Go live — every command, and a free server that never sleeps

This is the practical companion to `DEPLOY.md`. Same project, different goal:
`DEPLOY.md` explains how each piece works. This one is a checklist you can follow
top to bottom with copy-paste commands, ending with the site live on the internet
and submitted to Google Search Console.

Read Part 0 once. After that you can jump to whichever part you need.

**Contents**

| Part | What it covers |
|---|---|
| 0 | The rules, and what "free forever" really means |
| 1 | Every command, with demo values you can copy |
| 2 | Put the code on GitHub |
| 3 | The architecture, and why this one never sleeps |
| 4 | The backend server (Oracle Cloud Always Free) |
| 5 | The frontend (Vercel free) |
| 6 | Connecting the two (CORS) |
| 7 | Google Search Console |
| 8 | Renaming the site |
| 9 | Name ideas |
| 10 | When something breaks |
| 11 | Honest caveats — read before you trust anything here |

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
| Backend | Oracle Cloud Always Free VM | Yes, card for identity check only | No — it is your own Linux machine |
| Database | PostgreSQL installed on that same VM | Yes | No — no 30/90-day expiry, no idle suspend |
| HTTPS certificate | Let's Encrypt via certbot | Yes | Auto-renews |
| API hostname | DuckDNS subdomain | Yes | No |

This is the combination that satisfies your two hard requirements — the backend
must not shut down, and the database must not expire. Render's and Railway's free
tiers fail one or both: Render sleeps a free web service after inactivity and
expires free Postgres, Railway's free credit runs out monthly. Running your own
always-free VM removes both problems, at the cost of doing the Linux setup once.

> Oracle reclaims **idle** Always Free compute instances (roughly: under 20% CPU,
> low network, for 7 days). Part 4.12 sets up an uptime monitor that pings the
> health endpoint every 5 minutes, which keeps the instance in use and gives you
> downtime alerts at the same time.

---

# Part 1 — Every command, with demo data

## 1.0 The demo values used below

Substitute your own. These are written to be obviously fake.

| Placeholder | Demo value used in this document |
|---|---|
| Admin username | `ankit` |
| Admin password | `Rojgar@2026#Live` |
| Postgres password | `Str0ng-Local-Pg-Pass` |
| Database name | `sarkari_portal` |
| JWT secret | `EXAMPLE-ONLY-DO-NOT-USE-ThisIsNotRandomGenerateYourOwnWithOpenssl` |
| Password hash | `$2a$12$EXAMPLEonlyEXAMPLEonlyNotARealHashDoNotUseThisValue00` |
| Server public IP | `132.145.10.42` |
| API hostname | `rojgarhub-api.duckdns.org` |
| Frontend URL | `https://rojgarhub.vercel.app` |

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
shell, and the server's environment file.

## 1.2 Generate the admin password hash

The backend never stores your password, only a BCrypt hash of it. Generate the
hash from the password you chose:

**Windows PowerShell**

```powershell
cd backend
mvn -q compile exec:java `
  -Dexec.mainClass=com.sarkariportal.backend.tool.HashPassword `
  -Dexec.args="Rojgar@2026#Live"
```

**Linux / macOS**

```bash
cd backend
mvn -q compile exec:java \
  -Dexec.mainClass=com.sarkariportal.backend.tool.HashPassword \
  -Dexec.args="Rojgar@2026#Live"
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

**On the live server** (full context in Part 4.8):

```bash
sudo nano /etc/rojgarhub/backend.env      # edit the ADMIN_USERNAME= line
sudo systemctl restart rojgarhub-api
```

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

On the live server:

```bash
sudo nano /etc/rojgarhub/backend.env      # replace the ADMIN_PASSWORD_HASH= line
```

**Step 3 — restart**

```bash
sudo systemctl restart rojgarhub-api      # server
# locally: stop mvn spring-boot:run with Ctrl+C and start it again
```

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
  -d '{"username":"ankit","password":"Rojgar@2026#Live"}'
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
| `DB_USERNAME` | no | `postgres` | `rojgarhub` |
| `DB_PASSWORD` | **yes** | — | `Str0ng-Local-Pg-Pass` |
| `JWT_SECRET` | **yes** | — | output of `openssl rand -base64 48` |
| `ADMIN_USERNAME` | no | `admin` | `ankit` |
| `ADMIN_PASSWORD_HASH` | **yes** | — | `$2a$12$…` |
| `CORS_ALLOWED_ORIGINS` | **yes in production** | `http://localhost:3000` | `https://rojgarhub.vercel.app` |
| `PORT` / `SERVER_PORT` | no | `8080` | `8080` |
| `JWT_EXPIRATION_MS` | no | `86400000` (24h) | `86400000` |
| `DB_POOL_SIZE` | no | `10` | `5` on a 1 GB server |
| `LOG_LEVEL` | no | `INFO` | `INFO` |
| `RATELIMIT_LOGIN_MAX` | no | `5` | `5` |
| `RATELIMIT_LOGIN_WINDOW` | no | `900` | `900` |
| `RATELIMIT_SUBSCRIBE_MAX` | no | `3` | `3` |
| `RATELIMIT_SUBSCRIBE_WINDOW` | no | `3600` | `3600` |
| `VIEWCOUNT_DEDUP_SECONDS` | no | `21600` (6h) | `21600` |

Frontend variables (all are baked into the browser bundle at **build** time — a
change needs a redeploy, not a restart, and none of them can hold a secret):

| Variable | Required | Demo value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **yes** | `https://rojgarhub-api.duckdns.org/api` |
| `NEXT_PUBLIC_SITE_URL` | **yes in production** | `https://rojgarhub.vercel.app` |
| `NEXT_PUBLIC_GSC_VERIFICATION` | no | `AbCdEf1234567890_exampleTokenOnly` |
| `NEXT_PUBLIC_GA_ID` | no | `G-EXAMPLE1234` |
| `NEXT_PUBLIC_BING_VERIFICATION` | no | — |
| `NEXT_PUBLIC_ALLOW_INDEXING` | no | leave unset in production |

## 1.10 Rotate the JWT secret (kick every session out now)

```bash
openssl rand -base64 48                    # 1. generate
sudo nano /etc/rojgarhub/backend.env       # 2. replace JWT_SECRET=
sudo systemctl restart rojgarhub-api       # 3. restart
```

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

# Part 3 — The architecture

```
   Visitor's browser
          |
          |  https://rojgarhub.vercel.app
          v
   +--------------------------+
   |  Vercel (free)           |   Next.js — pages, SEO, sitemap, robots
   |  global CDN, never idle  |   Rebuilds automatically on git push
   +--------------------------+
          |
          |  https://rojgarhub-api.duckdns.org/api
          v
   +--------------------------+
   |  Oracle Cloud VM (free)  |
   |                          |
   |   nginx :443  --TLS----> |   Let's Encrypt certificate, auto-renewed
   |     |                    |
   |     v                    |
   |   Spring Boot :8080      |   systemd keeps it running and restarts it
   |     |                    |
   |     v                    |
   |   PostgreSQL :5432       |   on the same machine, listening on localhost only
   +--------------------------+
```

Three design points worth understanding before you build it:

**Why HTTPS on the backend is not optional.** Vercel serves the site over HTTPS.
A browser on an HTTPS page refuses to call a plain `http://` API — it blocks it
as mixed content, with no visible error to the user. The pages themselves would
still load, because Next fetches those on the server, but the view counter, the
subscribe form and the entire admin area call the API from the browser and would
all silently fail. Hence nginx + certbot in Part 4.

**Why nginx at all**, rather than exposing Java directly: certbot integrates with
it in one command, it terminates TLS so the JVM never handles certificates, and
it means only ports 80 and 443 are ever open to the internet.

**Why Postgres on the same box.** Every free managed Postgres has an expiry or an
idle-suspend attached to it. A database you install yourself has neither. The
cost is that backups are your job — Part 4.13.

---

# Part 4 — The backend server (Oracle Cloud Always Free)

Budget about 90 minutes the first time. Everything here is a one-off; after this,
deploying an update is three commands.

## 4.1 Create the account

1. Go to <https://www.oracle.com/cloud/free/> → **Start for free**.
2. Country: India. You need a credit or debit card. It is used to verify identity
   — Oracle places a small temporary hold (usually refunded within days) and does
   not charge for Always Free resources.
3. **Choose your home region carefully: it cannot be changed later.** Pick
   `India South (Hyderabad)` or `India West (Mumbai)`. Always Free resources only
   exist in the home region.
4. You get a 30-day trial with credits *plus* Always Free resources. When the
   trial ends the account drops to Free Tier and the Always Free resources keep
   running. Do not let the account be "upgraded" unless you intend to pay.

If card verification fails — a common problem with Indian cards — try a different
card, or a different browser with no ad-blocker. Some banks block the
international verification attempt; a UPI-linked card usually does not work.

## 4.2 Create the virtual machine

Menu → **Compute** → **Instances** → **Create instance**.

| Setting | Choose |
|---|---|
| Name | `rojgarhub-api` |
| Image | **Canonical Ubuntu 22.04** |
| Shape | `VM.Standard.A1.Flex` — **2 OCPU, 12 GB memory** |
| Boot volume | 50 GB (the free minimum) |
| SSH keys | **Save the private key file.** It is shown once. |

Every option marked *Always Free eligible* is free. Anything else is not.

**"Out of host capacity for shape VM.Standard.A1.Flex"** is the single most common
blocker. The ARM instances are heavily oversubscribed. Options, in order:

1. Try a different Availability Domain in the same region (AD-1, AD-2, AD-3).
2. Lower the request to 1 OCPU / 6 GB.
3. Retry at a different time of day. It often frees up overnight.
4. **Fall back to `VM.Standard.E2.1.Micro`** (AMD, 1 OCPU, 1 GB RAM). Always
   available, never capacity-blocked, and it does run this stack — but 1 GB is
   tight. See the note at the end of 4.5.

**Reserve the public IP** so it survives a stop/start: on the instance page →
*Attached VNICs* → the VNIC → *IPv4 Addresses* → edit the primary → change
*Ephemeral* to *Reserved*. Skipping this means your IP changes and the API
hostname points at nothing.

Connect:

```bash
chmod 600 ~/Downloads/ssh-key-2026.key
ssh -i ~/Downloads/ssh-key-2026.key ubuntu@132.145.10.42
```

On Windows use the same command in PowerShell, or PuTTY with the `.ppk`
conversion. The username is `ubuntu` for Ubuntu images (`opc` for Oracle Linux).

## 4.3 Firewall layer 1 — the VCN security list

**Oracle has two firewalls and you must open both.** Missing this is why "the
server is running but nothing loads" is the most-reported Oracle problem.

Menu → **Networking** → **Virtual Cloud Networks** → your VCN → **Security Lists**
→ *Default Security List* → **Add Ingress Rules**:

| Source CIDR | Protocol | Destination port | For |
|---|---|---|---|
| `0.0.0.0/0` | TCP | `80` | HTTP — certbot needs this to issue the certificate |
| `0.0.0.0/0` | TCP | `443` | HTTPS — the actual API traffic |

Leave the existing rule for port 22 alone. Do **not** open 8080 or 5432 — nginx
is the only thing that should be reachable, and Postgres must never be.

## 4.4 Firewall layer 2 — iptables on the machine itself

Oracle's Ubuntu images ship with iptables rules already loaded, ending in a REJECT
rule. A new ACCEPT rule appended at the end never runs, so it must be inserted
*before* the REJECT.

```bash
sudo iptables -L INPUT --line-numbers -n
```

Find the line number of the first `REJECT` rule — commonly 6. Insert at that
number:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Check they landed above the REJECT:

```bash
sudo iptables -L INPUT --line-numbers -n
```

> Do not `ufw enable` on an Oracle instance. It replaces the existing rules,
> including the one allowing SSH, and locks you out of your own server. If that
> happens, the only recovery is Oracle's serial console.

## 4.5 Install everything

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y openjdk-17-jdk maven git nginx postgresql postgresql-contrib \
                    certbot python3-certbot-nginx unzip

java -version      # expect openjdk version "17.x"
```

**On a 1 GB micro instance, add swap first** or the build and the JVM will be
killed by the kernel:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

On 1 GB, also lower the JVM heap to `-Xmx384m` in the systemd unit (4.9), set
`DB_POOL_SIZE=5`, and build the jar on your own PC and copy it up with `scp`
rather than running Maven on the server.

## 4.6 Create the database

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE sarkari_portal;
CREATE USER rojgarhub WITH PASSWORD 'put-a-strong-password-here';
GRANT ALL PRIVILEGES ON DATABASE sarkari_portal TO rojgarhub;
\c sarkari_portal
GRANT ALL ON SCHEMA public TO rojgarhub;
SQL
```

The last line matters on PostgreSQL 15 and newer, where the `public` schema no
longer grants create rights automatically — without it Flyway fails on the first
migration with a permission error. It is harmless on older versions.

Confirm Postgres is listening on localhost only (the default, and what you want):

```bash
sudo ss -ltnp | grep 5432      # should show 127.0.0.1:5432, not 0.0.0.0:5432
```

## 4.7 Build the application

```bash
sudo mkdir -p /opt/rojgarhub
sudo useradd --system --no-create-home --shell /usr/sbin/nologin rojgarhub

cd ~
git clone https://github.com/<your-username>/<repo-name>.git app
cd app/backend
mvn clean package -DskipTests

sudo cp target/backend-0.0.1-SNAPSHOT.jar /opt/rojgarhub/backend.jar
sudo chown rojgarhub:rojgarhub /opt/rojgarhub/backend.jar
```

Building from your own PC instead? `mvn clean package -DskipTests` locally, then:

```bash
scp -i ~/Downloads/ssh-key-2026.key \
    backend/target/backend-0.0.1-SNAPSHOT.jar ubuntu@132.145.10.42:/tmp/backend.jar
ssh -i ~/Downloads/ssh-key-2026.key ubuntu@132.145.10.42 \
    'sudo mv /tmp/backend.jar /opt/rojgarhub/backend.jar && sudo chown rojgarhub:rojgarhub /opt/rojgarhub/backend.jar'
```

## 4.8 The environment file

Secrets go in a file readable only by root, not in the systemd unit — a unit file
is world-readable and `systemctl cat` prints it.

```bash
sudo mkdir -p /etc/rojgarhub
sudo nano /etc/rojgarhub/backend.env
```

```ini
DB_URL=jdbc:postgresql://localhost:5432/sarkari_portal
DB_USERNAME=rojgarhub
DB_PASSWORD=put-a-strong-password-here
DB_POOL_SIZE=10

JWT_SECRET=paste-the-openssl-rand-base64-48-output-here

ADMIN_USERNAME=ankit
ADMIN_PASSWORD_HASH=$2a$12$EXAMPLEonlyEXAMPLEonlyNotARealHashDoNotUseThisValue00

CORS_ALLOWED_ORIGINS=https://rojgarhub.vercel.app

SERVER_PORT=8080
LOG_LEVEL=INFO
```

```bash
sudo chmod 600 /etc/rojgarhub/backend.env
sudo chown root:root /etc/rojgarhub/backend.env
```

Format rules for this file, all of which cause silent failures if broken:

- No `export`, no spaces around `=`, one variable per line.
- **No quotes around the values.** systemd keeps quotes as part of the value, so
  `JWT_SECRET="abc"` sets the secret to `"abc"` including the quote marks.
- The `$` characters in the BCrypt hash are safe here — systemd does not expand
  variables inside an `EnvironmentFile`. They are *not* safe on an interactive
  shell line, where single quotes are required.
- No trailing spaces. A trailing space becomes part of the password hash and
  every login fails.

Verify the hash survived intact — it must be exactly 60 characters and start with
`$2a$`:

```bash
sudo grep ADMIN_PASSWORD_HASH /etc/rojgarhub/backend.env | cut -d= -f2- | wc -c
# 61  (60 characters plus the newline)
```

## 4.9 Run it as a service

```bash
sudo nano /etc/systemd/system/rojgarhub-api.service
```

```ini
[Unit]
Description=RojgarHub API
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service

[Service]
Type=simple
User=rojgarhub
WorkingDirectory=/opt/rojgarhub
EnvironmentFile=/etc/rojgarhub/backend.env
ExecStart=/usr/bin/java -Xms256m -Xmx768m -jar /opt/rojgarhub/backend.jar
SuccessExitStatus=143
Restart=always
RestartSec=10

# Hardening: the process only needs to read its jar and reach Postgres.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rojgarhub-api
sudo systemctl status rojgarhub-api
```

`Restart=always` plus `enable` is what makes this never shut down: the service
comes back after a crash, and after a reboot of the machine.

Watch the first start — Flyway builds the schema here:

```bash
sudo journalctl -u rojgarhub-api -f
```

Then, from the server itself:

```bash
curl http://127.0.0.1:8080/api/health
# {"status":"ok","db":"up"}
```

If that fails, read Part 10 before changing anything.

## 4.10 nginx in front

```bash
sudo nano /etc/nginx/sites-available/rojgarhub-api
```

```nginx
server {
    listen 80;
    server_name rojgarhub-api.duckdns.org;

    # Do not advertise the nginx version.
    server_tokens off;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        # The backend reads these to see the real visitor IP rather than
        # nginx's. Rate limiting and the view counter both depend on it --
        # application.properties already sets forward-headers-strategy=framework.
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 10s;
        proxy_read_timeout    60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/rojgarhub-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 4.11 A free hostname and free HTTPS

You need a hostname before you can have a certificate — Let's Encrypt will not
issue one for a bare IP address.

**DuckDNS** gives you one free, permanently:

1. <https://www.duckdns.org> → sign in with Google or GitHub.
2. Create the subdomain `rojgarhub-api` → you get `rojgarhub-api.duckdns.org`.
3. Put your server's public IP (`132.145.10.42`) in the IP box and click update.
4. Copy your account token from the top of the page.

Check it resolves before continuing — DNS can take a couple of minutes:

```bash
dig +short rojgarhub-api.duckdns.org      # must print your server IP
```

Keep it pointed at the server even if the IP ever changes:

```bash
mkdir -p ~/duckdns
cat > ~/duckdns/duck.sh <<'EOF'
#!/bin/bash
curl -k -s "https://www.duckdns.org/update?domains=rojgarhub-api&token=YOUR-DUCKDNS-TOKEN&ip=" -o ~/duckdns/duck.log
EOF
chmod 700 ~/duckdns/duck.sh
( crontab -l 2>/dev/null; echo "*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1" ) | crontab -
```

**Then get the certificate:**

```bash
sudo certbot --nginx -d rojgarhub-api.duckdns.org
```

Answer the email prompt, agree to the terms, and choose the redirect option when
asked. Certbot edits the nginx config in place, adds the `listen 443 ssl` block,
and installs a renewal timer.

```bash
sudo systemctl list-timers | grep certbot     # renewal is scheduled
sudo certbot renew --dry-run                  # renewal actually works
```

Now check from your own computer, not the server:

```bash
curl https://rojgarhub-api.duckdns.org/api/health
# {"status":"ok","db":"up"}
```

If this times out, the problem is a firewall — go back to 4.3 and 4.4. Port 80
must stay open afterwards too, or renewal fails in 90 days and the site breaks
with an expired-certificate warning.

## 4.12 Keep it alive, and know when it is not

Oracle reclaims Always Free compute instances that stay idle — roughly under 20%
CPU with low network activity for 7 days. An uptime monitor solves that and tells
you about outages in the same move.

Sign up at <https://uptimerobot.com> (free plan, 50 monitors, 5-minute checks):

| Field | Value |
|---|---|
| Monitor type | HTTP(s) |
| URL | `https://rojgarhub-api.duckdns.org/api/health` |
| Interval | 5 minutes |
| Alert | your email |

`/api/health` exists for exactly this. It is public, needs no token, checks that
the database actually answers, returns 503 when it does not, and returns nothing
else — no version, no hostname, no stack trace.

Add a second monitor on `https://rojgarhub.vercel.app` so you also hear about
frontend problems.

## 4.13 Backups

A self-hosted database has no automatic backups. Fifteen minutes now:

```bash
sudo mkdir -p /var/backups/rojgarhub
sudo chown ubuntu:ubuntu /var/backups/rojgarhub

cat > ~/backup-db.sh <<'EOF'
#!/bin/bash
set -e
STAMP=$(date +%F)
PGPASSWORD='put-a-strong-password-here' pg_dump -U rojgarhub -h 127.0.0.1 \
  sarkari_portal | gzip > /var/backups/rojgarhub/db-$STAMP.sql.gz
find /var/backups/rojgarhub -name 'db-*.sql.gz' -mtime +14 -delete
EOF

chmod 700 ~/backup-db.sh
~/backup-db.sh && ls -lh /var/backups/rojgarhub

( crontab -l 2>/dev/null; echo "0 2 * * * ~/backup-db.sh >/dev/null 2>&1" ) | crontab -
```

Daily at 2am, two weeks kept. **A backup on the same machine is not a backup** —
download one to your PC every so often:

```bash
scp -i ~/Downloads/ssh-key-2026.key \
    ubuntu@132.145.10.42:/var/backups/rojgarhub/db-2026-09-09.sql.gz .
```

Restore, if you ever need it:

```bash
gunzip -c db-2026-09-09.sql.gz | psql -U rojgarhub -h 127.0.0.1 sarkari_portal
```

## 4.14 Deploying a backend update later

```bash
ssh -i ~/Downloads/ssh-key-2026.key ubuntu@132.145.10.42
cd ~/app && git pull
cd backend && mvn clean package -DskipTests
sudo cp target/backend-0.0.1-SNAPSHOT.jar /opt/rojgarhub/backend.jar
sudo systemctl restart rojgarhub-api
sudo journalctl -u rojgarhub-api -n 40
```

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
| `NEXT_PUBLIC_API_URL` | `https://rojgarhub-api.duckdns.org/api` |
| `NEXT_PUBLIC_SITE_URL` | `https://rojgarhub.vercel.app` |

Note the `/api` suffix on the first one and its absence on the second. Neither has
a trailing slash.

There is a chicken-and-egg problem: you do not know your Vercel URL until the
first deploy. So:

1. Deploy once with only `NEXT_PUBLIC_API_URL` set.
2. Read the production URL off the dashboard — the clean one, `rojgarhub.vercel.app`,
   not the long per-deployment one with a hash in it.
3. Add `NEXT_PUBLIC_SITE_URL` with that value.
4. **Redeploy.** Every `NEXT_PUBLIC_*` value is compiled into the JavaScript bundle
   at build time. Changing it in the dashboard does nothing until a new build runs.
   *Deployments → ⋯ → Redeploy.*

Getting `NEXT_PUBLIC_SITE_URL` wrong is not cosmetic: it is the value behind every
canonical tag, every Open Graph URL, the sitemap, and the hreflang pairs. Unset,
they all claim to be `https://rojgarhub.in`, a domain you do not own.

## 5.3 Confirm the deploy is crawlable

Open `https://rojgarhub.vercel.app/robots.txt`. It must start:

```
User-agent: *
Allow: /
```

and end with `Sitemap: https://rojgarhub.vercel.app/sitemap.xml`.

If it says `Disallow: /` instead, the site is invisible to Google and nothing in
Part 7 will work. Causes, in order of likelihood:

- `NEXT_PUBLIC_ALLOW_INDEXING` is set to `false` somewhere. Remove it.
- `NEXT_PUBLIC_SITE_URL` still points at localhost.
- You are looking at a preview deployment rather than production. Branch and
  pull-request builds are blocked deliberately, so that copies of the whole site
  do not compete with the real one in search results. Vercel sets `VERCEL_ENV`
  itself; there is nothing to configure.

Then open `https://rojgarhub.vercel.app/sitemap.xml` and check it lists real URLs.
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

The browser will refuse to let `rojgarhub.vercel.app` read responses from
`rojgarhub-api.duckdns.org` unless the API says that origin is allowed.

```bash
sudo nano /etc/rojgarhub/backend.env
```

```ini
CORS_ALLOWED_ORIGINS=https://rojgarhub.vercel.app
```

```bash
sudo systemctl restart rojgarhub-api
```

Rules the application enforces at startup, each of which is a real mistake it is
catching:

- **Exact origins only.** `*` is rejected — a wildcard would let any website on
  the internet read your API through a visitor's browser.
- **Scheme required.** `rojgarhub.vercel.app` is rejected; `https://rojgarhub.vercel.app` is right.
- **No trailing slash.** The browser sends `Origin: https://rojgarhub.vercel.app`
  without one, so a configured value ending in `/` matches nothing — and it fails
  as a confusing browser error rather than a server error.
- Multiple origins are comma-separated:
  `https://rojgarhub.vercel.app,http://localhost:3000`.

Verify from your own machine that the API returns the header:

```bash
curl -s -o /dev/null -D - \
  -H "Origin: https://rojgarhub.vercel.app" \
  https://rojgarhub-api.duckdns.org/api/jobs | grep -i access-control
# access-control-allow-origin: https://rojgarhub.vercel.app
```

No such header means the restart did not happen or the value has a typo.

**The real test** is the browser: open the live site, press F12 → Console, and
visit a job page. If you see `blocked by CORS policy`, the origin does not match.
If you see `Mixed Content: ... requested an insecure resource`, your
`NEXT_PUBLIC_API_URL` is still `http://` — go back to 4.11.

---

# Part 7 — Google Search Console

Do this only after Part 5.3 confirms `Allow: /`. Submitting a site that answers
`Disallow: /` teaches Google to ignore it and wastes weeks.

## 7.1 Add the property

<https://search.google.com/search-console> → **Add property** → **URL prefix**
(the left box, not "Domain") → `https://rojgarhub.vercel.app`.

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
usually means the sitemap 404s — confirm `https://rojgarhub.vercel.app/sitemap.xml`
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

# Part 8 — Renaming the site

`RojgarHub` is taken, so this will need doing. The name lives in fewer places than
you would expect.

## 8.1 The one that matters

`frontend/lib/site.js`:

```js
export const SITE = {
  name: 'RojgarHub',                        // <- change this
  tagline: "Every vacancy. One place.",     // <- and probably this
  ...
};
```

That single value drives the header wordmark, the footer line, every page title,
the `og:site_name` used in WhatsApp and Facebook previews, and the About, Contact,
Privacy and Disclaimer pages. Change it and 90% of the rename is done.

While you are in the file, the fallback on line 20 also names the old domain:

```js
export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL || 'https://rojgarhub.in').replace(/\/+$/, '');
```

That fallback only applies when `NEXT_PUBLIC_SITE_URL` is unset, but it should not
be a domain someone else owns.

## 8.2 The rest

| File | What to change | Matters? |
|---|---|---|
| `frontend/lib/i18n.js` lines 147–148 | `seo.default.title`, `seo.default.desc` — English | **Yes** — this is your Google result text |
| `frontend/lib/i18n.js` lines 394–395 | the same two keys in Hindi | **Yes** |
| `frontend/public/og-default.png` | the social share image has the name drawn into it | Yes, visible on every WhatsApp share |
| `frontend/public/favicon.ico`, `icon-512.png`, `apple-touch-icon.png` | the logo | Cosmetic but obvious |
| `frontend/pages/admin/import.js` line 58 | the CSV template's download filename | Cosmetic, admin-only |
| `frontend/public/robots.txt` | dead file — `/robots.txt` is generated now and a rewrite bypasses this one. Safe to delete. | Delete it, it is only confusing |
| `frontend/styles/globals.css` line 2 | a comment | No |
| `backend/.../application.properties` line 72 | `jwt.issuer=rojgarhub` | See warning below |

> **`jwt.issuer` is not cosmetic.** The issuer is written into every token and
> checked on the way back in. Change it and every existing admin session is
> rejected instantly. That is harmless — log in again — but do it deliberately,
> not in the middle of adding jobs.

After editing, run the frontend build to make sure nothing broke:

```bash
cd frontend && npm run build
```

## 8.3 When you later buy a real domain

Four things change together, and missing one breaks the site quietly:

1. **Vercel** → Settings → Domains → add `yournewname.in` and follow the DNS
   instructions at your registrar.
2. **Vercel env** → `NEXT_PUBLIC_SITE_URL=https://yournewname.in` → **redeploy**.
   Until you redeploy, every canonical tag still points at the vercel.app address
   and Google keeps indexing the old one.
3. **Server** → `CORS_ALLOWED_ORIGINS=https://yournewname.in` in
   `/etc/rojgarhub/backend.env` → `sudo systemctl restart rojgarhub-api`. Miss
   this and the site loads but the admin panel and view counter stop working.
4. **Search Console** → add the new property, verify it, submit the sitemap again.
   Optionally use the *Change of Address* tool to move the old property's history
   over.

Optional but tidy: point the API at a subdomain of your own
(`api.yournewname.in`) instead of DuckDNS, re-run `sudo certbot --nginx -d
api.yournewname.in`, and update `NEXT_PUBLIC_API_URL`.

---

# Part 9 — Name ideas

Five candidates, chosen so the name is easy to say out loud, easy to spell after
hearing it once, and close to the words the audience already uses. Availability is
your job to check — see the checklist at the end.

### 1. NaukriNama — नौकरीनामा

The strongest brand of the five. `-nama` is a familiar Hindi/Urdu suffix meaning a
record or chronicle (*roznama*, *safarnama*, *Akbarnama*), so "NaukriNama" reads
as "the register of jobs" without anyone having to be told. It sounds like a
publication rather than a database, which is the right feeling for a site people
check daily. Four syllables, one obvious spelling, works in both scripts.

### 2. PakkiNaukri — पक्की नौकरी

The highest word-of-mouth score, because it is not a coined brand at all — it is
the exact phrase this audience already says. *Pakki naukri* means the secure,
permanent government job, and that is precisely the thing every visitor is
chasing. A name that is already in someone's vocabulary is the one they repeat
without effort. The risk is the flip side: a common phrase is harder to trademark
and harder to own in search results.

### 3. BhartiKhabar — भर्ती खबर

The best pure-SEO pick. *Bharti* (recruitment) and *khabar* (news) are two of the
highest-volume Hindi query words in this category, and having them in the domain
and the title tag is a small but real advantage on exactly the searches you want.
Less distinctive as a brand than NaukriNama, more findable.

### 4. SarkariPath — सरकारी पथ

Closest in feel to *Sarkari Result*, and that similarity is the point: this
audience scans for the word "Sarkari" and trusts it. *Path* (पथ) means the way or
the route, so it reads as "the path to a government job". Be aware the "Sarkari…"
space is extremely crowded — SarkariResult, SarkariExam, SarkariNaukri, SarkariJob
all exist — so you inherit familiarity and competition in the same move.

### 5. NaukriMitra — नौकरी मित्र

The warmest of the five. *Mitra* (friend) positions the site as a helper rather
than a listing board, which fits a site that also carries syllabus, cut-off and
previous-paper content. It is the best of the five for WhatsApp and Telegram
sharing, where the message is usually "yaar, yahan dekh" — a friendly name suits
that context.

**Also worth considering:** AapkiNaukri (आपकी नौकरी), RojgarNama, Naukri24,
BhartiPoint, NaukriLive.

### Before you commit to a name

1. **Domain.** Check `.in` and `.com` at any registrar. `.in` is fine and often
   better for this audience; `.com` is worth having if it is cheap.
2. **Trademark.** Free public search at <https://ipindia.gov.in> → Trade Marks →
   Public Search. Check class 35 and class 41. This is the check that stops a
   takedown two years in.
3. **Plain Google search** for the exact name, and for the name plus "sarkari".
   If page one is already someone else's site with the same name, pick another —
   you will never outrank them for your own brand.
4. **Social handles**, all at once: YouTube, Instagram, Telegram, a WhatsApp
   channel. Grab them the same day even if you do not use them yet.
5. **The Vercel project name**, which becomes `thatname.vercel.app`.
6. **Say it on the phone.** If you have to spell it, drop it.

Two things to avoid outright:

- **Anything that implies you are the government.** Names containing *official*,
  *gov*, *NIC*, or a ministry's name invite a legal problem and cost user trust
  when the disclaimer contradicts the name. The site already carries a
  not-affiliated disclaimer; the name should not fight it.
- **Reusing a real government scheme name.** *Rojgar Setu*, for instance, is an
  actual Madhya Pradesh government scheme. Check any candidate against that too.

---

# Part 10 — When something breaks

Start here every time:

```bash
sudo systemctl status rojgarhub-api
sudo journalctl -u rojgarhub-api -n 100 --no-pager
```

The application is built to fail loudly with a readable message, so the log
usually names the problem outright.

| Symptom | Cause | Fix |
|---|---|---|
| `JWT_SECRET is not set` | variable missing from the env file, or the file is not being read | check `EnvironmentFile=` path and `chmod 600` ownership |
| `JWT_SECRET is a known placeholder value` | you copied a demo value | generate a real one: `openssl rand -base64 48` |
| `ADMIN_PASSWORD_HASH does not look like a BCrypt hash` | you set the password instead of the hash | run the HashPassword tool (1.2) |
| `CORS_ALLOWED_ORIGINS must list exact origins` | a `*` in the value | list the exact frontend origin |
| `CORS origin must not end with a slash` | trailing `/` | remove it |
| Starts, but every login says invalid credentials | the hash was mangled by quotes or a trailing space | `sudo grep ADMIN_PASSWORD_HASH /etc/rojgarhub/backend.env \| cut -d= -f2- \| wc -c` must print 61 |
| `502 Bad Gateway` from nginx | the jar is not running, or not on 8080 | `sudo systemctl status rojgarhub-api`; `curl http://127.0.0.1:8080/api/health` |
| `curl https://…/api/health` times out from outside, works on the server | a firewall layer | both 4.3 (VCN) **and** 4.4 (iptables) |
| Site loads, admin login and view counter dead | CORS or mixed content | F12 → Console; see Part 6 |
| `Flyway ... Validate failed` | the database schema does not match the code | usually an older database; check which migrations ran in the `flyway_schema_history` table |
| Vercel build: "No Next.js version detected" | Root Directory not set to `frontend` | Settings → General → Root Directory |
| Google: "Blocked by robots.txt" | the deploy is answering `Disallow: /` | Part 5.3 |
| Certificate expired warning after ~90 days | port 80 was closed after issuance, so renewal failed | reopen 80 in both firewalls, then `sudo certbot renew` |
| Everything stops after a stop/start | the public IP changed | reserve the IP (4.2), update DuckDNS |
| Backend killed at random on a 1 GB instance | out of memory | add swap (4.5), set `-Xmx384m`, `DB_POOL_SIZE=5` |
| `429 Too many login attempts` | 5 failures in 15 minutes from your IP | wait, or `sudo systemctl restart rojgarhub-api` — the counter is in memory |
| Instance vanished after a few weeks | Oracle reclaimed it as idle | this is what the uptime monitor in 4.12 prevents |

Useful one-liners:

```bash
sudo journalctl -u rojgarhub-api -f          # follow the log live
sudo journalctl -u rojgarhub-api -p err      # errors only
sudo tail -f /var/log/nginx/error.log        # nginx side
free -h && df -h                             # memory and disk
sudo systemctl restart rojgarhub-api nginx   # restart both
```

---

# Part 11 — Honest caveats

Read this part. Everything above is written to be correct, but some of it depends
on things I could not check and some of it has not been run.

**Free-tier terms were not verified.** I had no web access while writing this, so
every claim about what Oracle, Vercel, DuckDNS and UptimeRobot include for free is
from prior knowledge, not from their pricing pages today. Providers change these
terms. Confirm each one before you depend on it — especially Oracle's Always Free
compute allowance and its idle-reclamation policy.

**Vercel's Hobby plan is for non-commercial use.** If you intend to run ads on
this site — which is how sites in this category normally earn — check Vercel's
current Hobby terms before launch, because you may need their paid plan. This is
worth checking early rather than after the site has traffic. If it turns out to be
a problem, the frontend can also be served from the same Oracle VM behind the same
nginx; you lose the CDN, not the site.

**Two things in this project have never been compiled or built.** I could not run
`mvn`, `javac` or `npm run build` in the environment I was working in. Specifically,
`HealthController.java` is new — the endpoint that 4.12 points the uptime monitor
at — and the indexing rule in `frontend/pages/api/robots.js` is new. Both were
checked with the project's own test harnesses: the frontend renders all 32 pages
cleanly, and the API-route harness passes all 98 of its assertions, including a
group covering exactly the rule this launch depends on — a *production* deploy on
a `vercel.app` address stays crawlable, a branch preview does not, localhost never
does, and `NEXT_PUBLIC_ALLOW_INDEXING=false` overrides all of it. A harness is not
a compiler, though, so the first thing to do on your Windows machine is:

```bash
cd backend  && mvn clean package
cd frontend && npm run build
```

Both must succeed before you deploy anything.

**Oracle A1 capacity is a real risk.** "Out of host capacity" is common and can
persist for days. Have the `E2.1.Micro` fallback in mind (4.2) rather than
treating a capacity error as a dead end.

**Backups are entirely your responsibility.** There is no managed provider taking
snapshots. If you skip 4.13 and the instance is lost, so is every job you ever
posted.

**Rate limits are per-process and in memory.** They reset on restart, and they
would not be shared if you ever ran two copies of the backend. That is fine for
one server and worth remembering if you ever scale.

**Legal posture.** The site aggregates public government notifications and links
out to the official source on every row. Keep it that way: link out rather than
mirroring PDFs, keep the disclaimer page reachable from the footer, and do not
adopt a name or design that suggests official status. That combination is what
keeps an aggregator on the right side of the line.

