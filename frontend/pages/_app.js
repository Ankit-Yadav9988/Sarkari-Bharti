import Head from 'next/head';
import { LangProvider } from '../lib/i18n';
import Analytics from '../components/Analytics';
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
            time-to-content than the query itself. */}
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
      </Head>
      <Component {...pageProps} />
      <Analytics />
    </LangProvider>
  );
}
