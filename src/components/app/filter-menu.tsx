import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown } from 'lucide-react';

interface FilterMenuProps {
  areaCodeOptions: string[];
  getFilterState: (code: string) => 'include' | 'exclude' | 'neutral';
  onToggle: (code: string) => void;
  activeFilterCount: number;
}

export function FilterMenu({
  areaCodeOptions,
  getFilterState,
  onToggle,
  activeFilterCount,
}: FilterMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
      >
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <Badge variant="secondary" className="ml-2 h-5 w-5 flex items-center justify-center p-0">
            {activeFilterCount}
          </Badge>
        )}
        <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-card border border-border rounded-lg shadow-lg p-3 z-50 min-w-[200px] max-h-[300px] overflow-y-auto">
          <div className="space-y-2">
            {areaCodeOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No areas available</p>
            ) : (
              areaCodeOptions.map((code) => {
                const state = getFilterState(code);
                return (
                  <button
                    key={code}
                    onClick={() => onToggle(code)}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                      state === 'include'
                        ? 'bg-primary text-primary-foreground'
                        : state === 'exclude'
                          ? 'bg-destructive/20 text-destructive'
                          : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    <span className="font-medium">Area {code}</span>
                    {state !== 'neutral' && (
                      <span className="ml-2 text-xs opacity-75">
                        ({state === 'include' ? 'include' : 'exclude'})
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
