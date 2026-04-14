import { Button } from '@/components/ui/button';
import { ArrowDownUp } from 'lucide-react';

interface SortMenuProps {
  currentSort: 'distance' | 'name' | 'number';
  onSort: (key: 'distance' | 'name' | 'number') => void;
}

const SORT_OPTIONS = [
  { key: 'name' as const, label: 'Name A-Z' },
  { key: 'distance' as const, label: 'Distance' },
  { key: 'number' as const, label: 'Number' },
];

export function SortMenu({ currentSort, onSort }: SortMenuProps) {
  return (
    <div className="flex items-center gap-1 bg-card rounded-lg border border-border p-1">
      <span className="text-xs font-medium text-muted-foreground px-2">Sort:</span>
      {SORT_OPTIONS.map((option) => (
        <Button
          key={option.key}
          variant={currentSort === option.key ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onSort(option.key)}
          className="text-xs"
        >
          {currentSort === option.key && (
            <ArrowDownUp className="h-3 w-3 mr-1" />
          )}
          {option.label}
        </Button>
      ))}
    </div>
  );
}
