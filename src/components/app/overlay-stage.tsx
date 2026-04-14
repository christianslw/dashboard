import { OverlayFeatureDraft } from "@/hooks/useOverlayCommandCenter";
import { Standort } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OverlayMapAdapter } from "@/components/app/overlay-map-adapter";

interface OverlayStageProps {
  standort: Standort | null;
  features: OverlayFeatureDraft[];
  featureCount: number;
  selectedFeature: OverlayFeatureDraft | null;
  selectedFeatureId: string | null;
  onSelectFeature: (featureId: string | null) => void;
}

function getFeatureTypeLabel(feature: OverlayFeatureDraft | null): string {
  if (!feature) return "No feature selected";
  if (feature.properties.routeType) return `Route: ${feature.properties.routeType}`;
  if (feature.properties.strokeStyle) return `Path: ${feature.properties.strokeStyle}`;
  if (feature.properties.iconType) return `Marker: ${feature.properties.iconType}`;
  if (feature.properties.zoneType) return `Zone: ${feature.properties.zoneType}`;
  return feature.properties.overlayType ?? "Feature";
}

export function OverlayStage({
  standort,
  features,
  featureCount,
  selectedFeature,
  selectedFeatureId,
  onSelectFeature,
}: OverlayStageProps) {
  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Map Stage</CardTitle>
            <CardDescription>
              Command Center canvas for overlay authoring
            </CardDescription>
          </div>
          <Badge variant="secondary">{featureCount} features</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <OverlayMapAdapter
            standort={standort}
            features={features}
            selectedFeatureId={selectedFeatureId}
            onSelectFeature={onSelectFeature}
          />

          <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-border/80 bg-background/90 px-3 py-2 backdrop-blur">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">Active Standort</p>
            <p className="text-sm font-semibold">{standort?.nummer ?? "None selected"}</p>
            <p className="text-xs text-muted-foreground">{standort?.name ?? "Pick a standort from the list"}</p>
          </div>

          <div className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-lg border border-border/80 bg-background/85 px-3 py-2 backdrop-blur">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Selection</p>
            <p className="text-sm font-medium">{getFeatureTypeLabel(selectedFeature)}</p>
            <p className="text-xs text-muted-foreground">Overlay preview is live. Drawing/edit handles will be attached in the next adapter slice.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
