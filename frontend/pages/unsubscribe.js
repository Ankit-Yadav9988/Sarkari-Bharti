import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import { API_URL, API_TIMEOUT, apiRequest } from '../lib/api';
import { useLang } from '../lib/i18n';

/**
 * Where the "unsubscribe" link in every job-alert email lands.
 *
 * The token in the query string is the whole credential -- there is no account
 * to log into -- which drives three decisions below: the response is never
 * cached, the page is never indexed, and no Referer carrying the token is sent
 * anywhere (this site loads Google Analytics on every page, and a Referer is
 * how a token in a URL quietly ends up in somebody else's logs).
 */
export async function getServerSideProps({ query, req, res }) {
  // A shared cache holding a copy of this page is a shared cache holding
  // somebody's unsubscribe token. Vercel will cache an SSR response at the
  // edge unless told otherwise.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  // Arrays (?token=a&token=b) fall through to '' and get the "incomplete link"
  // message, rather than being coerced into a comma-joined string that would
  // fail the lookup for no visible reason.
  const token = typeof query.token === 'string' ? query.token.trim() : '';

  // RFC 8058 one-click. Every alert carries List-Unsubscribe-Post, so Gmail and
  // Apple Mail POST straight to this URL and never load the page at all. If
  // POST only rendered HTML they would report "unsubscribed" to the reader
  // while the address stayed on the list -- the worst possible outcome, because
  // the next alert then looks like the site ignoring an opt-out. Doing the work
  // here is what makes that header honest.
  let alreadyDone = false;
  if (req.method === 'POST' && token) {
    try {
      const apiRes = await fetch(`${API_URL}/subscribers/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        ...apiRequest(API_TIMEOUT.primary),
      });
      alreadyDone = apiRes.ok;
    } catch {
      alreadyDone = false; // falls back to the button; the reader can retry
    }
  }

  return { props: { token, alreadyDone } };
}

export default function Unsubscribe({ token, alreadyDone }) {
  const { t } = useLang();
  // idle | sending | done | error
  const [state, setState] = useState(alreadyDone ? 'done' : 'idle');

  async function handleUnsubscribe() {
    if (state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch(`${API_URL}/subscribers/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      // The endpoint answers 200 for an unknown or already-used token on
      // purpose, so "ok" here genuinely means "you are not on the list",
      // which is the only thing the reader cares about.
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <div>
      <SeoHead title={t('unsub.title')} description={t('unsub.confirm')} canonical="/unsubscribe" noIndex />
      <Head>
        {/* Stops the token travelling in the Referer to the analytics script,
            or to anything else this page ever ends up loading. */}
        <meta name="referrer" content="no-referrer" />
      </Head>
      <Header />

      <div className="container" style={{ paddingTop: 24, paddingBottom: 40, maxWidth: 560 }}>
        <div className="panel">
          {/* h1, not a div. This page is noindex, so nothing here is about
              ranking — it is that a page with no heading at all gives a screen
              reader nothing to jump to, and this is the page someone lands on
              from an email when they are already mildly annoyed. The panel-head
              class carries its own size and weight, so it looks unchanged. */}
          <h1 className="panel-head" style={{ background: 'var(--maroon)' }}>
            {t('unsub.title')}
          </h1>
          <div style={{ padding: 16, textAlign: 'center' }}>
            {!token && (
              <p className="small muted" style={{ margin: 0 }}>{t('unsub.noToken')}</p>
            )}

            {token && state === 'done' && (
              <>
                <p style={{ marginTop: 0, marginBottom: 8, fontWeight: 700, color: '#14713d' }}>
                  ✅ {t('unsub.done')}
                </p>
                <p className="small muted" style={{ margin: 0 }}>{t('unsub.doneNote')}</p>
              </>
            )}

            {token && state !== 'done' && (
              <>
                <p className="small muted" style={{ marginTop: 0, marginBottom: 14 }}>
                  {t('unsub.confirm')}
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleUnsubscribe}
                  disabled={state === 'sending'}
                >
                  {state === 'sending' ? t('unsub.working') : t('unsub.button')}
                </button>
                {state === 'error' && (
                  <p className="small" style={{ color: '#a11019', marginBottom: 0, marginTop: 10 }}>
                    {t('unsub.error')} <span style={{ fontWeight: 700 }}>{t('unsub.retry')}</span>
                  </p>
                )}
              </>
            )}

            <p className="small" style={{ marginBottom: 0, marginTop: 16 }}>
              <Link href="/">{t('unsub.home')}</Link>
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
