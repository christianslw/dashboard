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
      <div className="flex h-64 items-center justify-center rounded-xl border border-border/70 bg-card/80">
        <div className="text-muted-foreground">Loading standorte...</div>
      </div>
    );
  }

  if (standorte.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border/70 bg-card/80">
        <div className="text-muted-foreground">No standorte found</div>
      </div>
    );
  }

  return (
    <div className="h-[620px] overflow-y-auto rounded-xl border border-border/70 bg-card/70">
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
