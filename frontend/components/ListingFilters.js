import { CATEGORIES } from '../lib/api';
import { categoryName } from '../lib/landings';
import { useLang } from '../lib/i18n';

/**
 * The category-chip + year-select filter bar shared by the cut-off, calendar and
 * papers pages.
 *
 * Extracted because those three filter on the same two axes and got the same bar
 * three times. The important part is not the markup, it is that every filter here
 * is a URL change: /cut-off?category=SSC&examYear=2025 is shareable, bookmarkable
 * and — since the list is filtered server-side — the paging underneath it stays
 * honest. A useState filter would have looked identical and broken all three.
 *
 * `years` comes from the server (the years with rows), so the dropdown never
 * offers a year that returns nothing.
 */
export default function ListingFilters({ category, years = [], examYear, onChange, children }) {
  const { t, lang } = useLang();

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="filter-bar">
        <div className="chip-row">
          <button
            className={!category ? 'chip chip-active' : 'chip'}
            onClick={() => onChange({ category: null })}
          >
            {t('chip.all')}
          </button>
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              className={category === c.value ? 'chip chip-active' : 'chip'}
              onClick={() => onChange({ category: c.value })}
            >
              {categoryName(c.value, lang)}
            </button>
          ))}
        </div>

        {years.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{t('page.filterByYear')}</span>
            <select
              className="input"
              value={examYear || ''}
              onChange={e => onChange({ examYear: e.target.value || null })}
            >
              <option value="">{t('page.allYears')}</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        )}

        {children}
      </div>
    </div>
  );
}
