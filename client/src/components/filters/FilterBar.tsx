import { Input, Select } from '../ui';
import { IconSearch } from '../ui/icons';

export type FilterSelect = {
  /** Used as the React key and the accessible name of the select. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Hide the select entirely — e.g. a leader picker with only one leader to pick. */
  hidden?: boolean;
};

/**
 * The filter bar every list page uses: one search box plus a row of selects.
 * Pages describe their filters as data; the look and layout live here only.
 */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search by name…',
  selects,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  selects: FilterSelect[];
}) {
  const shown = selects.filter((s) => !s.hidden);
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 rounded-card border border-hairline bg-surface p-3 shadow-card sm:grid-cols-2 lg:grid-cols-4">
      <div className="relative sm:col-span-2 lg:col-span-1">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="pl-9"
        />
      </div>

      {shown.map((s) => (
        <Select key={s.label} value={s.value} onChange={(e) => s.onChange(e.target.value)} aria-label={s.label}>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
    </div>
  );
}
