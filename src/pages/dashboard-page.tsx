import { useState } from "react";
import { Crosshair, Filter, SlidersHorizontal, Sparkles, X } from "lucide-react";

import { AppFrame } from "@/components/app/app-frame";
import { ListControls } from "@/components/app/list-controls";
import { OverlayCommandCenter } from "@/components/app/overlay-command-center";
import { OverlayStage } from "@/components/app/overlay-stage";
import { StandortList } from "@/components/app/standort-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOverlayCommandCenter } from "@/hooks/useOverlayCommandCenter";
import { useStandorte } from "@/hooks/useStandorte";
import { Standort } from "@/lib/api";

export function DashboardPage() {
  const {
    standorte,
    loading,
    error,
    filters,
    sortKey,
    setSortKey,
    setSearchQuery,
    toggleAreaCodeFilter,
    getAreaCodeFilterState,
    areaCodeOptions,
  } = useStandorte();

  const [selectedStandort, setSelectedStandort] = useState<Standort | null>(null);
  const [commandCenterOpen, setCommandCenterOpen] = useState(true);
  const overlay = useOverlayCommandCenter(selectedStandort?.nummer);

  const activeFilterCount = filters.includedAreaCodes.size + filters.excludedAreaCodes.size;

  return (
    <AppFrame
      current="dashboard"
      eyebrow="Dashboard Workspace"
      title="Legacy rhythm, modern command center."
      summary="Dense list browsing, map-first navigation, and a focused overlay editor rail. This layout restores the operational flow from the old dashboard while keeping a cleaner interaction model."
    >
      <section className="space-y-3">
        <div className="rounded-xl border border-border/70 bg-card/80 p-3">
          <div className="mb-3 grid gap-2 lg:grid-cols-[1fr_auto_auto]">
            <ListControls
              searchQuery={filters.searchQuery}
              onSearchChange={setSearchQuery}
              areaCodeOptions={areaCodeOptions}
              getAreaFilterState={getAreaCodeFilterState}
              onAreaFilterToggle={toggleAreaCodeFilter}
              activeFilterCount={activeFilterCount}
              sortKey={sortKey}
              onSortChange={setSortKey}
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10"
              onClick={() => setCommandCenterOpen((prev) => !prev)}
            >
              {commandCenterOpen ? <X className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {commandCenterOpen ? "Hide Editor" : "Open Editor"}
            </Button>

            <div className="flex h-10 items-center justify-end gap-2 rounded-md border border-border/70 bg-background/70 px-3 text-xs text-muted-foreground">
              <Crosshair className="h-3.5 w-3.5" />
              {selectedStandort ? `${selectedStandort.nummer} ${selectedStandort.name}` : "No standort selected"}
            </div>
          </div>

          {error && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{standorte.length} Standorte</Badge>
              <span>Start: {selectedStandort ? String(selectedStandort.nummer) : "not selected"}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><Filter className="h-3.5 w-3.5" />{activeFilterCount} active filters</span>
              <span className="flex items-center gap-1"><SlidersHorizontal className="h-3.5 w-3.5" />Sort: {sortKey}</span>
            </div>
          </div>

          <div className={`grid gap-3 ${commandCenterOpen ? "xl:grid-cols-[420px_1fr_370px]" : "xl:grid-cols-[420px_1fr]"}`}>
            <div>
              <StandortList
                standorte={standorte}
                onSelect={setSelectedStandort}
                activeStandort={selectedStandort}
                isLoading={loading}
              />
            </div>

            <div>
              <OverlayStage
                standort={selectedStandort}
                standorte={standorte}
                features={overlay.features}
                featureCount={overlay.features.length}
                selectedFeature={overlay.selectedFeature}
                selectedFeatureId={overlay.selectedFeatureId}
                onSelectFeature={overlay.selectFeature}
                onSelectStandort={setSelectedStandort}
              />
            </div>

            {commandCenterOpen && (
              <OverlayCommandCenter
                standortLabel={selectedStandort?.name ?? "No standort selected"}
                standortNummer={selectedStandort?.nummer}
                overlay={overlay}
              />
            )}
          </div>
        </div>
      </section>
    </AppFrame>
  );
}