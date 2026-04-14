import { SearchBar } from './search-bar';
import { FilterMenu } from './filter-menu';
import { SortMenu } from './sort-menu';

interface ListControlsProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  areaCodeOptions: string[];
  getAreaFilterState: (code: string) => 'include' | 'exclude' | 'neutral';
  onAreaFilterToggle: (code: string) => void;
  activeFilterCount: number;
  sortKey: 'distance' | 'name' | 'number';
  onSortChange: (key: 'distance' | 'name' | 'number') => void;
}

export function ListControls({
  searchQuery,
  onSearchChange,
  areaCodeOptions,
  getAreaFilterState,
  onAreaFilterToggle,
  activeFilterCount,
  sortKey,
  onSortChange,
}: ListControlsProps) {
  return (
    <div className="space-y-3">
      <SearchBar
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Search by name or number..."
      />
      <div className="flex gap-2">
        <FilterMenu
          areaCodeOptions={areaCodeOptions}
          getFilterState={getAreaFilterState}
          onToggle={onAreaFilterToggle}
          activeFilterCount={activeFilterCount}
        />
        <SortMenu currentSort={sortKey} onSort={onSortChange} />
      </div>
    </div>
  );
}
