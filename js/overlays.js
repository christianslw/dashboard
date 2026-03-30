// ==========================================
// Standort Overlays (Icons + Anfahrt) with optional Sync
// ==========================================

const OVERLAY_STORAGE_KEY = 'standortOverlays_v1';
const OVERLAY_MIN_ZOOM = 14;
const OVERLAY_ICON_DEFAULT = 'schranke';
const OVERLAY_COLOR_DEFAULT = '#ef4444';

const OVERLAY_ICONS = {
    tresor: { label: 'Schlüsseltresor', symbol: '🔐' },
    schranke: { label: 'Schranke', symbol: '⛔' }
};

let overlayStore = {};
let overlayDisplayGroup = null;
let overlayEditGroup = null;
let overlayEditMode = false;
let overlayEditingStandortNummer = null;
let overlayExclusiveStandortNummer = null;
let overlaySyncClient = null;
let overlaySyncChannel = null;
let overlayPollingTimer = null;
let overlayMapControl = null;
let overlayCurrentDrawHandler = null;

function normalizeStandortNummer(nummer) {
    return String(nummer);
}

function getOverlayButton() {
    return document.getElementById('overlayEditToggleBtn');
}

function getOverlayToolbox() {
    return document.getElementById('overlayEditToolbox');
}

function getOverlayControlRoot() {
    return document.getElementById('overlayMapControlRoot');
}

function getOverlayInfoLabel() {
    return document.getElementById('overlayModeInfo');
}

function getOverlayIconTypeSelection() {
    const select = document.getElementById('overlayIconTypeSelect');
    const val = select ? select.value : OVERLAY_ICON_DEFAULT;
    return OVERLAY_ICONS[val] ? val : OVERLAY_ICON_DEFAULT;
}

function getOverlayColorSelection() {
    const input = document.getElementById('overlayColorInput');
    return input?.value || OVERLAY_COLOR_DEFAULT;
}

function stopCurrentDrawHandler() {
    if (overlayCurrentDrawHandler) {
        overlayCurrentDrawHandler.disable();
        overlayCurrentDrawHandler = null;
    }
}

function getEmptyOverlayPayload() {
    return {
        features: [],
        updatedAt: null,
        updatedBy: null
    };
}

function getOverlayPayloadForStandort(nummer) {
    const key = normalizeStandortNummer(nummer);
    if (!overlayStore[key]) {
        overlayStore[key] = getEmptyOverlayPayload();
    }
    if (!Array.isArray(overlayStore[key].features)) {
        overlayStore[key].features = [];
    }
    return overlayStore[key];
}

function setOverlayPayloadForStandort(nummer, payload) {
    const key = normalizeStandortNummer(nummer);
    overlayStore[key] = {
        features: Array.isArray(payload?.features) ? payload.features : [],
        updatedAt: payload?.updatedAt || null,
        updatedBy: payload?.updatedBy || null
    };
}

function getOverlayStorageSnapshot() {
    return JSON.stringify(overlayStore);
}

function persistOverlayStorageSnapshot(snapshot) {
    localStorage.setItem(OVERLAY_STORAGE_KEY, snapshot);
}

function loadOverlayStorageSnapshot() {
    const raw = localStorage.getItem(OVERLAY_STORAGE_KEY);
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function getOverlayMarkerIcon(iconType, color) {
    const meta = OVERLAY_ICONS[iconType] || OVERLAY_ICONS[OVERLAY_ICON_DEFAULT];
    const borderColor = color || OVERLAY_COLOR_DEFAULT;
    return L.divIcon({
        html: `<div class="overlay-poi-marker" style="border-color:${borderColor}" title="${meta.label}">${meta.symbol}</div>`,
        className: 'overlay-poi-icon-wrap',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

function createLayerFromFeature(feature) {
    if (!feature || feature.type !== 'Feature' || !feature.geometry) return null;

    const { geometry, properties = {} } = feature;

    if (geometry.type === 'Point' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
        const [lon, lat] = geometry.coordinates;
        const iconType = properties.iconType || OVERLAY_ICON_DEFAULT;
        const color = properties.color || OVERLAY_COLOR_DEFAULT;

        const marker = L.marker([lat, lon], {
            icon: getOverlayMarkerIcon(iconType, color)
        });

        marker.feature = {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lon, lat]
            },
            properties: {
                overlayType: 'icon',
                iconType,
                color
            }
        };

        marker.bindTooltip(OVERLAY_ICONS[iconType]?.label || 'POI', { direction: 'top', offset: [0, -10] });
        return marker;
    }

    if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
        const latLngs = geometry.coordinates
            .filter(c => Array.isArray(c) && c.length >= 2)
            .map(c => [c[1], c[0]]);

        if (latLngs.length < 2) return null;

        const color = properties.color || OVERLAY_COLOR_DEFAULT;
        const polyline = L.polyline(latLngs, {
            color,
            weight: 4,
            dashArray: '8, 8',
            opacity: 0.9,
            lineCap: 'round'
        });

        polyline.feature = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: latLngs.map(([lat, lon]) => [lon, lat])
            },
            properties: {
                overlayType: 'anfahrt',
                color
            }
        };

        return polyline;
    }

    return null;
}

