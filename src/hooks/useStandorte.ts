import { useState, useEffect, useCallback, useMemo } from 'react';
import { Standort, fetchAllStandorte } from '@/lib/api';

export interface FilterState {
  includedAreaCodes: Set<string>;
  excludedAreaCodes: Set<string>;
  searchQuery: string;
  favoriteFilter: 'all' | 'only' | 'exclude';
}

export interface SortOption {
  key: 'distance' | 'name' | 'number';
  label: string;
}

const SORT_OPTIONS: SortOption[] = [
  { key: 'distance', label: 'Distance' },
  { key: 'name', label: 'Name' },
  { key: 'number', label: 'Number' },
];

function getStandortAreaCode(nummer: string | number): string {
  const parsed = parseInt(String(nummer), 10);
  if (Number.isNaN(parsed)) return '0';
  return String(Math.floor(parsed / 1000) * 1000);
}

function normalizeSearchQuery(str: string): string {
  return String(str)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function loadFilterStateFromStorage(): FilterState {
  try {
    const saved = localStorage.getItem('stationFilterState');
    if (!saved) {
      return {
        includedAreaCodes: new Set(),
        excludedAreaCodes: new Set(),
        searchQuery: '',
        favoriteFilter: 'all',
      };
    }

    const parsed = JSON.parse(saved);
    return {
      includedAreaCodes: new Set(
        Array.isArray(parsed.includedAreaCodes) ? parsed.includedAreaCodes : []
      ),
      excludedAreaCodes: new Set(
        Array.isArray(parsed.excludedAreaCodes) ? parsed.excludedAreaCodes : []
      ),
      searchQuery: parsed.searchQuery || '',
      favoriteFilter: ['all', 'only', 'exclude'].includes(parsed.favoriteFilterMode)
        ? parsed.favoriteFilterMode
        : 'all',
    };
  } catch {
    return {
      includedAreaCodes: new Set(),
      excludedAreaCodes: new Set(),
      searchQuery: '',
      favoriteFilter: 'all',
    };
  }
}

function saveFilterStateToStorage(state: FilterState): void {
  const payload = {
    includedAreaCodes: Array.from(state.includedAreaCodes),
    excludedAreaCodes: Array.from(state.excludedAreaCodes),
    searchQuery: state.searchQuery,
    favoriteFilterMode: state.favoriteFilter,
  };
  localStorage.setItem('stationFilterState', JSON.stringify(payload));
}

export function useStandorte() {
  const [standorte, setStandorte] = useState<Standort[]>([]);
  const [filters, setFilters] = useState<FilterState>(loadFilterStateFromStorage);
  const [sortKey, setSortKey] = useState<'distance' | 'name' | 'number'>(
    (localStorage.getItem('standortSortKey') as any) || 'name'
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch standorte on mount
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchAllStandorte(controller.signal)
      .then((data) => {
        setStandorte(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to fetch standorte');
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  // Filter and sort standorte
  const filtered = useMemo(() => {
    let result = standorte;

    // Apply search filter
    if (filters.searchQuery.trim()) {
      const normalized = normalizeSearchQuery(filters.searchQuery);
      result = result.filter((s) => {
        const nameNorm = normalizeSearchQuery(s.name);
        const numberNorm = String(s.nummer);
        return nameNorm.includes(normalized) || numberNorm.includes(normalized);
      });
    }

    // Apply area code filters
    if (filters.includedAreaCodes.size > 0 || filters.excludedAreaCodes.size > 0) {
      result = result.filter((s) => {
        const areaCode = getStandortAreaCode(s.nummer);
        if (filters.includedAreaCodes.size > 0) {
          return filters.includedAreaCodes.has(areaCode);
        }
        if (filters.excludedAreaCodes.size > 0) {
          return !filters.excludedAreaCodes.has(areaCode);
        }
        return true;
      });
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      if (sortKey === 'name') {
        return String(a.name).localeCompare(String(b.name));
      } else if (sortKey === 'number') {
        return Number(a.nummer) - Number(b.nummer);
      } else if (sortKey === 'distance') {
        const distA = a.distance ?? Infinity;
        const distB = b.distance ?? Infinity;
        return distA - distB;
      }
      return 0;
    });

    return sorted;
  }, [standorte, filters, sortKey]);

  // Get unique area codes
  const areaCodeOptions = useMemo(() => {
    const codes = new Set(standorte.map((s) => getStandortAreaCode(s.nummer)));
    const filtered = [...codes].filter((code) => code !== '0' && code !== '0000');
    return filtered.sort((a, b) => Number(a) - Number(b));
  }, [standorte]);

  // Update search query
  const setSearchQuery = useCallback((query: string) => {
    setFilters((prev) => {
      const updated = { ...prev, searchQuery: query };
      saveFilterStateToStorage(updated);
      return updated;
    });
  }, []);

  // Toggle area code filter
  const toggleAreaCodeFilter = useCallback((areaCode: string) => {
    setFilters((prev) => {
      const updated = { ...prev };

      if (updated.includedAreaCodes.has(areaCode)) {
        updated.includedAreaCodes.delete(areaCode);
        updated.excludedAreaCodes.add(areaCode);
      } else if (updated.excludedAreaCodes.has(areaCode)) {
        updated.excludedAreaCodes.delete(areaCode);
      } else {
        updated.includedAreaCodes.add(areaCode);
      }

      saveFilterStateToStorage(updated);
      return updated;
    });
  }, []);

  // Get filter state for a specific area code
  const getAreaCodeFilterState = useCallback(
    (areaCode: string): 'include' | 'exclude' | 'neutral' => {
      if (filters.includedAreaCodes.has(areaCode)) return 'include';
      if (filters.excludedAreaCodes.has(areaCode)) return 'exclude';
      return 'neutral';
    },
    [filters]
  );

  const updateSortKey = useCallback((key: 'distance' | 'name' | 'number') => {
    setSortKey(key);
    localStorage.setItem('standortSortKey', key);
  }, []);

  return {
    standorte: filtered,
    allStandorte: standorte,
    loading,
    error,
    filters,
    sortKey,
    setSortKey: updateSortKey,
    setSearchQuery,
    toggleAreaCodeFilter,
    getAreaCodeFilterState,
    areaCodeOptions,
  };
}
