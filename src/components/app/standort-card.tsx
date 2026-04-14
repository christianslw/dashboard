import { Standort } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, FileText, Folder } from 'lucide-react';

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

  return (
    <Card
      className={`cursor-pointer transition-colors ${isActive ? 'ring-2 ring-primary' : 'hover:bg-accent'}`}
      onClick={handleClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: markerColor }}
              />
              <span className="font-mono text-sm font-bold text-muted-foreground">
                {standort.nummer}
              </span>
              {standort.distance && (
                <Badge variant="secondary" className="text-xs">
                  {standort.distance.toFixed(1)} km
                </Badge>
              )}
            </div>
            <h3 className="font-semibold text-sm truncate">{standort.name}</h3>
            {standort.lat && standort.lon && (
              <p className="text-xs text-muted-foreground mt-1">
                {standort.lat.toFixed(4)}, {standort.lon.toFixed(4)}
              </p>
            )}
          </div>

          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              title="Open in SharePoint"
              onClick={(e) => {
                e.stopPropagation();
                window.open(standort.link, '_blank');
              }}
              className="h-8 w-8 p-0"
            >
              <Folder className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