function updateFeatureFromLayer(layer) {
    if (!layer) return null;

    if (layer instanceof L.Marker) {
        const latLng = layer.getLatLng();
        const iconType = layer.feature?.properties?.iconType || getOverlayIconTypeSelection();
        const color = layer.feature?.properties?.color || getOverlayColorSelection();

        layer.feature = {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [latLng.lng, latLng.lat]
            },
            properties: {
                overlayType: 'icon',
                iconType,
                color
            }
        };

        layer.setIcon(getOverlayMarkerIcon(iconType, color));
        layer.bindTooltip(OVERLAY_ICONS[iconType]?.label || 'POI', { direction: 'top', offset: [0, -10] });
        return layer.feature;
    }

    if (layer instanceof L.Polyline) {
        const coordinates = layer.getLatLngs()
            .filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number')
            .map(p => [p.lng, p.lat]);

        const color = layer.feature?.properties?.color || getOverlayColorSelection();

        layer.feature = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates
            },
            properties: {
                overlayType: 'anfahrt',
                color
            }
        };

        if (typeof layer.setStyle === 'function') {
            layer.setStyle({ color });
        }

        return layer.feature;
    }

    return null;
}

function buildPayloadFromEditLayerGroup() {
    const features = [];
    overlayEditGroup.eachLayer(layer => {
        const feature = updateFeatureFromLayer(layer);
        if (feature) features.push(feature);
    });

    return {
        features,
        updatedAt: new Date().toISOString(),
        updatedBy: 'gui'
    };
}

function renderDisplayOverlaysForStandort(nummer) {
    if (!overlayDisplayGroup) return;

    overlayDisplayGroup.clearLayers();
    if (!nummer) return;

    const payload = getOverlayPayloadForStandort(nummer);
    payload.features.forEach(feature => {
        const layer = createLayerFromFeature(feature);
        if (layer) overlayDisplayGroup.addLayer(layer);
    });
}

function renderEditOverlaysForStandort(nummer) {
    if (!overlayEditGroup) return;

    overlayEditGroup.clearLayers();
    if (!nummer) return;

    const payload = getOverlayPayloadForStandort(nummer);
    payload.features.forEach(feature => {
        const layer = createLayerFromFeature(feature);
        if (!layer) return;

        if (layer instanceof L.Marker) {
            layer.on('dblclick', async () => {
                if (!overlayEditMode) return;
                overlayEditGroup.removeLayer(layer);
                await saveEditedOverlays();
            });
        }

        if (layer instanceof L.Polyline) {
            layer.on('dblclick', async () => {
                if (!overlayEditMode) return;
                overlayEditGroup.removeLayer(layer);
                await saveEditedOverlays();
            });
        }

        overlayEditGroup.addLayer(layer);
    });
}

function ensureOverlayCollections() {
    if (!leafletMap) return;

    if (!overlayDisplayGroup) {
        overlayDisplayGroup = L.layerGroup().addTo(leafletMap);
    }

    if (!overlayEditGroup) {
        overlayEditGroup = new L.FeatureGroup();
        leafletMap.addLayer(overlayEditGroup);
    }
}

function getSingleVisibleStandortOnMap() {
    if (!leafletMap) return null;
    if (leafletMap.getZoom() < OVERLAY_MIN_ZOOM) return null;

    const bounds = leafletMap.getBounds();
    const visible = getFilteredStandorte().filter(s => s.lat && s.lon && bounds.contains([s.lat, s.lon]));
    return visible.length === 1 ? visible[0] : null;
}

