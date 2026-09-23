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
