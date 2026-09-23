import Head from 'next/head';
import { LangProvider } from '../lib/i18n';
import Analytics from '../components/Analytics';
import RouteProgress from '../components/RouteProgress';
import { API_ORIGIN } from '../lib/api';
import { SITE, ANALYTICS } from '../lib/site';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <LangProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${SITE.name} — ${SITE.tagline}`}</title>

        {/* Icons. Browsers request /favicon.ico regardless, but declaring it
            plus the Android/iOS sizes means a saved home-screen shortcut gets
            the real mark instead of a screenshot. */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#6d0f1a" />

        {/* Search Console / Bing site ownership.
            These live in _app rather than on one page because the verifier
            fetches whichever URL it likes, and a tag on the homepage only is a
            verification that breaks the moment someone submits a subpath. Both
            render nothing until the env var is set, so an unverified deploy
            emits no empty meta tag. */}
        {ANALYTICS.searchConsoleToken && (
          <meta name="google-site-verification" content={ANALYTICS.searchConsoleToken} />
        )}
        {ANALYTICS.bingToken && (
          <meta name="msvalidate.01" content={ANALYTICS.bingToken} />
        )}

        {/* Warm up the connection to the API before the first fetch. On a slow
            mobile network the DNS + TLS handshake is a bigger share of
            time-to-content than the query itself.

            This comment used to sit alone above the googletagmanager hint,
            promising an API warm-up that was never here. crossOrigin is what
            makes the hint usable: the browser keeps separate connection pools
            for plain and CORS requests, and every call this page makes to the
            API is a cross-origin fetch, so a preconnect without it opens a
            socket that is then not reused. */}
        {API_ORIGIN && <link rel="preconnect" href={API_ORIGIN} crossOrigin="anonymous" />}
        {API_ORIGIN && <link rel="dns-prefetch" href={API_ORIGIN} />}

        {/* Analytics is loaded lazily and is nobody's critical path, so it gets
            the cheap hint rather than a held-open connection. */}
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
      </Head>
      {/* Before <Component>, so the bar is mounted and painted independently of
          whatever the incoming page renders. */}
      <RouteProgress />
      <Component {...pageProps} />
      <Analytics />
    </LangProvider>
  );
}
