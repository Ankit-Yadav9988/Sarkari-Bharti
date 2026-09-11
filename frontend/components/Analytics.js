import Script from 'next/script';
import { ANALYTICS, IS_PRODUCTION_SITE } from '../lib/site';

// GA4, loaded only when there is a measurement ID and only on the real site.
//
// Three deliberate choices:
//
//  1. strategy="afterInteractive" — the tag loads after the page is usable.
//     Analytics must never sit on the critical path of a site whose audience
//     is largely on a slow mobile connection; a visitor who leaves before the
//     page paints is a visitor GA never gets to count anyway.
//
//  2. Nothing renders unless NEXT_PUBLIC_GA_ID is set AND the build is a
//     production build pointing at a non-localhost origin. `next dev` and
//     preview deploys therefore send no hits, which keeps the property's
//     numbers honest — dev traffic in a small site's analytics is not noise,
//     it is most of the graph.
//
//  3. anonymize_ip. Not legally required for an Indian audience, but this site
//     collects nothing else about visitors and there is no reason to start.
//
// There is deliberately no routeChangeComplete listener here. GA4's enhanced
// measurement counts "page changes based on browser history events" by default,
// so client-side navigations are already recorded; adding a manual page_view on
// top would double-count every click through a listing. If you ever switch
// enhanced measurement off in the GA UI, that listener becomes necessary — but
// not before.
export default function Analytics() {
  const id = ANALYTICS.gaMeasurementId;
  if (!id || !IS_PRODUCTION_SITE) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}', { anonymize_ip: true });`}
      </Script>
    </>
  );
}
