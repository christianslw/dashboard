import { Standort } from '@/lib/api';
import { StandortCard } from './standort-card';

interface StandortListProps {
  standorte: Standort[];
  onSelect?: (standort: Standort) => void;
  activeStandort?: Standort | null;
  isLoading?: boolean;
}

export function StandortList({
  standorte,
  onSelect,
  activeStandort,
  isLoading,
}: StandortListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading standorte...</div>
      </div>
    );
  }

  if (standorte.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">No standorte found</div>
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-300px)]">
      {standorte.map((standort) => (
        <StandortCard
          key={String(standort.nummer)}
          standort={standort}
          onClick={onSelect}
          isActive={activeStandort?.nummer === standort.nummer}
        />
      ))}
    </div>
  );
}
