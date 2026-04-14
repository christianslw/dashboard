export interface Standort {
  nummer: string | number;
  name: string;
  lat: number | null;
  lon: number | null;
  link: string;
  distance?: number;
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