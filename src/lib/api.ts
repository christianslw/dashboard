export interface Standort {
  nummer: string | number;
  name: string;
  lat: number | null;
  lon: number | null;
  link: string;
  distance?: number;
}

export type OverlayGeometry = {
  type: "Point" | "LineString" | "Polygon";
  coordinates: unknown;
};

export type OverlayToolType = "route" | "path" | "marker" | "zone";

export interface OverlayFeatureProperties {
  overlayType?: string;
  routeType?: "hauptzufahrt" | "alternativ" | "custom";
  strokeStyle?: "solid" | "dash" | "dot" | "arrow" | "arrow_many";
  iconType?: "schranke" | "tresor" | "hinweis" | "tor";
  zoneType?: "eisabfall" | "custom";
  color?: string;
  radius?: number;
  note?: string;
  label?: string;
}

export interface OverlayFeature {
  type: "Feature";
  geometry: OverlayGeometry;
  properties: OverlayFeatureProperties;
}

export interface OverlayPayload {
  features: OverlayFeature[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface OverlayVersionInfo {
  updatedAt: string | null;
  nummer?: string;
}

export type StandorteSummary = {
  count: number;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export type AdminStatus = {
  ok: boolean;
  standorteCount: number;
  overlaysCount: number;
};

export async function fetchStandorteSummary(signal?: AbortSignal): Promise<StandorteSummary> {
  const startedAt = performance.now();

  try {
    const response = await fetch("/api/standorte", { signal });
    if (!response.ok) {
      return {
        ok: false,
        count: 0,
        latencyMs: Math.round(performance.now() - startedAt),
        error: `HTTP ${response.status}`,
      };
    }

    const payload = await response.json();
    return {
      ok: true,
      count: Array.isArray(payload) ? payload.length : 0,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      ok: false,
      count: 0,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function fetchAllStandorte(signal?: AbortSignal): Promise<Standort[]> {
  try {
    const response = await fetch("/api/standorte", { signal });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Failed to fetch standorte:", err);
    return [];
  }
}

export async function fetchAdminStatus(token: string, signal?: AbortSignal): Promise<AdminStatus> {
  const response = await fetch("/api/admin/status", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(response.status === 401 ? "Unauthorized" : `HTTP ${response.status}`);
  }

  return response.json() as Promise<AdminStatus>;
}

export async function fetchOverlayPayload(
  standortNummer: string | number,
  signal?: AbortSignal,
): Promise<OverlayPayload> {
  const response = await fetch(`/api/overlays/${standortNummer}`, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as Partial<OverlayPayload>;
  return {
    features: Array.isArray(payload.features) ? payload.features : [],
    updatedAt: payload.updatedAt ?? null,
    updatedBy: payload.updatedBy ?? null,
  };
}

export async function saveOverlayPayload(
  standortNummer: string | number,
  payload: OverlayPayload,
): Promise<{ ok: boolean; updatedAt: string }> {
  const response = await fetch(`/api/overlays/${standortNummer}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json() as Promise<{ ok: boolean; updatedAt: string }>;
}

export async function deleteOverlayPayload(
  standortNummer: string | number,
): Promise<{ ok: boolean }> {
  const response = await fetch(`/api/overlays/${standortNummer}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json() as Promise<{ ok: boolean }>;
}

export async function fetchOverlayVersion(signal?: AbortSignal): Promise<OverlayVersionInfo> {
  const response = await fetch("/api/overlays/version", { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as Partial<OverlayVersionInfo>;
  return {
    updatedAt: payload.updatedAt ?? null,
    nummer: payload.nummer,
  };
}