function resolveExclusiveStandort() {
    const filtered = getFilteredStandorte();
    if (filtered.length === 1) {
        return { standort: filtered[0], source: 'list' };
    }

    const mapSingle = getSingleVisibleStandortOnMap();
    if (mapSingle) {
        return { standort: mapSingle, source: 'map' };
    }

    return { standort: null, source: null };
}

function updateOverlayControlVisibility() {
    const root = getOverlayControlRoot();
    if (!root) return;

    if (!overlayExclusiveStandortNummer && !overlayEditMode) {
        root.classList.add('overlay-hidden');
    } else {
        root.classList.remove('overlay-hidden');
    }
}

function setOverlayStatusMessage(message) {
    const label = getOverlayInfoLabel();
    if (label && message) {
        label.innerText = message;
    }
}

function updateOverlayEditButtonState() {
    const btn = getOverlayButton();
    const toolbox = getOverlayToolbox();
    const label = getOverlayInfoLabel();
    if (!btn) return;

    if (!overlayExclusiveStandortNummer) {
        btn.disabled = true;
        btn.classList.remove('overlay-active');
        if (toolbox) toolbox.classList.add('overlay-toolbox-hidden');
        if (label) label.innerText = 'Kein eindeutiger Standort';
        updateOverlayControlVisibility();
        return;
    }

    btn.disabled = false;

    if (overlayEditMode) {
        btn.classList.add('overlay-active');
        if (toolbox) toolbox.classList.remove('overlay-toolbox-hidden');
        if (label) label.innerText = `Bearbeitung ${overlayEditingStandortNummer}`;
    } else {
        btn.classList.remove('overlay-active');
        if (toolbox) toolbox.classList.add('overlay-toolbox-hidden');
        if (label) label.innerText = `Auswahl ${overlayExclusiveStandortNummer}`;
    }

    updateOverlayControlVisibility();
}

function applyCurrentColorToEditableLayers() {
    const color = getOverlayColorSelection();
    overlayEditGroup.eachLayer(layer => {
        if (layer instanceof L.Polyline) {
            if (typeof layer.setStyle === 'function') {
                layer.setStyle({ color });
            }
            if (!layer.feature) layer.feature = { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} };
            layer.feature.properties = layer.feature.properties || {};
            layer.feature.properties.color = color;
        }
        if (layer instanceof L.Marker) {
            const iconType = layer.feature?.properties?.iconType || getOverlayIconTypeSelection();
            if (!layer.feature) layer.feature = { type: 'Feature', geometry: { type: 'Point', coordinates: [] }, properties: {} };
            layer.feature.properties = layer.feature.properties || {};
            layer.feature.properties.color = color;
            layer.feature.properties.iconType = iconType;
            layer.setIcon(getOverlayMarkerIcon(iconType, color));
        }
    });
}

function autoSelectExclusiveStandort(standort) {
    if (!standort) return;

    if (typeof highlightListItem === 'function') {
        highlightListItem(standort.nummer);
    }
}

function refreshExclusiveStandortContext() {
    const { standort } = resolveExclusiveStandort();
    const nextNummer = standort ? normalizeStandortNummer(standort.nummer) : null;

    if (nextNummer === overlayExclusiveStandortNummer) {
        updateOverlayEditButtonState();
        return;
    }

    overlayExclusiveStandortNummer = nextNummer;

    if (!overlayExclusiveStandortNummer && overlayEditMode) {
        setOverlayEditMode(false);
    }

    if (standort) {
        autoSelectExclusiveStandort(standort);
    }

    if (overlayEditMode && overlayEditingStandortNummer) {
        renderEditOverlaysForStandort(overlayEditingStandortNummer);
        renderDisplayOverlaysForStandort(overlayEditingStandortNummer);
    } else if (overlayExclusiveStandortNummer) {
        renderDisplayOverlaysForStandort(overlayExclusiveStandortNummer);
    } else if (overlayDisplayGroup) {
        overlayDisplayGroup.clearLayers();
    }

    updateOverlayEditButtonState();
}

function refreshVisibleOverlays() {
    refreshExclusiveStandortContext();

    if (!overlayDisplayGroup) return;
    if (overlayEditMode && overlayEditingStandortNummer) {
        renderDisplayOverlaysForStandort(overlayEditingStandortNummer);
        return;
    }

    if (overlayExclusiveStandortNummer) {
        renderDisplayOverlaysForStandort(overlayExclusiveStandortNummer);
    } else {
        overlayDisplayGroup.clearLayers();
    }
}

