import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteOverlayPayload,
  fetchOverlayPayload,
  fetchOverlayVersion,
  OverlayFeature,
  OverlayPayload,
  OverlayToolType,
  saveOverlayPayload,
} from "@/lib/api";

export type OverlayFeatureDraft = OverlayFeature & {
  id: string;
};

export type OverlayCategory = "route" | "path" | "marker" | "zone" | "color";

const DEFAULT_PALETTE = [
  "#dc2626",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
  "#64748b",
  "#334155",
];

const TOOLSET: Record<OverlayCategory, string[]> = {
  route: ["hauptzufahrt", "alternativ", "custom"],
  path: ["solid", "dash", "dot", "arrow", "arrow_many"],
  marker: ["schranke", "tor", "tresor", "hinweis"],
  zone: ["eisabfall", "custom"],
  color: [],
};

function inferToolType(feature: OverlayFeatureDraft): OverlayToolType {
  const overlayType = feature.properties.overlayType;
  if (overlayType === "anfahrt" || feature.properties.routeType) return "route";
  if (overlayType === "pfad" || feature.properties.strokeStyle) return "path";
  if (overlayType === "icon" || feature.properties.iconType) return "marker";
  return "zone";
}

function createDraftId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ov-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toDraftFeatures(features: OverlayFeature[]): OverlayFeatureDraft[] {
  return features.map((feature) => ({
    ...feature,
    id: createDraftId(),
  }));
}

function toPersistedFeatures(features: OverlayFeatureDraft[]): OverlayFeature[] {
  return features.map(({ id: _, ...feature }) => feature);
}

export interface UseOverlayCommandCenterResult {
  features: OverlayFeatureDraft[];
  selectedFeatureId: string | null;
  selectedFeature: OverlayFeatureDraft | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  dirty: boolean;
  remoteChanged: boolean;
  activeCategory: OverlayCategory;
  activeTool: string | null;
  activeColor: string;
  palette: string[];
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
  canUndo: boolean;
  canRedo: boolean;
  availableTools: Record<OverlayCategory, string[]>;
  setActiveCategory: (category: OverlayCategory) => void;
  setActiveTool: (tool: string | null) => void;
  setActiveColor: (color: string) => void;
  selectFeature: (featureId: string | null) => void;
  applyColorToSelected: () => void;
  addDemoFeature: (toolType: OverlayToolType) => void;
  removeSelectedFeature: () => void;
  clearAllFeatures: () => void;
  undo: () => void;
  redo: () => void;
  reload: () => Promise<void>;
  save: () => Promise<void>;
  removeAllRemote: () => Promise<void>;
}

