# Reticle setup — commands to run on your own PC

I could not run these myself. Two reasons, both real:

1. My sandbox has no internet. Every `npm` lookup returns `403 Forbidden` — I
   tested `@reticlehq/server`, `react`, `next` and `lodash`, and all four failed
   the same way. So `npx` cannot download anything here.
2. Even if it could, it would be the wrong machine. Reticle watches a **running**
   app through a real browser, and it registers itself with the coding-agent
   client that reads your MCP server list. Your dev server, your browser and your
   agent all run on Windows. Installing it inside my Linux sandbox would wire up
   a machine that has none of those.

So the four commands have to be run by you, on Windows. Below is exactly what to
type.

---

## Step 1 — open a terminal in the frontend folder

This matters. Reticle hooks into the web app's build, so it has to be installed
where `package.json` and `next.config.js` live — **not** in the repo root, and
not in `backend`. "init ran in the wrong directory" is the usual reason no
session ever shows up.

```
cd D:\sarkari-portal\frontend
```

## Step 2 — the four commands, in this order

```
npx @reticlehq/server init
npx @reticlehq/server login --project default
npx @reticlehq/server verify http://localhost:3000
npx @reticlehq/server push
```

Notes on each:

- **init** — say yes to whatever it offers to add. It edits `next.config.js`
  and/or `package.json`.
- **login** — this opens a browser and links the folder to your Reticle Cloud
  workspace. It writes `.reticle/cloud.json` and keeps the key **outside** the
  repo, so nothing secret gets committed. You do not need to set any environment
  variable on your own PC. `RETICLE_CLOUD_KEY` is only for CI.
- **verify** — use `http://localhost:3000`, not the Vercel URL. The instrumented
  build only exists when you run the app yourself; the deployed site does not
  have the plugin in its bundle, so verifying against it would report nothing.
- **push** — must be **last**. Until this runs, nothing appears on the
  dashboard. Read the number it prints. If it says nothing was sent, then nothing
  arrived, whatever the earlier steps said.

## Step 3 — restart the dev server (do not skip)

After `init`, the running dev server is still using the config it read at
startup. The plugin is not in that bundle. Stop it and start it again:

```
cd D:\sarkari-portal\frontend
npm run dev
```

Then open `http://localhost:3000` in a browser and leave the tab open. Loading
the app is what creates a session.

## Step 4 — restart your coding agent

An agent client reads its list of MCP servers once, when it starts. No slash
command re-reads it. So after `init`, close the agent completely and open it
again — that is the only way the `reticle_*` tools appear.

This is a one-time thing per machine. Reticle registers globally, so later
projects will already have the tools.

## Step 5 — tell me it is done

Then I can pick this up: check `reticle_sessions` shows a session, read
`reticle_memory` before deciding how anything is meant to behave, and drive one
real journey with `reticle_act_and_wait`.

---

## Backend note

If you want the site to actually work while Reticle is watching it, the Spring
backend needs to be running too, or every page will render its "could not load"
state and there will be nothing meaningful to verify:

```
cd D:\sarkari-portal\backend
mvn spring-boot:run
```

And `frontend\.env.local` needs `NEXT_PUBLIC_API_URL=http://localhost:8080/api`.

## What to add to .gitignore

`init` may or may not do this for you. Check that the repo root `.gitignore`
contains:

```
.reticle/
```

The folder holds your cloud link. It should not be committed.

---

## What I want Reticle for

Three things I could not prove from here, and which are the reason you asked:

1. **Real load times.** I can prove the code is correct. I cannot measure how
   long your live pages take, because I cannot reach them.
2. **The cold start.** My best guess is that most of the delay you feel is the
   Render free tier waking up. Reticle watching the real network would show
   that as a first request taking tens of seconds and the rest being fast — or
   would show it is something else, which is just as useful to know.
3. **The NEW badge on real data.** I verified the rule against 540 generated
   combinations. That is not the same as looking at your actual database.
