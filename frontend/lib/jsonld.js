// Shared JSON-LD builders.
//
// These live here rather than inline in each page for the same reason the row
// markup lives in components/rows.js: structured data that is copied per page
// drifts, and drifted structured data is the worst kind of bug to own because
// nothing on the page looks wrong. The only way to notice is to paste a URL into
// a testing tool, which nobody does for the eleventh listing page.
//
// Everything here is built from fields the row actually has. No placeholder
// values, no invented ratings, no salary — the Job entity has no pay column, and
// a JobPosting with a made-up baseSalary is worse than one with none.

import { SITE, SITE_URL, localeUrl } from './site';

/** The language tag for a locale, in the form schema.org expects. */
const inLanguage = lang => (lang === 'hi' ? 'hi-IN' : 'en-IN');

/**
 * Site-level identity: who publishes this and what the site is.
 *
 * Emitted on the homepage only. These two nodes describe the property rather
 * than the page, so repeating them on every URL adds bytes and no information —
 * Google reads them once from the site's most-linked page.
 *
 * Returned as an @graph with internal @ids so the two nodes are explicitly the
 * same publisher, instead of two unrelated blocks that happen to share a name.
 */
export function siteJsonLd(lang = 'en') {
  const home = localeUrl('/', lang);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE.name,
        url: SITE_URL,
        description: SITE.tagline,
        // A real square image that ships in public/. Google's logo guidance
        // wants something it can crop; the 1200x630 OG banner is the wrong
        // shape for it and would be rejected or letterboxed.
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/icon-512.png`,
          width: 512,
          height: 512,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE.name,
        url: home,
        inLanguage: inLanguage(lang),
        publisher: { '@id': `${SITE_URL}/#organization` },
        // The sitelinks search box. This is a claim that a specific URL template
        // runs a real search, so it is written from the same route the homepage
        // form submits to — /jobs?q= — and not from a guess. If that route ever
        // changes, this has to change with it, or the site is advertising a
        // search endpoint that 404s.
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${localeUrl('/jobs', lang)}?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
}

/**
 * A listing page: what this collection is, and the first rows in it.
 *
 * `items` is only worth passing when each row has a page **on this site**. The
 * job listings qualify, because every posting has its own URL. The notice,
 * syllabus, cut-off and question-paper listings do not — those rows link
 * straight out to the department's PDF, and a ListItem whose url points at
 * another domain describes someone else's document, not an entry in this
 * collection. Those pages therefore get the CollectionPage node with no
 * mainEntity, which is the honest shape.
 */
export function collectionPageJsonLd({ name, description, path, lang = 'en', total = 0, items = [] }) {
  const url = localeUrl(path, lang);
  const listed = items.slice(0, 10);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    ...(description && { description }),
    inLanguage: inLanguage(lang),
    url,
    isPartOf: { '@id': `${SITE_URL}/#website` },
    ...(listed.length > 0 && {
      mainEntity: {
        '@type': 'ItemList',
        // The count of the whole result set, not of the ten below it: a page
        // that says numberOfItems: 10 while paginating through 400 is
        // understating itself.
        //
        // Floored at the number actually listed, because the two arrive from
        // different places — `total` is the count the API reported, `items` is
        // the array this render was handed — and a block claiming five items
        // while enumerating six is self-contradictory in a way a validator will
        // pick up. Math.max means the count can never be the smaller of the two,
        // whatever the caller passes.
        numberOfItems: Math.max(Number(total) || 0, listed.length),
        itemListElement: listed.map((it, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: it.name,
          url: localeUrl(it.path, lang),
        })),
      },
    }),
  };
}

/** Serialises for dangerouslySetInnerHTML. One place, so the escaping is uniform. */
export function ldScript(data) {
  // `<` cannot appear raw inside a script element: a value containing "</script"
  // would end the block early and drop the rest of the page's markup into the
  // document as text. JSON.stringify does not escape it, so it is done here.
  // None of the current fields can contain it, but structured data is built from
  // database text and the next field added might.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
