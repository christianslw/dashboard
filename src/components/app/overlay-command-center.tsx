import {
  AlertTriangle,
  Brush,
  Eraser,
  Layers,
  Loader2,
  MapPinned,
  Palette,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";

import { OverlayCategory, UseOverlayCommandCenterResult } from "@/hooks/useOverlayCommandCenter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface OverlayCommandCenterProps {
  standortLabel: string;
  standortNummer?: string | number;
  overlay: UseOverlayCommandCenterResult;
}

const CATEGORIES: Array<{ key: OverlayCategory; label: string; icon: typeof MapPinned }> = [
  { key: "route", label: "Route", icon: MapPinned },
  { key: "path", label: "Path", icon: Brush },
  { key: "marker", label: "Marker", icon: Sparkles },
  { key: "zone", label: "Zone", icon: Layers },
  { key: "color", label: "Color", icon: Palette },
];

function formatTimestamp(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export function OverlayCommandCenter({ standortLabel, standortNummer, overlay }: OverlayCommandCenterProps) {
  const {
    features,
    selectedFeature,
    selectedFeatureId,
    loading,
    saving,
    dirty,
    remoteChanged,
    error,
    activeCategory,
    activeTool,
    activeColor,
    availableTools,
    palette,
    canUndo,
    canRedo,
    lastUpdatedAt,
    lastUpdatedBy,
    setActiveCategory,
    setActiveTool,
    setActiveColor,
    applyColorToSelected,
    addDemoFeature,
    selectFeature,
    removeSelectedFeature,
    clearAllFeatures,
    undo,
    redo,
    reload,
    save,
    removeAllRemote,
  } = overlay;

  const isDisabled = !standortNummer;

  return (
    <Card className="border-border/70 bg-card/95 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Overlay Command Center</CardTitle>
            <CardDescription>
              {standortNummer ? `Editing ${standortNummer} - ${standortLabel}` : "Select a standort to begin"}
            </CardDescription>
          </div>
          <Badge variant={dirty ? "default" : "secondary"}>{dirty ? "Unsaved" : "Synced"}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {remoteChanged && (
          <div className="rounded-lg border border-amber-300/40 bg-amber-100/40 px-3 py-2 text-xs text-amber-900 dark:border-amber-600/40 dark:bg-amber-900/30 dark:text-amber-200">
            A remote overlay update was detected while you have local edits. Reload before saving if you need the newest baseline.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-5 gap-2">
          {CATEGORIES.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant={activeCategory === key ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(key)}
              disabled={isDisabled}
              className="justify-center"
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="sr-only">{label}</span>
            </Button>
          ))}
        </div>

        {activeCategory !== "color" && (
          <div className="rounded-xl border border-border/70 bg-muted/35 p-2">
            <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Tools</p>
            <div className="flex flex-wrap gap-2">
              {availableTools[activeCategory].map((tool) => (
                <Button
                  key={tool}
                  size="sm"
                  variant={activeTool === tool ? "default" : "secondary"}
                  onClick={() => setActiveTool(tool)}
                  disabled={isDisabled}
                  className="h-7 px-2 text-[11px]"
                >
                  {tool}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border/70 bg-muted/35 p-2">
          <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Palette</p>
          <div className="grid grid-cols-6 gap-2">
            {palette.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Use color ${color}`}
                disabled={isDisabled}
                onClick={() => setActiveColor(color)}
                className={`h-7 w-full rounded-md border ${activeColor === color ? "border-foreground" : "border-border/70"}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={applyColorToSelected} disabled={isDisabled || !selectedFeatureId}>
              <Palette className="h-3.5 w-3.5" />
              Color selected
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => addDemoFeature(activeCategory === "color" ? "route" : activeCategory)}
            disabled={isDisabled}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Add draft feature
          </Button>
          <Button variant="outline" size="sm" onClick={removeSelectedFeature} disabled={isDisabled || !selectedFeatureId}>
            <Eraser className="h-3.5 w-3.5" />
            Remove selected
          </Button>
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/35 p-2">
          <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Layers</p>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading overlay features
            </div>
          ) : features.length === 0 ? (
            <p className="text-xs text-muted-foreground">No overlay features yet.</p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {features.map((feature, index) => (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => selectFeature(feature.id)}
                  className={`w-full rounded-md border px-2 py-1.5 text-left text-xs ${
                    selectedFeatureId === feature.id ? "border-primary bg-primary/10" : "border-border/70 bg-background/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">#{index + 1} {feature.properties.label ?? feature.properties.overlayType ?? "Feature"}</span>
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: feature.properties.color ?? "#64748b" }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/35 p-2">
          <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Properties</p>
          {selectedFeature ? (
            <div className="space-y-1 text-xs">
              <p><span className="text-muted-foreground">Type:</span> {selectedFeature.properties.overlayType ?? "n/a"}</p>
              <p><span className="text-muted-foreground">Tool:</span> {selectedFeature.properties.routeType ?? selectedFeature.properties.strokeStyle ?? selectedFeature.properties.iconType ?? selectedFeature.properties.zoneType ?? "n/a"}</p>
              <p><span className="text-muted-foreground">Color:</span> {selectedFeature.properties.color ?? "default"}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Select a layer entry to inspect properties.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={undo} disabled={!canUndo || isDisabled}>
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </Button>
          <Button size="sm" variant="outline" onClick={redo} disabled={!canRedo || isDisabled}>
            <RotateCcw className="h-3.5 w-3.5" />
            Redo
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void reload()} disabled={isDisabled}>
            <Loader2 className="h-3.5 w-3.5" />
            Reload
          </Button>
          <Button size="sm" variant="default" onClick={() => void save()} disabled={isDisabled || saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={clearAllFeatures} disabled={isDisabled || features.length === 0}>
            <Trash2 className="h-3.5 w-3.5" />
            Clear local
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void removeAllRemote()} disabled={isDisabled}>
            <AlertTriangle className="h-3.5 w-3.5" />
            Reset remote
          </Button>
        </div>

        <div className="rounded-lg border border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
          <p><span className="font-medium text-foreground">Updated:</span> {formatTimestamp(lastUpdatedAt)}</p>
          <p><span className="font-medium text-foreground">By:</span> {lastUpdatedBy ?? "n/a"}</p>
        </div>
      </CardContent>
    </Card>
  );
}
