import { useState } from "react";
import { Layers3, MapPinned, Compass, ChevronRight } from "lucide-react";

import { AppFrame } from "@/components/app/app-frame";
import { ListControls } from "@/components/app/list-controls";
import { StandortList } from "@/components/app/standort-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const activeFilterCount = filters.includedAreaCodes.size + filters.excludedAreaCodes.size;

  return (
    <AppFrame
      current="dashboard"
      eyebrow="Slice 2: Search & List"
      title="Standorte are now searchable and filterable in React."
      summary="This slice adds the core data flow: fetch all standorte, search by name/number, filter by area code, sort by distance/name/number, and preserve all preferences to localStorage."
    >
      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main list area */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Standorte</CardTitle>
              <CardDescription>
                {standorte.length} result{standorte.length !== 1 ? 's' : ''} found
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

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

              <StandortList
                standorte={standorte}
                onSelect={setSelectedStandort}
                activeStandort={selectedStandort}
                isLoading={loading}
              />
            </CardContent>
          </Card>
        </div>

        {/* Details sidebar */}
        <div className="space-y-4">
          {selectedStandort ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{selectedStandort.name}</CardTitle>
                <CardDescription className="font-mono text-sm">
                  {selectedStandort.nummer}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedStandort.lat && selectedStandort.lon && (
                  <>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Coordinates
                      </p>
                      <p className="text-sm font-mono">
                        {selectedStandort.lat.toFixed(4)}, {selectedStandort.lon.toFixed(4)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Location
                      </p>
                      <a
                        href={`https://maps.google.com/?q=${selectedStandort.lat},${selectedStandort.lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        Open in Google Maps
                        <ChevronRight className="h-3 w-3" />
                      </a>
                    </div>
                  </>
                )}
                {selectedStandort.link && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      SharePoint
                    </p>
                    <a
                      href={selectedStandort.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1 break-all"
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
              <CardContent className="flex items-center justify-center h-32 text-muted-foreground">
                <p className="text-sm">Select a standort to see details</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Foundation status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {featureCards.map(({ icon: Icon, title }) => (
                <div key={title} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">{title}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </AppFrame>
  );
}