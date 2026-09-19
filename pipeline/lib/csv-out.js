/**
 * Writing the CSV the admin importer reads.
 *
 * The header is generated from CSV_COLUMNS, never typed. That is the whole point
 * of importing the real column list: a hand-written header is correct until
 * somebody adds a column to the importer, and then it is wrong in the quietest
 * way possible -- the file still parses, the new column just silently never
 * arrives.
 *
 * Quoting has to match what `parseCsv` reads back, which is ordinary RFC 4180:
 * quote a field containing a comma, a quote or a newline, and double any quote
 * inside it. `csvTemplate()` in the app does exactly this, and the round-trip
 * test in pipeline-check.js proves the two agree rather than assuming it.
 */
import { CSV_COLUMNS, parseCsv, mapRows } from './columns.js';

/** One field, quoted only when it has to be. */
export function cell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const header = () => CSV_COLUMNS.map(c => c.key).join(',');

/**
 * A row object -> a CSV line, in column order.
 *
 * Unknown keys are a hard error, not a silent drop. A typo like `lastdate` for
 * `lastDate` would otherwise produce a file that imports cleanly with the date
 * missing, which is exactly the kind of quiet wrongness this pipeline exists to
 * avoid. Better to stop and say the name is not a column.
 */
export function rowToLine(row) {
  const known = new Set(CSV_COLUMNS.map(c => c.key));
  const unknown = Object.keys(row).filter(k => !known.has(k) && !k.startsWith('_'));
  if (unknown.length) {
    throw new Error(`Not a CSV column: ${unknown.join(', ')}. Known columns: ${[...known].join(', ')}`);
  }
  return CSV_COLUMNS.map(c => cell(row[c.key])).join(',');
}

export function toCsv(rows) {
  return [header(), ...rows.map(rowToLine)].join('\n') + '\n';
}

/**
 * Run the app's own validator over what we are about to write.
 *
 * This does NOT reject anything. A row the importer will skip is still written
 * to the file on purpose -- it appears in the admin screen under "skipped", with
 * its notification link, which is precisely how a half-extracted notification
 * gets in front of a human instead of being thrown away silently.
 *
 * What it is for is the report: telling you, before you open the file, which
 * rows need you and why. The reasons come from `mapRows`, so they are worded
 * identically to what the import screen will show.
 */
export function previewValidation(csvText) {
  // parseCsv -> array of arrays (row 0 is the header).
  // mapRows  -> { headerErrors, rows: [{ line, payload, errors }] }
  // Shapes confirmed against frontend/lib/csv.js, not assumed.
  const { headerErrors, rows } = mapRows(parseCsv(csvText));
  const invalid = rows.filter(r => r.errors.length > 0);
  return {
    total: rows.length,
    valid: rows.length - invalid.length,
    invalid: invalid.length,
    headerErrors,
    problems: invalid.map(r => ({
      line: r.line,
      postName: r.payload.postName || '(no post name)',
      errors: r.errors,
    })),
  };
}