async function saveOverlayPayload(nummer, payload) {
    setOverlayPayloadForStandort(nummer, payload);
    persistOverlayStorageSnapshot(getOverlayStorageSnapshot());

    const remoteSaved = await saveOverlaysRemote(nummer, payload);
    if (!remoteSaved && overlaySyncClient) {
        setOverlayStatusMessage('Sync-Fehler, lokal gespeichert');
    }
}

async function saveEditedOverlays() {
    if (!overlayEditMode || !overlayEditingStandortNummer) return;

    const payload = buildPayloadFromEditLayerGroup();
    await saveOverlayPayload(overlayEditingStandortNummer, payload);

    renderDisplayOverlaysForStandort(overlayEditingStandortNummer);
}

function setOverlayEditMode(enabled) {
    overlayEditMode = enabled;

    if (!enabled) {
        stopCurrentDrawHandler();
        overlayEditingStandortNummer = null;
        if (overlayEditGroup) {
            overlayEditGroup.clearLayers();
        }
        refreshVisibleOverlays();
        updateOverlayEditButtonState();
        return;
    }

    if (!overlayExclusiveStandortNummer) {
        overlayEditMode = false;
        updateOverlayEditButtonState();
        return;
    }

    overlayEditingStandortNummer = overlayExclusiveStandortNummer;
    renderEditOverlaysForStandort(overlayEditingStandortNummer);
    renderDisplayOverlaysForStandort(overlayEditingStandortNummer);
    applyCurrentColorToEditableLayers();
    updateOverlayEditButtonState();
}

function toggleOverlayEditMode() {
    if (!overlayExclusiveStandortNummer && !overlayEditMode) return;
    setOverlayEditMode(!overlayEditMode);
}

function startLineDrawing() {
    if (!overlayEditMode) setOverlayEditMode(true);
    if (!overlayEditMode) return;

    stopCurrentDrawHandler();

    const color = getOverlayColorSelection();
    overlayCurrentDrawHandler = new L.Draw.Polyline(leafletMap, {
        shapeOptions: {
            color,
            weight: 4,
            dashArray: '8, 8',
            opacity: 0.9
        }
    });

    overlayCurrentDrawHandler.enable();
}

function startPoiDrawing() {
    if (!overlayEditMode) setOverlayEditMode(true);
    if (!overlayEditMode) return;

    stopCurrentDrawHandler();

    overlayCurrentDrawHandler = new L.Draw.Marker(leafletMap, {
        icon: getOverlayMarkerIcon(getOverlayIconTypeSelection(), getOverlayColorSelection())
    });

    overlayCurrentDrawHandler.enable();
}

async function clearOverlayForCurrentStandort() {
    if (!overlayEditMode || !overlayEditingStandortNummer) return;

    overlayEditGroup.clearLayers();
    await saveEditedOverlays();
}

function attachOverlayMapUiListeners() {
    const btn = getOverlayButton();
    const lineBtn = document.getElementById('overlayLineToolBtn');
    const poiBtn = document.getElementById('overlayPoiToolBtn');
    const clearBtn = document.getElementById('overlayClearBtn');
    const colorInput = document.getElementById('overlayColorInput');

    if (btn) btn.addEventListener('click', toggleOverlayEditMode);
    if (lineBtn) lineBtn.addEventListener('click', startLineDrawing);
    if (poiBtn) poiBtn.addEventListener('click', startPoiDrawing);
    if (clearBtn) clearBtn.addEventListener('click', clearOverlayForCurrentStandort);
    if (colorInput) {
        colorInput.addEventListener('input', async () => {
            if (!overlayEditMode) return;
            applyCurrentColorToEditableLayers();
            await saveEditedOverlays();
        });
    }
}