export function useOverlayCommandCenter(
  standortNummer: string | number | undefined,
): UseOverlayCommandCenterResult {
  const [features, setFeatures] = useState<OverlayFeatureDraft[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [activeCategory, setActiveCategory] = useState<OverlayCategory>("route");
  const [activeTool, setActiveTool] = useState<string | null>("hauptzufahrt");
  const [activeColor, setActiveColor] = useState<string>(DEFAULT_PALETTE[0]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastUpdatedBy, setLastUpdatedBy] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<OverlayFeatureDraft[][]>([]);
  const [redoStack, setRedoStack] = useState<OverlayFeatureDraft[][]>([]);

  const selectedFeature = useMemo(
    () => features.find((feature) => feature.id === selectedFeatureId) ?? null,
    [features, selectedFeatureId],
  );

  const pushUndoSnapshot = useCallback((snapshot: OverlayFeatureDraft[]) => {
    setUndoStack((prev) => [...prev.slice(-29), snapshot.map((feature) => ({ ...feature }))]);
    setRedoStack([]);
  }, []);

  const applyFeatureChange = useCallback(
    (updater: (current: OverlayFeatureDraft[]) => OverlayFeatureDraft[]) => {
      setFeatures((current) => {
        pushUndoSnapshot(current);
        const next = updater(current);
        setDirty(true);
        return next;
      });
    },
    [pushUndoSnapshot],
  );

  const reload = useCallback(async () => {
    if (!standortNummer) {
      setFeatures([]);
      setSelectedFeatureId(null);
      setDirty(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await fetchOverlayPayload(standortNummer);
      const drafted = toDraftFeatures(payload.features);
      setFeatures(drafted);
      setSelectedFeatureId(drafted[0]?.id ?? null);
      setLastUpdatedAt(payload.updatedAt);
      setLastUpdatedBy(payload.updatedBy);
      setUndoStack([]);
      setRedoStack([]);
      setDirty(false);
      setRemoteChanged(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Overlay load failed");
    } finally {
      setLoading(false);
    }
  }, [standortNummer]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!standortNummer) return;

    const controller = new AbortController();
    const timer = setInterval(async () => {
      try {
        const version = await fetchOverlayVersion(controller.signal);
        if (version.nummer && String(version.nummer) !== String(standortNummer)) {
          return;
        }
        if (lastUpdatedAt && version.updatedAt && version.updatedAt > lastUpdatedAt && dirty) {
          setRemoteChanged(true);
        }
      } catch {
        // Polling should never break user editing flow.
      }
    }, 60000);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [standortNummer, dirty, lastUpdatedAt]);

  const addDemoFeature = useCallback(
    (toolType: OverlayToolType) => {
      const base: OverlayFeatureDraft = {
        id: createDraftId(),
        type: "Feature",
        geometry: {
          type: toolType === "marker" ? "Point" : toolType === "zone" ? "Polygon" : "LineString",
          coordinates:
            toolType === "marker"
              ? [8.4, 48.8]
              : toolType === "zone"
                ? [[[8.2, 48.7], [8.4, 48.7], [8.4, 48.9], [8.2, 48.9], [8.2, 48.7]]]
                : [[8.2, 48.7], [8.3, 48.8], [8.4, 48.9]],
        },
        properties: {
          overlayType:
            toolType === "route" ? "anfahrt" : toolType === "path" ? "pfad" : toolType === "marker" ? "icon" : "zone",
          routeType: toolType === "route" ? "hauptzufahrt" : undefined,
          strokeStyle: toolType === "path" ? "solid" : undefined,
          iconType: toolType === "marker" ? "schranke" : undefined,
          zoneType: toolType === "zone" ? "custom" : undefined,
          color: activeColor,
          label: `Draft ${toolType}`,
        },
      };

      applyFeatureChange((current) => [...current, base]);
      setSelectedFeatureId(base.id);
      setActiveCategory(toolType === "route" ? "route" : toolType === "path" ? "path" : toolType === "marker" ? "marker" : "zone");
    },
    [activeColor, applyFeatureChange],
  );

  const removeSelectedFeature = useCallback(() => {
    if (!selectedFeatureId) return;

    applyFeatureChange((current) => current.filter((feature) => feature.id !== selectedFeatureId));
    setSelectedFeatureId(null);
  }, [applyFeatureChange, selectedFeatureId]);

  const clearAllFeatures = useCallback(() => {
    applyFeatureChange(() => []);
    setSelectedFeatureId(null);
  }, [applyFeatureChange]);

  const applyColorToSelected = useCallback(() => {
    if (!selectedFeatureId) return;

    applyFeatureChange((current) =>
      current.map((feature) =>
        feature.id === selectedFeatureId
          ? {
              ...feature,
              properties: {
                ...feature.properties,
                color: activeColor,
              },
            }
          : feature,
      ),
    );
  }, [activeColor, applyFeatureChange, selectedFeatureId]);

  const undo = useCallback(() => {
    setUndoStack((currentUndo) => {
      if (currentUndo.length === 0) return currentUndo;

      setRedoStack((currentRedo) => [...currentRedo, features.map((feature) => ({ ...feature }))]);
      const previous = currentUndo[currentUndo.length - 1];
      setFeatures(previous.map((feature) => ({ ...feature })));
      setDirty(true);
      return currentUndo.slice(0, -1);
    });
  }, [features]);

  const redo = useCallback(() => {
    setRedoStack((currentRedo) => {
      if (currentRedo.length === 0) return currentRedo;

      setUndoStack((currentUndo) => [...currentUndo, features.map((feature) => ({ ...feature }))]);
      const next = currentRedo[currentRedo.length - 1];
      setFeatures(next.map((feature) => ({ ...feature })));
      setDirty(true);
      return currentRedo.slice(0, -1);
    });
  }, [features]);

  const save = useCallback(async () => {
    if (!standortNummer) return;

    setSaving(true);
    setError(null);

    const payload: OverlayPayload = {
      features: toPersistedFeatures(features),
      updatedAt: new Date().toISOString(),
      updatedBy: "react-command-center",
    };

    try {
      const result = await saveOverlayPayload(standortNummer, payload);
      setLastUpdatedAt(result.updatedAt);
      setLastUpdatedBy(payload.updatedBy);
      setDirty(false);
      setRemoteChanged(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Overlay save failed");
    } finally {
      setSaving(false);
    }
  }, [features, standortNummer]);

  const removeAllRemote = useCallback(async () => {
    if (!standortNummer) return;

    setSaving(true);
    setError(null);

    try {
      await deleteOverlayPayload(standortNummer);
      setFeatures([]);
      setSelectedFeatureId(null);
      setDirty(false);
      setLastUpdatedAt(new Date().toISOString());
      setLastUpdatedBy("react-command-center");
      setUndoStack([]);
      setRedoStack([]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Overlay reset failed");
    } finally {
      setSaving(false);
    }
  }, [standortNummer]);

  useEffect(() => {
    if (!activeTool) return;
    if (activeCategory === "color") return;

    const categoryTools = TOOLSET[activeCategory];
    if (categoryTools.includes(activeTool)) return;
    setActiveTool(categoryTools[0] ?? null);
  }, [activeCategory, activeTool]);

  return {
    features,
    selectedFeatureId,
    selectedFeature,
    loading,
    saving,
    error,
    dirty,
    remoteChanged,
    activeCategory,
    activeTool,
    activeColor,
    palette: DEFAULT_PALETTE,
    lastUpdatedAt,
    lastUpdatedBy,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    availableTools: TOOLSET,
    setActiveCategory,
    setActiveTool,
    setActiveColor,
    selectFeature: setSelectedFeatureId,
    applyColorToSelected,
    addDemoFeature,
    removeSelectedFeature,
    clearAllFeatures,
    undo,
    redo,
    reload,
    save,
    removeAllRemote,
  };
}
