import { Standort } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Navigation, Folder } from 'lucide-react';

interface StandortCardProps {
  standort: Standort;
  onClick?: (standort: Standort) => void;
  isActive?: boolean;
}

export function StandortCard({ standort, onClick, isActive }: StandortCardProps) {
  const handleClick = () => onClick?.(standort);

  // Marker color by area code prefix (matches legacy behavior)
  const prefix = Math.floor(Number(standort.nummer) / 1000);
  const markerColors: Record<number, string> = {
    1: '#8b5cf6', // purple
    2: '#10b981', // emerald
    3: '#f59e0b', // amber
    4: '#ef4444', // red
    5: '#ec4899', // pink
    6: '#06b6d4', // cyan
    8: '#6366f1', // indigo
    9: '#eab308', // yellow
  };
  const markerColor = markerColors[prefix] || '#3b82f6';

  const fallbackDistance = standort.distance ?? 0;
  const fallbackMinutes = Math.max(4, Math.round((fallbackDistance || 28) * 1.2));
  const hours = Math.floor(fallbackMinutes / 60);
  const minutes = fallbackMinutes % 60;
  const etaLabel = hours > 0 ? `~${hours}h ${minutes}m` : `~${minutes}m`;

  return (
    <article
      className={`group border-b border-border/70 px-3 py-3 transition-colors ${isActive ? 'bg-primary/10' : 'bg-background/80 hover:bg-muted/45'}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ring-2 ring-background"
          style={{ backgroundColor: markerColor }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[24px] leading-none font-semibold text-foreground">{standort.nummer}</p>
            <p className="truncate text-[21px] leading-none text-muted-foreground">{standort.name}</p>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium">{fallbackDistance.toFixed(1)} km</span>
            <span>{etaLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            title="Navigate"
            onClick={(event) => {
              event.stopPropagation();
              if (standort.lat && standort.lon) {
                window.open(`https://maps.google.com/?q=${standort.lat},${standort.lon}`, '_blank');
              }
            }}
            className="h-7 w-7 p-0"
          >
            <Navigation className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            title="Open SharePoint"
            onClick={(event) => {
              event.stopPropagation();
              window.open(standort.link, '_blank');
            }}
            className="h-7 w-7 p-0"
          >
            <Folder className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}