function createOverlayMapControl() {
    if (!leafletMap || overlayMapControl) return;

    const OverlayControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-control overlay-map-control');
            container.innerHTML = `
                <div id="overlayMapControlRoot" class="overlay-map-control-card overlay-hidden">
                    <button id="overlayEditToggleBtn" type="button" class="overlay-map-control-btn" title="Overlays bearbeiten" aria-label="Overlays bearbeiten">
                        <span aria-hidden="true">✎</span>
                    </button>
                    <div id="overlayEditToolbox" class="overlay-toolbox-hidden">
                        <div class="overlay-tool-row">
                            <label class="overlay-tool-label" for="overlayColorInput">Farbe</label>
                            <input id="overlayColorInput" type="color" value="#ef4444" class="overlay-color-input" />
                        </div>
                        <div class="overlay-tool-row">
                            <button id="overlayLineToolBtn" type="button" class="overlay-tool-btn">Linie</button>
                            <button id="overlayPoiToolBtn" type="button" class="overlay-tool-btn">POI</button>
                        </div>
                        <div class="overlay-tool-row">
                            <select id="overlayIconTypeSelect" class="overlay-map-control-select" title="POI-Typ" aria-label="POI-Typ">
                                <option value="schranke">⛔ Schranke</option>
                                <option value="tresor">🔐 Schlüsseltresor</option>
                            </select>
                            <button id="overlayClearBtn" type="button" class="overlay-tool-btn overlay-tool-btn-danger">Löschen</button>
                        </div>
                    </div>
                    <div id="overlayModeInfo" class="overlay-map-control-info">Kein eindeutiger Standort</div>
                </div>
            `;

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);
            return container;
        }
    });

    overlayMapControl = new OverlayControl();
    leafletMap.addControl(overlayMapControl);

    attachOverlayMapUiListeners();
}

function attachDrawListeners() {
    leafletMap.on(L.Draw.Event.CREATED, async (event) => {
        if (!overlayEditMode) return;

        const layer = event.layer;
        const color = getOverlayColorSelection();

        if (layer instanceof L.Marker) {
            const iconType = getOverlayIconTypeSelection();
            layer.feature = {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [layer.getLatLng().lng, layer.getLatLng().lat]
                },
                properties: {
                    overlayType: 'icon',
                    iconType,
                    color
                }
            };

            layer.setIcon(getOverlayMarkerIcon(iconType, color));
            layer.bindTooltip(OVERLAY_ICONS[iconType]?.label || 'POI', { direction: 'top', offset: [0, -10] });
            layer.on('dblclick', async () => {
                if (!overlayEditMode) return;
                overlayEditGroup.removeLayer(layer);
                await saveEditedOverlays();
            });
        }

        if (layer instanceof L.Polyline) {
            layer.setStyle({ color });
            layer.feature = {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: layer.getLatLngs().map(p => [p.lng, p.lat])
                },
                properties: {
                    overlayType: 'anfahrt',
                    color
                }
            };
            layer.on('dblclick', async () => {
                if (!overlayEditMode) return;
                overlayEditGroup.removeLayer(layer);
                await saveEditedOverlays();
            });
        }

        overlayEditGroup.addLayer(layer);
        stopCurrentDrawHandler();
        await saveEditedOverlays();
    });

    leafletMap.on(L.Draw.Event.DRAWSTOP, () => {
        stopCurrentDrawHandler();
    });
}

function getSupabaseConfig() {
    const cfg = window.__SUPABASE_CONFIG__;
    if (!cfg || typeof cfg !== 'object') return null;
    if (!cfg.url || !cfg.anonKey || !cfg.table) return null;
    return cfg;
}

async function initOverlaySyncClient() {
    const cfg = getSupabaseConfig();
    if (!cfg || typeof window.supabase === 'undefined') {
        overlaySyncClient = null;
        return;
    }

    overlaySyncClient = window.supabase.createClient(cfg.url, cfg.anonKey);
}

async function fetchAllOverlaysRemote() {
    if (!overlaySyncClient) return null;
    const cfg = getSupabaseConfig();
    if (!cfg) return null;

    const { data, error } = await overlaySyncClient
        .from(cfg.table)
        .select('standort_nummer, features, updated_at, updated_by');

    if (error) {
        console.error('Overlay Sync fetch failed', error);
        return null;
    }

    const remoteStore = {};
    (data || []).forEach(row => {
        remoteStore[normalizeStandortNummer(row.standort_nummer)] = {
            features: Array.isArray(row.features) ? row.features : [],
            updatedAt: row.updated_at || null,
            updatedBy: row.updated_by || null
        };
    });

    return remoteStore;
}

