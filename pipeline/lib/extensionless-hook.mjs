/**
 * An ESM resolve hook that lets Node import the frontend's own modules.
 *
 * `frontend/lib/csv.js` contains `import { CATEGORIES } from './api'` — no file
 * extension. Webpack and Next resolve that; plain Node does not, and throws
 * ERR_MODULE_NOT_FOUND.
 *
 * The alternative was to copy CSV_COLUMNS into the pipeline. That copy would be
 * correct on the day it was written and wrong the first time a column was added
 * to the importer — and wrong in the quietest possible way, since a CSV with a
 * stale header still parses, it just silently drops the new field. Twenty lines
 * of resolver is a much smaller price than a second definition of the truth.
 *
 * Only relative specifiers are touched, and only by appending `.js` when the
 * literal path does not exist. Nothing else in resolution changes.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
        const withExt = `${specifier}.js`;
        const resolved = await nextResolve(withExt, context);
        // Only accept the rewrite if the file is really there, so a genuine
        // typo still fails as a typo rather than as something stranger.
        if (existsSync(fileURLToPath(resolved.url))) return resolved;
      }
      throw err;
    }
  }
  return nextResolve(specifier, context);
}

// The app deliberately leaves its package as CommonJS-compatible for Next's
// configuration files. These browser-library modules are nevertheless ESM.
// Declaring their format here avoids Node's one-off "typeless package" sniffing
// warning without changing the frontend package semantics.
export async function load(url, context, nextLoad) {
  if (/\/frontend\/lib\/[^/]+\.js$/i.test(url.replace(/\\/g, '/'))) {
    return nextLoad(url, { ...context, format: 'module' });
  }
  return nextLoad(url, context);
}
