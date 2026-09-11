# Turning on email alerts

The site collects subscribers from day one. Sending to them is off until you do
this, and the admin console says so rather than failing at send time. Nothing is
lost by setting this up later — the list keeps growing in the meantime.

This takes about fifteen minutes. You need a Brevo account and access to your
Render dashboard.

- [Why Brevo](#why-brevo)
- [Step 1 — Create the account](#step-1--create-the-account)
- [Step 2 — Verify a sender address](#step-2--verify-a-sender-address)
- [Step 3 — Get the SMTP key](#step-3--get-the-smtp-key)
- [Step 4 — Put the values on Render](#step-4--put-the-values-on-render)
- [Step 5 — Check it worked](#step-5--check-it-worked)
- [Step 6 — Send the first real alert](#step-6--send-the-first-real-alert)
- [Every mail variable](#every-mail-variable)
- [When it does not work](#when-it-does-not-work)
- [Honest caveats](#honest-caveats)

---

## Why Brevo

The backend speaks plain SMTP, not a provider's SDK. Any SMTP host works —
Brevo, Mailgun, Postmark, Amazon SES, even a Gmail app password. Switching
provider is a change to four environment variables, not a code change or a
redeploy of new code.

Brevo is the default because its free tier sends **300 emails a day, forever**,
with no credit card and no trial clock. For a subscriber list in the hundreds
that is a daily alert to everyone. Gmail's SMTP is capped far lower and will
start refusing you for bulk sending; SES is cheaper at volume but wants a card
and puts new accounts in a sandbox that can only mail verified addresses.

If your list grows past 300, the send stops partway and the console reports the
failures. That is the point to either pay Brevo or move the four variables to
another host.

---

## Step 1 — Create the account

1. Go to <https://www.brevo.com> and sign up. A free plan is offered on signup;
   you do not need to enter a card.
2. Confirm the email they send you.
3. Brevo asks what you plan to use it for. Answer honestly — "transactional and
   newsletter email for a job-listings website" is exactly right. Accounts that
   look like they were opened to blast a purchased list get held for review.

Brevo may ask a few questions about your company before unlocking SMTP. A
personal project is a legitimate answer; put the site URL in the website field.

---

## Step 2 — Verify a sender address

Providers refuse to send `From:` an address you have not proved you control.
This is the single most common reason a first send fails, so do it before
anything else.

1. In Brevo, open **Senders, Domains & Dedicated IPs** → **Senders**.
2. Click **Add a sender**. Give the name you want recipients to see (for example
   `Sarkari Bharti`) and an address you can actually open — a Gmail address is
   fine to start with.
3. Brevo emails that address a confirmation link. Click it.
4. The sender should now show a green tick.

Whatever address ends up with that tick is your `MAIL_FROM_ADDRESS`. The backend
refuses to start if this is blank or still says `@example.com`, because a bad
`From` is otherwise not discovered until an admin has clicked send, watched the
progress bar, and been told every single address failed with no clue why.

> **Later, when you own a domain.** Verifying a whole domain rather than one
> address lets you send as `alerts@yourdomain.in` and materially improves
> deliverability, because you can then add the SPF and DKIM records Brevo gives
> you. Gmail and Outlook treat a domain with SPF and DKIM very differently from a
> free-mail `From`. Until then, expect some of your mail to land in Promotions.

---

## Step 3 — Get the SMTP key

1. Open the account menu (top right) → **SMTP & API**, then the **SMTP** tab.
2. The page shows a **Login** and a **Server** / **Port**. The login is usually
   the email you signed up with, and it is **not** always the same as the sender
   address from step 2 — copy the one shown here.
3. Click **Generate a new SMTP key**. Name it something you will recognise later,
   such as `sarkari-bharti-render`.
4. Copy the key **now**. Brevo shows it once. If you lose it, generate another
   and delete the old one — there is no way to read it back.

This key is a password. It is not your Brevo account password, and you should
never put it in the repository, in a screenshot, or in a chat message. If it
leaks, delete that key in Brevo and generate a new one; nothing else needs to
change.

---

## Step 4 — Put the values on Render

Open your backend service on Render → **Environment** → **Add Environment
Variable**, and add these six. Use *your* values — the ones below are shaped like
real values but are deliberately invalid, so pasting them verbatim fails loudly
at startup instead of silently sending nothing.

| Key | Value |
| --- | --- |
| `MAIL_ENABLED` | `true` |
| `MAIL_HOST` | `smtp-relay.brevo.com` |
| `MAIL_PORT` | `587` |
| `MAIL_USERNAME` | the **Login** from step 3, e.g. `EXAMPLE-8a2f1c@smtp-brevo.com` |
| `MAIL_PASSWORD` | the **SMTP key** from step 3, e.g. `xsmtpsib-EXAMPLE-do-not-use` |
| `MAIL_FROM_ADDRESS` | the address you ticked green in step 2 |

Two more are optional:

| Key | Value | Why |
| --- | --- | --- |
| `MAIL_FROM_NAME` | `Sarkari Bharti` | The name in the inbox. Defaults to this already. |
| `MAIL_REPLY_TO` | an address you read | Without it, replies go to the `From` address. |

Click **Save Changes**. Render redeploys automatically — mail settings are read
at startup, so a redeploy is required for any change here to take effect.

> **Check `SITE_PUBLIC_URL` while you are here.** Every email carries a one-click
> unsubscribe link, and that link is built from `SITE_PUBLIC_URL`. If it is not
> set the backend falls back to the first entry in `CORS_ALLOWED_ORIGINS`, which
> is normally correct. If both are wrong, the link points at `localhost:3000` and
> nobody can unsubscribe — which is both rude and, for bulk email, the fastest
> route to a spam folder. It should be `https://sarkari-bharti.vercel.app`.

---

## Step 5 — Check it worked

Watch the Render log as it restarts. Two outcomes:

**It started.** Open `/admin/send-alert` on the live site. The amber "Email is
not set up on the server yet" panel is gone and the compose form is there
instead. Mail is on.

**It refused to start.** That is the design — a bad `From` address stops the
deploy rather than wasting a send. The log names the problem:

```
MAIL_FROM_ADDRESS is not set but MAIL_ENABLED is true.
MAIL_FROM_ADDRESS is not a valid email address: <what you typed>
MAIL_FROM_ADDRESS is still the example value.
```

Fix the variable, save, and it redeploys.

Now send yourself a real one before you send to anybody else:

1. Subscribe with your own address on the live site, via the footer form.
2. Go to `/admin/send-alert`, pick one job, write a subject, and send.
3. Check your inbox — **and your spam folder**, which is where a brand-new
   sender's first messages often land.
4. Click the unsubscribe link in the footer. It should take you to a page on your
   own site that confirms it. Then re-subscribe.

That last step matters more than it looks. It is the one part of the flow that
touches the public site, the token, and the backend together.

---

## Step 6 — Send the first real alert

Once your own test arrived, the console is safe to use for real. Three things
worth knowing before you press send on a live list:

- **There is no recall.** The send starts immediately and cannot be stopped from
  the UI.
- **It sends one message per subscriber**, roughly five a second, so a list of
  300 takes about a minute. The progress bar is live.
- **A redeploy mid-send loses the send.** Progress is held in memory. If Render
  restarts the service while a broadcast is running — a deploy, or the free
  instance spinning down — the remainder is never sent and the record in the
  database keeps a blank finish time. Start big sends when you are not about to
  deploy.

---

## Every mail variable

Defaults are what the app uses when the variable is absent. Only the first six in
step 4 need setting.

| Variable | Default | What it does |
| --- | --- | --- |
| `MAIL_ENABLED` | `false` | The master switch. With it off, no mail code loads at all and the alert endpoint answers "not set up" instead of erroring. |
| `MAIL_HOST` | `smtp-relay.brevo.com` | SMTP server. Change this to move provider. |
| `MAIL_PORT` | `587` | STARTTLS port. Leave it unless your provider says otherwise. |
| `MAIL_USERNAME` | *(blank)* | SMTP login. |
| `MAIL_PASSWORD` | *(blank)* | SMTP key. Never the account password. |
| `MAIL_FROM_ADDRESS` | *(blank)* | Verified sender. Required, and validated at startup. |
| `MAIL_FROM_NAME` | `Sarkari Bharti` | Display name in the inbox. |
| `MAIL_REPLY_TO` | *(blank)* | Where replies go. Falls back to the `From`. |
| `MAIL_MAX_RECIPIENTS` | `2000` | Refuses an absurdly large send rather than discovering the problem 400 messages in. Raise it if the list genuinely grows. |
| `MAIL_SEND_DELAY_MS` | `200` | Pause between messages. Providers throttle bursts, and a throttled burst looks to the admin like a total failure. |
| `SITE_PUBLIC_URL` | first CORS origin | Base URL for the unsubscribe link. |

Connection and read timeouts are fixed in `application.properties` at 10s and
15s, so a provider that stops responding mid-handshake cannot hang the sending
thread forever.

---

## When it does not work

**The console still shows "Email is not set up".**
`MAIL_ENABLED` is not exactly `true`, or the service has not finished
redeploying. It is read at startup only.

**Every message fails with `535` or "Authentication failed".**
Wrong `MAIL_USERNAME` or `MAIL_PASSWORD`. The most common cause is using the
Brevo account password instead of the generated SMTP key, or using the sender
address as the login when Brevo shows a different one.

**Every message fails and the error mentions the sender.**
The `From` is not verified. Back to step 2 — the tick has to be green on the
exact address in `MAIL_FROM_ADDRESS`.

**Sends stop partway with a quota message.**
The free tier's 300 a day is spent. It resets on Brevo's clock, not yours. Only
the remaining recipients missed out; the ones already sent are not resent if you
run it again, so re-sending will mail the earlier ones twice.

**Mail arrives in spam.**
Expected for a new free-mail sender. It improves with a verified domain plus SPF
and DKIM (step 2's note), with a recognisable `From` name, and with not sending
to people who never asked. Every message already carries the `List-Unsubscribe`
header that Gmail and Outlook use to show a native unsubscribe button, which is
the other thing bulk filters look for.

**Nothing arrives and nothing failed.**
Check the Brevo dashboard's own logs — **Transactional** → **Logs**. If Brevo
accepted the message, the problem is after Brevo; if it never saw it, the
problem is the four connection variables.

---

## Honest caveats

- **Sends are not restart-safe.** Covered in step 6. Fixing it properly means a
  persisted job queue, which is a larger change than a manual alert button
  justifies.
- **No open or click tracking.** The console reports what the provider accepted,
  which is not the same as what was read.
- **Subscriber addresses are never written to the logs.** Error messages from the
  provider are scrubbed before being logged or stored, so a failure tells you the
  domain and the reason but not who. That is deliberate; if you need to know
  which address bounced, Brevo's own logs have it.
- **One list, no segmentation.** Every alert goes to every confirmed subscriber.
  There is no per-category subscription.