async function saveOverlaysRemote(nummer, payload) {
    if (!overlaySyncClient) return false;
    const cfg = getSupabaseConfig();
    if (!cfg) return false;

    const row = {
        standort_nummer: normalizeStandortNummer(nummer),
        features: payload.features,
        updated_at: payload.updatedAt,
        updated_by: payload.updatedBy || 'gui'
    };

    const { error } = await overlaySyncClient
        .from(cfg.table)
        .upsert(row, { onConflict: 'standort_nummer' });

    if (error) {
        console.error('Overlay Sync save failed', error);
        return false;
    }

    return true;
}

async function subscribeRemoteOverlayChanges() {
    if (!overlaySyncClient) return;

    const cfg = getSupabaseConfig();
    if (!cfg) return;

    overlaySyncChannel = overlaySyncClient
        .channel('standort-overlays-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: cfg.table }, payload => {
            const row = payload.new || payload.old;
            if (!row || !row.standort_nummer) return;

            setOverlayPayloadForStandort(row.standort_nummer, {
                features: Array.isArray(row.features) ? row.features : [],
                updatedAt: row.updated_at || null,
                updatedBy: row.updated_by || null
            });

            if (overlayEditMode && normalizeStandortNummer(row.standort_nummer) === overlayEditingStandortNummer) {
                renderEditOverlaysForStandort(overlayEditingStandortNummer);
            }

            refreshVisibleOverlays();
        })
        .subscribe();
}

function subscribeLocalOverlayChanges() {
    window.addEventListener('storage', event => {
        if (event.key !== OVERLAY_STORAGE_KEY || !event.newValue) return;

        try {
            const parsed = JSON.parse(event.newValue);
            overlayStore = parsed && typeof parsed === 'object' ? parsed : {};
            if (overlayEditMode && overlayEditingStandortNummer) {
                renderEditOverlaysForStandort(overlayEditingStandortNummer);
            }
            refreshVisibleOverlays();
        } catch {
            // ignore malformed external payload
        }
    });
}

function startLocalOverlayPolling() {
    if (overlayPollingTimer) clearInterval(overlayPollingTimer);

    let lastSnapshot = getOverlayStorageSnapshot();
    overlayPollingTimer = setInterval(() => {
        const snapshot = localStorage.getItem(OVERLAY_STORAGE_KEY) || '{}';
        if (snapshot === lastSnapshot) return;

        lastSnapshot = snapshot;
        try {
            const parsed = JSON.parse(snapshot);
            overlayStore = parsed && typeof parsed === 'object' ? parsed : {};
            if (overlayEditMode && overlayEditingStandortNummer) {
                renderEditOverlaysForStandort(overlayEditingStandortNummer);
            }
            refreshVisibleOverlays();
        } catch {
            // ignore malformed payload
        }
    }, 4000);
}

async function loadOverlayStore() {
    overlayStore = loadOverlayStorageSnapshot();

    const remote = await fetchAllOverlaysRemote();
    if (remote) {
        overlayStore = remote;
        persistOverlayStorageSnapshot(JSON.stringify(overlayStore));
        setOverlayStatusMessage('Sync aktiv');
    } else {
        setOverlayStatusMessage('Lokal synchron');
    }
}

function closeOverlayEditMode() {
    if (overlayEditMode) {
        setOverlayEditMode(false);
    }
}

function onOverlayTargetStandortChanged() {
    refreshVisibleOverlays();
}

function onOverlayListOrMapChanged() {
    refreshVisibleOverlays();
}

async function initStandortOverlays() {
    if (!leafletMap) return;

    createOverlayMapControl();
    ensureOverlayCollections();
    attachDrawListeners();

    await initOverlaySyncClient();
    await loadOverlayStore();

    if (overlaySyncClient) {
        await subscribeRemoteOverlayChanges();
    } else {
        subscribeLocalOverlayChanges();
        startLocalOverlayPolling();
    }

    leafletMap.on('moveend zoomend', refreshVisibleOverlays);

    updateOverlayEditButtonState();
    refreshVisibleOverlays();
}

window.toggleOverlayEditMode = toggleOverlayEditMode;
window.onOverlayTargetStandortChanged = onOverlayTargetStandortChanged;
window.onOverlayListOrMapChanged = onOverlayListOrMapChanged;
window.initStandortOverlays = initStandortOverlays;
window.closeOverlayEditMode = closeOverlayEditMode;
