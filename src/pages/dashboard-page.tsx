import { useState } from "react";
import { Layers3, MapPinned, Compass, ChevronRight } from "lucide-react";

import { AppFrame } from "@/components/app/app-frame";
import { ListControls } from "@/components/app/list-controls";
import { OverlayCommandCenter } from "@/components/app/overlay-command-center";
import { OverlayStage } from "@/components/app/overlay-stage";
import { StandortList } from "@/components/app/standort-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOverlayCommandCenter } from "@/hooks/useOverlayCommandCenter";
import { useStandorte } from "@/hooks/useStandorte";
import { Standort } from "@/lib/api";

const featureCards = [
  {
    icon: MapPinned,
    title: "Dashboard shell",
    description: "Shared layout, theming, and responsive navigation are now centralized in React instead of duplicated across HTML entry points.",
  },
  {
    icon: Layers3,
    title: "Theme engine",
    description: "Brand themes and appearance preferences are stored under the existing localStorage keys so the migration stays compatible with current user settings.",
  },
  {
    icon: Compass,
    title: "Search & filters",
    description: "Full-featured list with real-time search, area code filtering, sorting by name, distance, or number—all persisted to localStorage.",
  },
];

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
  const overlay = useOverlayCommandCenter(selectedStandort?.nummer);

  const activeFilterCount = filters.includedAreaCodes.size + filters.excludedAreaCodes.size;

  return (
    <AppFrame
      current="dashboard"
      eyebrow="Slice 3: Overlay Command Center"
      title="Map-first overlays are back with a fresh editing surface."
      summary="The new right-rail Command Center introduces a clearer overlay workflow with typed API persistence, local undo/redo, color-driven layer management, and a dedicated map stage prepared for the Leaflet adapter."
    >
      <section className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Standorte</CardTitle>
            <CardDescription>
              {standorte.length} result{standorte.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

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

            <div className="grid gap-6 xl:grid-cols-[340px_1fr_360px]">
              <StandortList
                standorte={standorte}
                onSelect={setSelectedStandort}
                activeStandort={selectedStandort}
                isLoading={loading}
              />

              <OverlayStage
                standort={selectedStandort}
                features={overlay.features}
                featureCount={overlay.features.length}
                selectedFeature={overlay.selectedFeature}
                selectedFeatureId={overlay.selectedFeatureId}
                onSelectFeature={overlay.selectFeature}
              />

              <OverlayCommandCenter
                standortLabel={selectedStandort?.name ?? "No standort selected"}
                standortNummer={selectedStandort?.nummer}
                overlay={overlay}
              />
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {selectedStandort ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{selectedStandort.name}</CardTitle>
                <CardDescription className="font-mono text-sm">{selectedStandort.nummer}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedStandort.lat && selectedStandort.lon && (
                  <>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Coordinates</p>
                      <p className="text-sm font-mono">
                        {selectedStandort.lat.toFixed(4)}, {selectedStandort.lon.toFixed(4)}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Location</p>
                      <a
                        href={`https://maps.google.com/?q=${selectedStandort.lat},${selectedStandort.lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        Open in Google Maps
                        <ChevronRight className="h-3 w-3" />
                      </a>
                    </div>
                  </>
                )}
                {selectedStandort.link && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">SharePoint</p>
                    <a
                      href={selectedStandort.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 break-all text-sm text-primary hover:underline"
                    >
                      Open folder
                      <ChevronRight className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                <p className="text-sm">Select a standort to open Command Center editing</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Overlay UX upgrades</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {featureCards.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-lg border border-border/70 px-3 py-2">
                  <div className="mb-1 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="font-medium">{title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </section>
    </AppFrame>
  );
}