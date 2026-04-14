import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { OverlayFeatureDraft } from "@/hooks/useOverlayCommandCenter";
import { Standort } from "@/lib/api";

interface OverlayMapAdapterProps {
  standort: Standort | null;
  standorte: Standort[];
  features: OverlayFeatureDraft[];
  selectedFeatureId: string | null;
  onSelectFeature: (featureId: string | null) => void;
  onSelectStandort: (standort: Standort) => void;
}

type FeatureCoords = [number, number][];

function toLatLng(lon: number, lat: number): L.LatLngExpression {
  return [lat, lon];
}

function readPointCoordinates(coordinates: unknown): [number, number] | null {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

function readLineCoordinates(coordinates: unknown): FeatureCoords {
  if (!Array.isArray(coordinates)) return [];

  return coordinates
    .map((entry) => readPointCoordinates(entry))
    .filter((entry): entry is [number, number] => Boolean(entry));
}

function readPolygonCoordinates(coordinates: unknown): FeatureCoords {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return [];
  const outer = coordinates[0];
  return readLineCoordinates(outer);
}

function getFeatureLabel(feature: OverlayFeatureDraft): string {
  return (
    feature.properties.label ??
    feature.properties.note ??
    feature.properties.routeType ??
    feature.properties.iconType ??
    feature.properties.zoneType ??
    feature.properties.overlayType ??
    "Feature"
  );
}

function getFeatureColor(feature: OverlayFeatureDraft): string {
  return feature.properties.color ?? "#475569";
}

export function OverlayMapAdapter({
  standort,
  standorte,
  features,
  selectedFeatureId,
  onSelectFeature,
  onSelectStandort,
}: OverlayMapAdapterProps) {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const standortLayerRef = useRef<L.LayerGroup | null>(null);

  const selectedFeature = useMemo(
    () => features.find((feature) => feature.id === selectedFeatureId) ?? null,
    [features, selectedFeatureId],
  );

  useEffect(() => {
    if (!mapHostRef.current || mapRef.current) return;

    const map = L.map(mapHostRef.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    }).setView([49.2, 8.6], 7);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    overlayLayerRef.current = L.layerGroup().addTo(map);
    standortLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      overlayLayerRef.current = null;
      standortLayerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const standortLayer = standortLayerRef.current;
    if (!map || !standortLayer) return;

    standortLayer.clearLayers();

    const bounds = L.latLngBounds([]);

    const markerColors: Record<number, string> = {
      1: "#8b5cf6",
      2: "#10b981",
      3: "#f59e0b",
      4: "#ef4444",
      5: "#ec4899",
      6: "#06b6d4",
      8: "#6366f1",
      9: "#eab308",
    };

    standorte.forEach((entry) => {
      if (entry.lat == null || entry.lon == null) return;

      const prefix = Math.floor(Number(entry.nummer) / 1000);
      const markerColor = markerColors[prefix] ?? "#3b82f6";
      const isActive = standort && String(standort.nummer) === String(entry.nummer);

      const marker = L.circleMarker([entry.lat, entry.lon], {
        radius: isActive ? 8 : 5,
        color: "#ffffff",
        weight: isActive ? 3 : 2,
        fillColor: markerColor,
        fillOpacity: isActive ? 0.95 : 0.8,
      });

      marker.bindTooltip(`${entry.nummer} - ${entry.name}`, {
        direction: "top",
        offset: [0, -6],
        opacity: 0.95,
      });
      marker.on("click", () => onSelectStandort(entry));
      marker.addTo(standortLayer);
      bounds.extend([entry.lat, entry.lon]);
    });

    if (standort && standort.lat != null && standort.lon != null) {
      map.setView([standort.lat, standort.lon], 11, { animate: true });
      return;
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.12), { animate: true, maxZoom: 10 });
    }
  }, [onSelectStandort, standort, standorte]);

  useEffect(() => {
    const overlayLayer = overlayLayerRef.current;
    const map = mapRef.current;
    if (!overlayLayer || !map) return;

    overlayLayer.clearLayers();

    const bounds = L.latLngBounds([]);

    features.forEach((feature) => {
      const color = getFeatureColor(feature);
      const label = getFeatureLabel(feature);
      const isSelected = selectedFeatureId === feature.id;
      const weight = isSelected ? 4 : 2;

      let layer: L.Layer | null = null;

      if (feature.geometry.type === "Point") {
        const point = readPointCoordinates(feature.geometry.coordinates);
        if (!point) return;

        layer = L.circleMarker(toLatLng(point[0], point[1]), {
          radius: isSelected ? 8 : 6,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.65,
        });
        bounds.extend(toLatLng(point[0], point[1]));
      }

      if (feature.geometry.type === "LineString") {
        const line = readLineCoordinates(feature.geometry.coordinates);
        if (line.length < 2) return;

        layer = L.polyline(
          line.map(([lon, lat]) => toLatLng(lon, lat)),
          {
            color,
            weight,
            opacity: 0.95,
            dashArray: feature.properties.strokeStyle === "dash" ? "10 6" : feature.properties.strokeStyle === "dot" ? "2 8" : undefined,
          },
        );
        line.forEach(([lon, lat]) => bounds.extend(toLatLng(lon, lat)));
      }

      if (feature.geometry.type === "Polygon") {
        const polygon = readPolygonCoordinates(feature.geometry.coordinates);
        if (polygon.length < 3) return;

        layer = L.polygon(
          polygon.map(([lon, lat]) => toLatLng(lon, lat)),
          {
            color,
            weight,
            fillColor: color,
            fillOpacity: 0.2,
          },
        );
        polygon.forEach(([lon, lat]) => bounds.extend(toLatLng(lon, lat)));
      }

      if (!layer) return;

      layer.bindTooltip(label, {
        sticky: true,
        direction: "top",
        opacity: 0.95,
      });
      layer.on("click", () => onSelectFeature(feature.id));
      overlayLayer.addLayer(layer);
    });

    if (selectedFeature && !bounds.isValid()) {
      const geometry = selectedFeature.geometry;
      if (geometry.type === "Point") {
        const point = readPointCoordinates(geometry.coordinates);
        if (point) {
          bounds.extend(toLatLng(point[0], point[1]));
        }
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.2), { animate: true, maxZoom: 15 });
    }
  }, [features, onSelectFeature, selectedFeature, selectedFeatureId]);

  return <div ref={mapHostRef} className="h-[420px] w-full rounded-xl border border-border/70" />;
}
