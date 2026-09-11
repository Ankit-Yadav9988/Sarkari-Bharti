// Generates /sitemap.xml dynamically so new jobs are included automatically.
// Submit this URL to Google Search Console after deploying.

import { landingPaths } from '../../lib/landings';
import { setFeedCache } from '../../lib/cache';
import { LOCALES, DEFAULT_LOCALE, localeUrl, hreflangFor } from '../../lib/site';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

const STATIC_PAGES = [
  { path: '/',              priority: '1.0', changefreq: 'daily'   },
  { path: '/latest-jobs',   priority: '0.9', changefreq: 'daily'   },
  { path: '/upcoming-jobs', priority: '0.9', changefreq: 'daily'   },
  { path: '/jobs',          priority: '0.8', changefreq: 'daily'   },
  { path: '/admit-card',    priority: '0.8', changefreq: 'daily'   },
  { path: '/result',        priority: '0.8', changefreq: 'daily'   },
  { path: '/answer-key',    priority: '0.8', changefreq: 'daily'   },
  { path: '/syllabus',      priority: '0.7', changefreq: 'weekly'  },
  // Evergreen, and priced accordingly. A cut-off or a question paper keeps
  // answering the same query for years, where a closed notification stops
  // earning the day it closes — so these sit level with the daily listings even
  // though they change far less often. changefreq reflects how often the *page*
  // gains rows, not how valuable it is.
  { path: '/cut-off',       priority: '0.8', changefreq: 'weekly'  },
  { path: '/exam-calendar', priority: '0.8', changefreq: 'daily'   },
  { path: '/previous-year-papers', priority: '0.8', changefreq: 'weekly' },
  { path: '/admission',     priority: '0.7', changefreq: 'daily'   },
  { path: '/about',         priority: '0.3', changefreq: 'monthly' },
  { path: '/contact',       priority: '0.3', changefreq: 'monthly' },
  { path: '/privacy',       priority: '0.2', changefreq: 'yearly'  },
  { path: '/disclaimer',    priority: '0.2', changefreq: 'yearly'  },
];

/**
 * A slug arriving from the backend could in principle contain an ampersand, and
 * a single unescaped "&" makes the whole sitemap malformed XML — at which point
 * Search Console rejects the file and every URL in it goes unsubmitted, not just
 * the bad one. Cheap insurance against one bad row costing the whole crawl.
 */
function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * The hreflang block shared by every language version of one path.
 *
 * Google requires each version to list *all* versions including itself, and the
 * annotations to be reciprocal; an incomplete set is discarded silently, which
 * from the outside is indistinguishable from a working one. Emitting the same
 * block into each <url> is what guarantees reciprocity by construction rather
 * than by care.
 */
function alternates(path) {
  return [
    ...LOCALES.map(loc =>
      `    <xhtml:link rel="alternate" hreflang="${hreflangFor(loc)}" href="${xmlEscape(localeUrl(path, loc))}"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(localeUrl(path, DEFAULT_LOCALE))}"/>`,
  ].join('\n');
}

/**
 * One <url> per language version of a path, each carrying the full alternate set.
 *
 * Job detail pages get both languages too, even though the posting text itself
 * comes from the source notification and is not translated. That is deliberate:
 * the page furniture around it — the date table, the fee table, the link block,
 * the breadcrumb — is translated, and the on-page hreflang tags already declare
 * both versions on every page. A sitemap that listed only English for job pages
 * would contradict the page's own annotation, and a contradiction is worse than
 * either answer on its own.
 */
function urlEntries(path, priority, changefreq, lastmod) {
  const alts = alternates(path);
  return LOCALES.map(loc => `  <url>
    <loc>${xmlEscape(localeUrl(path, loc))}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${alts}
  </url>`).join('\n');
}

// The jobs endpoint is paged, so the sitemap has to walk it. 100 is the
// server's ceiling per request; 20 pages is where this stops. Past 2,000 job
// URLs the right answer is a sitemap index with several child files, not a
// longer loop here.
const JOBS_PER_REQUEST = 100;
const MAX_JOB_PAGES = 20;

async function getPage(page) {
  try {
    const r = await fetch(`${API_URL}/jobs?page=${page}&size=${JOBS_PER_REQUEST}`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;    // the sitemap is still valid without the job URLs
  }
}

// Tolerates both the paged envelope and a bare array, for the same reason
// lib/api.js does: a frontend deploy can precede the backend one.
function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.content)) return payload.content;
  return [];
}

async function fetchAllJobs() {
  const first = await getPage(0);
  if (!first) return [];

  const jobs = rowsOf(first);
  const totalPages = Array.isArray(first) ? 1 : Math.max(1, first.totalPages || 1);
  const lastPage = Math.min(totalPages, MAX_JOB_PAGES);
  if (lastPage <= 1) return jobs;

  // Sequential requests would make a 20-page sitemap 20 round trips deep. The
  // response is cached for an hour, so the burst happens once, not per crawl.
  const rest = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, i) => getPage(i + 1))
  );
  return jobs.concat(...rest.map(rowsOf));
}

export default async function handler(req, res) {
  const today = new Date().toISOString().split('T')[0];
  const jobs = await fetchAllJobs();

  const staticUrls = STATIC_PAGES.map(p => urlEntries(p.path, p.priority, p.changefreq, today));

  // The category and state landings. High priority relative to the job pages
  // because they are the URLs that rank for the searches people actually make
  // ("ssc jobs 2026", "up police vacancy") and they stay at the same address
  // permanently, while an individual posting is only relevant for a few weeks.
  const landingUrls = landingPaths().map(path => urlEntries(path, '0.8', 'daily', today));

  // lastmod is when the posting itself last changed, which is what a crawler
  // uses to decide whether to refetch. updatedAt is maintained by the backend
  // on every edit, so it is the honest answer; the dates below are fallbacks
  // for rows written before that column existed.
  //
  // The slug, not the id: /jobs/5 now answers with a 301 to the slug, and a
  // sitemap full of redirects wastes the crawl budget it exists to direct.
  const jobUrls = jobs.map(j => {
    const lastmod = (j.updatedAt || j.createdAt || '').split('T')[0]
      || j.applicationStartDate
      || today;
    return urlEntries(`/jobs/${j.slug || j.id}`, '0.7', 'weekly', lastmod);
  });

  // The xhtml namespace is what makes <xhtml:link> legal here. Without the
  // declaration the file is not well-formed XML and the whole sitemap is
  // rejected, so it belongs on the root element rather than anywhere else.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[...staticUrls, ...landingUrls, ...jobUrls].join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  setFeedCache(res, 3600);
  res.status(200).send(xml);
}
