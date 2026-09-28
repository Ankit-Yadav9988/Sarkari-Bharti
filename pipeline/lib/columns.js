/**
 * The CSV contract, imported from the app rather than restated here.
 *
 * Everything this pipeline writes has to be readable by
 * `frontend/lib/csv.js` → `parseCsv` → `mapRows`, which is the code the admin
 * import screen runs and which has 151 assertions and 54 differential cases
 * behind it. The surest way to stay compatible with it is to not have a second
 * opinion about what the columns are.
 *
 * So: one import, no duplication. If someone adds a column to CSV_COLUMNS, the
 * pipeline's header gains it on the next run with no code change here.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

register('./extensionless-hook.mjs', import.meta.url);

/* There was a `process.emitWarning` monkey-patch here that filtered
   MODULE_TYPELESS_PACKAGE_JSON, on the reasoning that frontend/package.json has
   no "type" field so Node has to sniff csv.js and reparse it as ESM.

   The warning is real -- `node -e "import('../../frontend/lib/csv.js')"` prints
   it -- but it never appeared on *this* path, because the resolve hook
   registered above loads csv.js and the warning is not emitted through it.
   Removing the patch changed no output at all, on Node 22 or with the
   `--disable-warning` flag, which is what a dead workaround looks like.

   No flag replaces it, for the same reason: there is no warning here to
   disable. If one ever does appear -- CI runs Node 24, and this was only
   confirmed on 22 -- the fix is
   `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` in the npm script, not a
   patch on process.emitWarning, which also hides the warning from every
   unrelated module loaded afterwards. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND_LIB = path.resolve(HERE, '../../frontend/lib');

const csv = await import(pathToFileURL(path.join(FRONTEND_LIB, 'csv.js')).href);
const api = await import(pathToFileURL(path.join(FRONTEND_LIB, 'api.js')).href);

export const CSV_COLUMNS = csv.CSV_COLUMNS;
export const NOTICE_CSV_COLUMNS = csv.NOTICE_CSV_COLUMNS;
/** Re-exported so the pipeline can validate its own output before writing it. */
export const parseCsv = csv.parseCsv;
export const mapRows = csv.mapRows;
export const mapNoticeRows = csv.mapNoticeRows;
/**
 * What counts as the same posting, imported for the same reason the columns are.
 *
 * There are already two implementations of this rule -- this one and
 * DuplicateKeys.java, which the server needs because it cannot run JavaScript.
 * A third copy here, in the code that decides what goes into the CSV, would mean
 * the pipeline could disagree with the importer about whether a row is a
 * duplicate, and the admin would be the one to discover it.
 */
export const jobLooseKey = csv.jobLooseKey;
export const jobStrictKey = csv.jobStrictKey;
/**
 * The notice duplicate rule, imported for exactly the same reason.
 *
 * `mapNoticeRows` uses this to reject a second copy of a result inside one
 * file. The collector uses it to decide whether a result it just found is
 * already published. Two definitions of "same notice" would let the collector
 * write a row the importer then silently drops -- or write one it happily
 * imports on top of a result already on the site.
 */
export const noticeKey = csv.noticeKey;
export const { CATEGORIES, SECTIONS, STATES, NOTICE_TYPES } = api;

// A load-bearing sanity check. If the import silently produced an empty or
// unrecognisable column list, every CSV this pipeline writes would have a header
// the importer does not understand -- and it would look like a data problem, not
// a wiring problem. Fail here instead, where the cause is obvious.
if (!Array.isArray(CSV_COLUMNS) || CSV_COLUMNS.length < 10) {
  throw new Error(
    `CSV_COLUMNS did not load from frontend/lib/csv.js (got ${JSON.stringify(CSV_COLUMNS)}). ` +
    'The pipeline will not write a CSV against a column list it cannot read.'
  );
}
for (const key of ['postName', 'organization', 'applicationStartDate', 'lastDate']) {
  if (!CSV_COLUMNS.some(c => c.key === key)) {
    throw new Error(`CSV_COLUMNS is missing the expected column "${key}" -- refusing to write output.`);
  }
}

// Same idea for the duplicate rule. If these came back undefined -- renamed in
// csv.js, say -- every duplicate check in run.js would throw "not a function" on
// the first candidate, which reads like a pipeline bug rather than a missing
// export. Fail at load with the actual cause.
for (const [name, fn] of [['jobLooseKey', jobLooseKey], ['jobStrictKey', jobStrictKey], ['noticeKey', noticeKey], ['mapNoticeRows', mapNoticeRows]]) {
  if (typeof fn !== 'function') {
    throw new Error(`${name} did not load from frontend/lib/csv.js -- the pipeline cannot detect duplicates without it.`);
  }
}

// The notice collector writes against this list the same way run.js writes
// against CSV_COLUMNS. An empty or renamed list would produce a header the
// notice importer does not understand, which looks like bad data rather than a
// bad import.
if (!Array.isArray(NOTICE_CSV_COLUMNS) || !['type', 'title', 'link'].every(key => NOTICE_CSV_COLUMNS.some(c => c.key === key))) {
  throw new Error(
    `NOTICE_CSV_COLUMNS did not load from frontend/lib/csv.js, or lost one of type/title/link (got ${JSON.stringify(NOTICE_CSV_COLUMNS)}). `
    + 'The notice collector will not write a CSV against a column list it cannot read.'
  );
}
