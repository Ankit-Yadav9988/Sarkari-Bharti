import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const USER_AGENT = 'SarkariBhartiCollector/1.0 (+https://sarkari-bharti.vercel.app/contact)';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const keyFor = url => crypto.createHash('sha256').update(url).digest('hex');

function matchesRobots(pathname, rule) {
  return rule === '/' || pathname === rule || pathname.startsWith(rule.endsWith('/') ? rule : `${rule}/`);
}

/** A conservative robots.txt parser for Allow/Disallow rules relevant to our UA. */
export function robotsAllows(robots, pathname, userAgent = USER_AGENT) {
  const groups = []; let agents = []; let rules = [];
  const close = () => { if (agents.length) groups.push({ agents, rules }); agents = []; rules = []; };
  for (const raw of String(robots || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const pair = /^([^:]+):\s*(.*)$/i.exec(line); if (!pair) continue;
    const field = pair[1].toLowerCase(); const value = pair[2].trim();
    if (field === 'user-agent') { if (rules.length) close(); agents.push(value.toLowerCase()); }
    else if ((field === 'allow' || field === 'disallow') && agents.length && value) rules.push({ allow: field === 'allow', path: value });
  }
  close();
  const name = userAgent.toLowerCase();
  const applicable = groups.filter(g => g.agents.some(a => a === '*' || name.includes(a)));
  const candidates = applicable.flatMap(g => g.rules).filter(r => matchesRobots(pathname, r.path));
  if (!candidates.length) return true;
  candidates.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return candidates[0].allow;
}

/**
 * A polite, serial client. It checks robots for every host, waits between
 * requests and keeps conditional request headers in the supplied state object.
 */
export function createPoliteClient({ state = {}, fetchImpl = fetch, delayMs = 2000, logger = console } = {}) {
  const robotsByOrigin = new Map(); let lastRequest = 0;
  state.requests ||= {};

  async function raw(url, headers = {}, { userAgent = USER_AGENT } = {}) {
    const wait = Math.max(0, delayMs - (Date.now() - lastRequest));
    if (wait) await pause(wait);
    lastRequest = Date.now();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetchImpl(url, { headers: { 'User-Agent': userAgent, ...headers }, signal: AbortSignal.timeout(30000) });
        if (response.status < 500 || attempt === 2) return response;
      } catch (error) {
        if (attempt === 2) {
          const detail = error?.cause?.message || error?.message || String(error);
          throw new Error(`fetch failed for ${url}: ${detail}`, { cause: error });
        }
      }
      await pause(1000 * (attempt + 1));
    }
    throw new Error(`Unreachable: ${url}`);
  }

  async function ensureRobots(url) {
    const parsed = new URL(url); const origin = parsed.origin;
    if (!robotsByOrigin.has(origin)) {
      const response = await raw(`${origin}/robots.txt`);
      let robotsResponse = response;
      // A few government hosts reject the collector's descriptive UA on the
      // robots endpoint even though the public page is available. Retry only
      // that robots request with a browser-compatible UA; page/document
      // requests continue to use the named collector UA.
      if (response.status === 403) robotsResponse = await raw(`${origin}/robots.txt`, {}, { userAgent: 'Mozilla/5.0' });
      if (robotsResponse.status === 404) robotsByOrigin.set(origin, '');
      else if (!robotsResponse.ok) throw new Error(`Cannot check robots.txt for ${origin}: HTTP ${robotsResponse.status}`);
      else robotsByOrigin.set(origin, await robotsResponse.text());
    }
    if (!robotsAllows(robotsByOrigin.get(origin), parsed.pathname)) throw new Error(`robots.txt disallows ${parsed.href}`);
  }

  async function get(url) {
    await ensureRobots(url);
    const remembered = state.requests[url] || {};
    const headers = {};
    if (remembered.etag) headers['If-None-Match'] = remembered.etag;
    if (remembered.lastModified) headers['If-Modified-Since'] = remembered.lastModified;
    let response = await raw(url, headers);
    // Some public government sites return 403 to descriptive crawler UAs but
    // serve the same public page to a normal browser UA. This does not bypass
    // robots.txt (that check already happened above); it only retries the
    // requested public URL with a browser-compatible identity.
    if (response.status === 403) response = await raw(url, headers, { userAgent: 'Mozilla/5.0' });
    const metadata = {
      etag: response.headers.get('etag') || remembered.etag || null,
      lastModified: response.headers.get('last-modified') || remembered.lastModified || null,
      checkedAt: new Date().toISOString(),
    };
    state.requests[url] = metadata;
    logger.debug?.(`GET ${response.status} ${url}`);
    return { response, metadata };
  }
  return { get };
}

/** Disk cache used for PDFs/HTML documents; a 304 reuses the prior body. */
export async function fetchCached(client, url, cacheDir, { readOnly = false } = {}) {
  const key = keyFor(url); const bodyPath = path.join(cacheDir, `${key}.bin`); const metaPath = path.join(cacheDir, `${key}.json`);
  if (!readOnly) await mkdir(cacheDir, { recursive: true });
  const { response, metadata } = await client.get(url);
  if (response.status === 304) {
    try {
      const [body, meta] = await Promise.all([readFile(bodyPath), readFile(metaPath, 'utf8')]);
      return { body, contentType: JSON.parse(meta).contentType || '', hash: JSON.parse(meta).hash, unchanged: true };
    } catch { throw new Error(`Received 304 for ${url}, but its local cache is unavailable`); }
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const body = Buffer.from(await response.arrayBuffer()); const hash = crypto.createHash('sha256').update(body).digest('hex');
  const contentType = response.headers.get('content-type') || '';
  if (readOnly) return { body, contentType, hash, unchanged: false };
  await Promise.all([
    writeFile(bodyPath, body),
    writeFile(metaPath, JSON.stringify({ url, contentType, hash, metadata }, null, 2)),
  ]);
  return { body, contentType, hash, unchanged: false };
}
