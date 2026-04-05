// ==========================================
// Standort Overlays v2 — Modern Sidebar
// Anfahrt · Markierungen · Zonen · Farbpalette · Undo
// Backend-ready (Supabase), localStorage fallback
// ==========================================

// ─── CONSTANTS ───────────────────────────────────────────

const OVERLAY_STORAGE_KEY = 'standortOverlays_v1';
const OVERLAY_MIN_ZOOM = 14;

const OVERLAY_PALETTE = [
    '#dc2626', '#ef4444', '#f97316', '#eab308',
    '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
    '#6366f1', '#8b5cf6', '#ec4899', '#78716c'
];

const OVERLAY_DEFAULT_COLORS = {
    hauptzufahrt: '#dc2626',
    alternativ:   '#f97316',
    route_custom: '#3b82f6',
    schranke:     '#ef4444',
    tresor:       '#3b82f6',
    hinweis:      '#eab308',
    eisabfall_poly:  '#eab308',
    eisabfall_kreis: '#eab308',
    zone_poly:    '#8b5cf6',
    zone_kreis:   '#8b5cf6',
    pfad_solid:      '#0ea5e9',
    pfad_dash:       '#0ea5e9',
    pfad_dot:        '#0ea5e9',
    pfad_arrow:      '#22c55e',
    pfad_arrow_many: '#22c55e'
};

const PFAD_STROKE_STYLES = {
    solid:      { weight: 3, dashArray: null,      lineCap: 'round', lineJoin: 'round' },
    dash:       { weight: 3, dashArray: '14, 8',   lineCap: 'butt',  lineJoin: 'round' },
    dot:        { weight: 3, dashArray: '2, 9',    lineCap: 'round', lineJoin: 'round' },
    arrow:      { weight: 3, dashArray: null,      lineCap: 'round', lineJoin: 'round' },
    arrow_many: { weight: 2.5, dashArray: null,    lineCap: 'round', lineJoin: 'round' }
};

const PFAD_STYLE_LABELS = {
    solid:      'Solide Linie',
    dash:       'Gestrichelt',
    dot:        'Gepunktet',
    arrow:      'Pfeil',
    arrow_many: 'Richtungspfeile'
};

const PFAD_STYLE_ICONS = {
    solid:      '━',
    dash:       '┄',
    dot:        '·····',
    arrow:      '→',
    arrow_many: '⇒'
};

const OVERLAY_ICONS = {
    schranke: { label: 'Schranke',        symbol: '⛔' },
    tresor:   { label: 'Schlüsseltresor', symbol: '🔐' },
    hinweis:  { label: 'Hinweis',         symbol: '💬' }
};

// ─── STATE ───────────────────────────────────────────────

let overlayStore = {};
let overlayDisplayGroup = null;
let overlayEditGroup = null;
let overlayEditMode = false;
let overlayEditingStandortNummer = null;
let overlayExclusiveStandortNummer = null;
let overlayMapControl = null;
let overlayCurrentDrawHandler = null;
let overlayActiveTool = null;
let overlayActiveColor = '#dc2626';
let overlayUndoStack = [];
const OVERLAY_MAX_UNDO = 30;

let overlaySyncClient = null;
let overlaySyncChannel = null;
let overlayPollingTimer = null;
let overlaySidebarEl = null;   // Leaflet control container (trigger button only)
let ovPanelEl = null;          // Panel element — appended to <body> to escape overflow:hidden

// Modal
let ovModalMode = null;        // 'hinweis' | 'zone' | 'edit-hinweis' | 'edit-zone'
let ovModalPendingLayer = null;
let ovModalEditLayer = null;
let ovModalEditNummer = null;

// ─── HELPERS ─────────────────────────────────────────────

function normalizeStandortNummer(n) { return String(n); }

function getEmptyOverlayPayload() {
    return { features: [], updatedAt: null, updatedBy: null };
}

function getOverlayPayloadForStandort(nummer) {
    const k = normalizeStandortNummer(nummer);
    if (!overlayStore[k]) overlayStore[k] = getEmptyOverlayPayload();
    if (!Array.isArray(overlayStore[k].features)) overlayStore[k].features = [];
    return overlayStore[k];
}

function setOverlayPayloadForStandort(nummer, payload) {
    overlayStore[normalizeStandortNummer(nummer)] = {
        features: Array.isArray(payload?.features) ? payload.features : [],
        updatedAt: payload?.updatedAt || null,
        updatedBy: payload?.updatedBy || null
    };
}

function getOverlayStorageSnapshot() { return JSON.stringify(overlayStore); }
function persistOverlayStorageSnapshot(s) { localStorage.setItem(OVERLAY_STORAGE_KEY, s); }
function loadOverlayStorageSnapshot() {
    const raw = localStorage.getItem(OVERLAY_STORAGE_KEY);
    if (!raw) return {};
    try { const p = JSON.parse(raw); return p && typeof p === 'object' ? p : {}; }
    catch { return {}; }
}

// Feature description (for element list)
function describeFeature(f) {
    const p = f?.properties || {};
    if (p.overlayType === 'anfahrt') {
        if (p.routeType === 'hauptzufahrt') return { icon: '🔴', label: 'Hauptzufahrt', color: p.color };
        if (p.routeType === 'alternativ')   return { icon: '🟠', label: 'Alternative Zufahrt', color: p.color };
        return { icon: '📍', label: p.label || 'Freie Route', color: p.color };
    }
    if (p.overlayType === 'icon') {
        if (p.iconType === 'schranke') return { icon: '⛔', label: 'Schranke', color: p.color };
        if (p.iconType === 'tresor')   return { icon: '🔐', label: 'Schlüsseltresor', color: p.color };
        if (p.iconType === 'hinweis')  return { icon: '💬', label: (p.note || 'Hinweis').substring(0, 35), color: p.color };
    }
    if (p.overlayType === 'zone' || p.overlayType === 'gefahrenzone') {
        if (p.zoneType === 'eisabfall') return { icon: '⚠️', label: 'Eisabfallzone', color: p.color };
        return { icon: '📐', label: p.note || 'Zone', color: p.color };
    }
    if (p.overlayType === 'kreis') {
        if (p.zoneType === 'eisabfall') return { icon: '⚠️', label: 'Eisabfallzone (Kreis)', color: p.color };
        return { icon: '⭕', label: p.note || 'Kreis-Zone', color: p.color };
    }
    if (p.overlayType === 'pfad') {
        const ss = p.strokeStyle || 'solid';
        return { icon: PFAD_STYLE_ICONS[ss] || '━', label: PFAD_STYLE_LABELS[ss] || 'Pfad', color: p.color };
    }
    return { icon: '📌', label: 'Element', color: p.color || '#94a3b8' };
}

function getRouteLabel(rt) {
    if (rt === 'hauptzufahrt') return 'Hauptzufahrt';
    if (rt === 'alternativ') return 'Alternative Zufahrt';
    return 'Freie Route';
}

function getIconTypeForTool(t) {
    if (t === 'schranke') return 'schranke';
    if (t === 'tresor') return 'tresor';
    return 'hinweis';
}

function getRouteTypeForTool(t) {
    if (t === 'hauptzufahrt') return 'hauptzufahrt';
    if (t === 'alternativ') return 'alternativ';
    return 'custom';
}

function getZoneTypeForTool(t) {
    if (t === 'eisabfall_poly' || t === 'eisabfall_kreis') return 'eisabfall';
    return 'custom';
}

// ─── SUPABASE SYNC ──────────────────────────────────────

function getSupabaseConfig() {
    const c = window.__SUPABASE_CONFIG__;
    if (!c || typeof c !== 'object' || !c.url || !c.anonKey || !c.table) return null;
    return c;
}

async function initOverlaySyncClient() {
    const cfg = getSupabaseConfig();
    if (!cfg || typeof window.supabase === 'undefined') { overlaySyncClient = null; return; }
    overlaySyncClient = window.supabase.createClient(cfg.url, cfg.anonKey);
}

async function fetchAllOverlaysRemote() {
    if (!overlaySyncClient) return null;
    const cfg = getSupabaseConfig();
    if (!cfg) return null;
    const { data, error } = await overlaySyncClient.from(cfg.table).select('standort_nummer, features, updated_at, updated_by');
    if (error) { console.error('Overlay Sync fetch failed', error); return null; }
    const store = {};
    (data || []).forEach(r => {
        store[normalizeStandortNummer(r.standort_nummer)] = {
            features: Array.isArray(r.features) ? r.features : [],
            updatedAt: r.updated_at || null,
            updatedBy: r.updated_by || null
        };
    });
    return store;
}

async function saveOverlaysRemote(nummer, payload) {
    if (!overlaySyncClient) return false;
    const cfg = getSupabaseConfig();
    if (!cfg) return false;
    const { error } = await overlaySyncClient.from(cfg.table).upsert({
        standort_nummer: normalizeStandortNummer(nummer),
        features: payload.features,
        updated_at: payload.updatedAt,
        updated_by: payload.updatedBy || 'gui'
    }, { onConflict: 'standort_nummer' });
    if (error) { console.error('Overlay Sync save failed', error); return false; }
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
        }).subscribe();
}

function subscribeLocalOverlayChanges() {
    window.addEventListener('storage', e => {
        if (e.key !== OVERLAY_STORAGE_KEY || !e.newValue) return;
        try {
            const p = JSON.parse(e.newValue);
            overlayStore = p && typeof p === 'object' ? p : {};
            if (overlayEditMode && overlayEditingStandortNummer) renderEditOverlaysForStandort(overlayEditingStandortNummer);
            refreshVisibleOverlays();
        } catch { /* ignore */ }
    });
}

function startLocalOverlayPolling() {
    if (overlayPollingTimer) clearInterval(overlayPollingTimer);
    let last = getOverlayStorageSnapshot();
    overlayPollingTimer = setInterval(() => {
        const snap = localStorage.getItem(OVERLAY_STORAGE_KEY) || '{}';
        if (snap === last) return;
        last = snap;
        try {
            const p = JSON.parse(snap);
            overlayStore = p && typeof p === 'object' ? p : {};
            if (overlayEditMode && overlayEditingStandortNummer) renderEditOverlaysForStandort(overlayEditingStandortNummer);
            refreshVisibleOverlays();
        } catch { /* ignore */ }
    }, 4000);
}

async function loadOverlayStore() {
    overlayStore = loadOverlayStorageSnapshot();
    const remote = await fetchAllOverlaysRemote();
    if (remote) {
        overlayStore = remote;
        persistOverlayStorageSnapshot(JSON.stringify(overlayStore));
        setSyncStatus('Sync aktiv', true);
    } else {
        setSyncStatus('Lokal', false);
    }
}

// ─── COLOR PALETTE ───────────────────────────────────────

function setActiveColor(color) {
    overlayActiveColor = color;
    updatePaletteUI();
}

function updatePaletteUI() {
    if (!ovPanelEl) return;
    ovPanelEl.querySelectorAll('.ov-swatch').forEach(el => {
        el.classList.toggle('active', el.dataset.color === overlayActiveColor);
    });
    const customInput = document.getElementById('ovCustomColorInput');
    if (customInput) {
        customInput.value = overlayActiveColor;
        const isCustom = !OVERLAY_PALETTE.includes(overlayActiveColor);
        const customLabel = document.getElementById('ovCustomColorLabel');
        if (customLabel) customLabel.classList.toggle('active', isCustom);
    }
}

// ─── MARKER ICONS ────────────────────────────────────────

function getOverlayMarkerIcon(iconType, color, note) {
    if (iconType === 'hinweis') {
        const bc = color || '#eab308';
        const title = note ? note.replace(/"/g, '&quot;').slice(0, 80) : 'Hinweis';
        return L.divIcon({
            html: `<div class="overlay-poi-marker overlay-poi-marker-hinweis" style="border-color:${bc}" title="${title}">💬</div>`,
            className: 'overlay-poi-icon-wrap', iconSize: [28, 28], iconAnchor: [14, 14]
        });
    }
    const meta = OVERLAY_ICONS[iconType] || OVERLAY_ICONS.schranke;
    return L.divIcon({
        html: `<div class="overlay-poi-marker" style="border-color:${color || '#ef4444'}" title="${meta.label}">${meta.symbol}</div>`,
        className: 'overlay-poi-icon-wrap', iconSize: [24, 24], iconAnchor: [12, 12]
    });
}

// ─── FEATURE ↔ LAYER ────────────────────────────────────

function createLayerFromFeature(feature) {
    if (!feature || feature.type !== 'Feature' || !feature.geometry) return null;
    const { geometry, properties: p = {} } = feature;

    // === Point (Marker or Circle) ===
    if (geometry.type === 'Point' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
        const [lon, lat] = geometry.coordinates;

        // Circle zone (Point with radius)
        if (p.overlayType === 'kreis') {
            const radius = p.radius || 100;
            const color = p.color || '#8b5cf6';
            const note = p.note || '';
            const zoneType = p.zoneType || 'custom';
            const circle = L.circle([lat, lon], {
                radius, color, fillColor: color, fillOpacity: 0.18, weight: 2, dashArray: '6, 4', opacity: 0.9
            });
            circle.feature = { ...feature, properties: { ...p, overlayType: 'kreis', zoneType } };
            const label = zoneType === 'eisabfall' ? '⚠️ Eisabfallzone' : (note || 'Kreis-Zone');
            circle.bindTooltip(label, { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
            return circle;
        }

        // Marker (Icon)
        const iconType = p.iconType || 'schranke';
        const color = p.color || '#ef4444';
        const note = p.note || '';
        const marker = L.marker([lat, lon], { icon: getOverlayMarkerIcon(iconType, color, note) });
        marker.feature = { ...feature, properties: { ...p, overlayType: 'icon', iconType } };

        if (iconType === 'hinweis') {
            const tt = note || 'Hinweis';
            marker.bindTooltip(tt, { direction: 'top', offset: [0, -14], className: 'overlay-hinweis-tooltip', sticky: false });
            if (note) marker.bindPopup(
                `<div class="overlay-hinweis-popup"><strong>💬 Hinweis</strong><p>${note.replace(/\n/g, '<br>')}</p></div>`,
                { maxWidth: 260, className: 'overlay-hinweis-popup-wrap' }
            );
        } else {
            marker.bindTooltip(OVERLAY_ICONS[iconType]?.label || 'POI', { direction: 'top', offset: [0, -10] });
        }
        return marker;
    }

    // === LineString (Pfad — custom styled path with optional arrowheads) ===
    if (geometry.type === 'LineString' && p.overlayType === 'pfad' && Array.isArray(geometry.coordinates)) {
        const latlngs = geometry.coordinates.filter(c => Array.isArray(c) && c.length >= 2).map(c => [c[1], c[0]]);
        if (latlngs.length < 2) return null;
        const color = p.color || '#0ea5e9';
        const strokeStyle = p.strokeStyle || 'solid';
        const polyline = createPfadPolyline(latlngs, color, strokeStyle);
        polyline.feature = { ...feature, properties: { ...p, overlayType: 'pfad', strokeStyle } };
        polyline.bindTooltip(PFAD_STYLE_LABELS[strokeStyle] || 'Pfad', { sticky: true, className: 'overlay-route-tooltip' });
        return polyline;
    }

    // === LineString (Route) ===
    if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
        const latlngs = geometry.coordinates.filter(c => Array.isArray(c) && c.length >= 2).map(c => [c[1], c[0]]);
        if (latlngs.length < 2) return null;
        const color = p.color || '#dc2626';
        const routeType = p.routeType || 'custom';
        const polyline = L.polyline(latlngs, { color, weight: 4, dashArray: '8, 8', opacity: 0.9, lineCap: 'round' });
        polyline.feature = { ...feature, properties: { ...p, overlayType: 'anfahrt', routeType } };
        polyline.bindTooltip(getRouteLabel(routeType), { sticky: true, className: 'overlay-route-tooltip' });
        return polyline;
    }

    // === Polygon (Zone) ===
    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates) && geometry.coordinates[0]) {
        const latlngs = geometry.coordinates[0].filter(c => Array.isArray(c) && c.length >= 2).map(c => [c[1], c[0]]);
        if (latlngs.length < 3) return null;
        const color = p.color || '#8b5cf6';
        const note = p.note || '';
        const ot = p.overlayType || 'zone';
        const zoneType = p.zoneType || 'custom';
        const polygon = L.polygon(latlngs, { color, fillColor: color, fillOpacity: 0.18, weight: 2, dashArray: '6, 4', opacity: 0.9 });
        polygon.feature = { ...feature, properties: { ...p, overlayType: ot === 'gefahrenzone' ? 'zone' : ot, zoneType } };
        const label = zoneType === 'eisabfall' ? '⚠️ Eisabfallzone' : (note || 'Zone');
        polygon.bindTooltip(label, { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
        return polygon;
    }

    return null;
}

function updateFeatureFromLayer(layer) {
    if (!layer) return null;

    if (layer instanceof L.Marker) {
        const ll = layer.getLatLng();
        const iconType = layer.feature?.properties?.iconType || 'schranke';
        const color = layer.feature?.properties?.color || overlayActiveColor;
        const note = layer.feature?.properties?.note || '';
        layer.feature = {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
            properties: { overlayType: 'icon', iconType, color, ...(note ? { note } : {}) }
        };
        layer.setIcon(getOverlayMarkerIcon(iconType, color, note));
        return layer.feature;
    }

    if (layer instanceof L.Circle) {
        const ll = layer.getLatLng();
        const color = layer.feature?.properties?.color || overlayActiveColor;
        const note = layer.feature?.properties?.note || '';
        const zoneType = layer.feature?.properties?.zoneType || 'custom';
        layer.feature = {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
            properties: { overlayType: 'kreis', zoneType, radius: layer.getRadius(), color, ...(note ? { note } : {}) }
        };
        if (typeof layer.setStyle === 'function') layer.setStyle({ color, fillColor: color });
        return layer.feature;
    }

    if (layer instanceof L.Polygon) {
        const coords = (layer.getLatLngs()[0] || []).filter(pt => pt && typeof pt.lat === 'number').map(pt => [pt.lng, pt.lat]);
        const color = layer.feature?.properties?.color || overlayActiveColor;
        const note = layer.feature?.properties?.note || '';
        const zoneType = layer.feature?.properties?.zoneType || 'custom';
        const ot = layer.feature?.properties?.overlayType || 'zone';
        layer.feature = {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [coords] },
            properties: { overlayType: ot === 'gefahrenzone' ? 'zone' : ot, zoneType, color, ...(note ? { note } : {}) }
        };
        if (typeof layer.setStyle === 'function') layer.setStyle({ color, fillColor: color });
        return layer.feature;
    }

    if (layer instanceof L.Polyline) {
        const coords = layer.getLatLngs().filter(pt => pt && typeof pt.lat === 'number').map(pt => [pt.lng, pt.lat]);
        const color = layer.feature?.properties?.color || overlayActiveColor;
        const ot = layer.feature?.properties?.overlayType;
        if (ot === 'pfad') {
            const strokeStyle = layer.feature?.properties?.strokeStyle || 'solid';
            layer.feature = {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: coords },
                properties: { overlayType: 'pfad', strokeStyle, color }
            };
            const styleOpts = PFAD_STROKE_STYLES[strokeStyle] || PFAD_STROKE_STYLES.solid;
            if (typeof layer.setStyle === 'function') layer.setStyle({ color, ...styleOpts });
            refreshArrowStyle(layer, strokeStyle, color);
            return layer.feature;
        }
        const routeType = layer.feature?.properties?.routeType || 'custom';
        layer.feature = {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: { overlayType: 'anfahrt', routeType, color }
        };
        if (typeof layer.setStyle === 'function') layer.setStyle({ color });
        return layer.feature;
    }

    return null;
}

function buildPayloadFromEditLayerGroup() {
    const features = [];
    overlayEditGroup.eachLayer(layer => {
        const f = updateFeatureFromLayer(layer);
        if (f) features.push(f);
    });
    return { features, updatedAt: new Date().toISOString(), updatedBy: 'gui' };
}

// ─── LAYER RENDERING ─────────────────────────────────────

function renderDisplayOverlaysForStandort(nummer) {
    if (!overlayDisplayGroup) return;
    overlayDisplayGroup.clearLayers();
    if (!nummer) return;
    const payload = getOverlayPayloadForStandort(nummer);
    payload.features.forEach(feature => {
        const layer = createLayerFromFeature(feature);
        if (!layer) return;

        // Hinweis: permanent compact label, click to edit
        if (layer instanceof L.Marker && feature.properties?.iconType === 'hinweis') {
            const note = feature.properties?.note || 'Hinweis';
            layer.unbindTooltip();
            layer.unbindPopup();
            layer.bindTooltip(note, {
                permanent: true, direction: 'right', offset: [16, 0],
                className: 'overlay-hinweis-permanent'
            });
            layer.on('click', () => beginEditExistingHinweis(layer, nummer));
        }

        overlayDisplayGroup.addLayer(layer);
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
        attachDeleteHandler(layer);
        overlayEditGroup.addLayer(layer);
    });
    renderElementList();
}

function attachDeleteHandler(layer) {
    layer.on('dblclick', async () => {
        if (!overlayEditMode) return;
        pushUndo();
        overlayEditGroup.removeLayer(layer);
        await saveEditedOverlays();
        renderElementList();
    });
}

function ensureOverlayCollections() {
    if (!leafletMap) return;
    if (!overlayDisplayGroup) overlayDisplayGroup = L.layerGroup().addTo(leafletMap);
    if (!overlayEditGroup) { overlayEditGroup = new L.FeatureGroup(); leafletMap.addLayer(overlayEditGroup); }
}

// ─── STANDORT RESOLUTION ─────────────────────────────────

function getSingleVisibleStandortOnMap() {
    if (!leafletMap || leafletMap.getZoom() < OVERLAY_MIN_ZOOM) return null;
    const bounds = leafletMap.getBounds();
    const visible = getFilteredStandorte().filter(s => s.lat && s.lon && bounds.contains([s.lat, s.lon]));
    return visible.length === 1 ? visible[0] : null;
}

function resolveExclusiveStandort() {
    const filtered = getFilteredStandorte();
    if (filtered.length === 1) return { standort: filtered[0], source: 'list' };
    const ms = getSingleVisibleStandortOnMap();
    if (ms) return { standort: ms, source: 'map' };
    return { standort: null, source: null };
}

// ─── REFRESH & VISIBILITY ────────────────────────────────

function refreshExclusiveStandortContext() {
    const { standort } = resolveExclusiveStandort();
    const next = standort ? normalizeStandortNummer(standort.nummer) : null;

    if (next === overlayExclusiveStandortNummer) { updateSidebarState(); return; }
    overlayExclusiveStandortNummer = next;

    if (!overlayExclusiveStandortNummer && overlayEditMode) setOverlayEditMode(false);
    if (standort && typeof highlightListItem === 'function') highlightListItem(standort.nummer);

    if (overlayEditMode && overlayEditingStandortNummer) {
        renderEditOverlaysForStandort(overlayEditingStandortNummer);
        renderDisplayOverlaysForStandort(overlayEditingStandortNummer);
    } else if (overlayExclusiveStandortNummer) {
        renderDisplayOverlaysForStandort(overlayExclusiveStandortNummer);
    } else if (overlayDisplayGroup) {
        overlayDisplayGroup.clearLayers();
    }

    updateSidebarState();
}

function refreshVisibleOverlays() {
    refreshExclusiveStandortContext();
    if (!overlayDisplayGroup) return;
    if (overlayEditMode && overlayEditingStandortNummer) {
        renderDisplayOverlaysForStandort(overlayEditingStandortNummer);
        return;
    }
    if (overlayExclusiveStandortNummer) renderDisplayOverlaysForStandort(overlayExclusiveStandortNummer);
    else overlayDisplayGroup.clearLayers();
}

// ─── SAVE & UNDO ─────────────────────────────────────────

async function saveOverlayPayload(nummer, payload) {
    setOverlayPayloadForStandort(nummer, payload);
    persistOverlayStorageSnapshot(getOverlayStorageSnapshot());
    const ok = await saveOverlaysRemote(nummer, payload);
    if (!ok && overlaySyncClient) setSyncStatus('Sync-Fehler', false);
}

async function saveEditedOverlays() {
    if (!overlayEditMode || !overlayEditingStandortNummer) return;
    const payload = buildPayloadFromEditLayerGroup();
    await saveOverlayPayload(overlayEditingStandortNummer, payload);
    renderDisplayOverlaysForStandort(overlayEditingStandortNummer);
    renderElementList();
}

function pushUndo() {
    const payload = buildPayloadFromEditLayerGroup();
    overlayUndoStack.push(JSON.stringify(payload));
    if (overlayUndoStack.length > OVERLAY_MAX_UNDO) overlayUndoStack.shift();
    updateUndoBtn();
}

async function performUndo() {
    if (overlayUndoStack.length === 0) return;
    const snap = JSON.parse(overlayUndoStack.pop());
    await saveOverlayPayload(overlayEditingStandortNummer, snap);
    overlayEditGroup.clearLayers();
    renderEditOverlaysForStandort(overlayEditingStandortNummer);
    renderDisplayOverlaysForStandort(overlayEditingStandortNummer);
    updateUndoBtn();
}

function updateUndoBtn() {
    const btn = document.getElementById('ovUndoBtn');
    if (btn) btn.disabled = overlayUndoStack.length === 0;
}

// ─── EDIT MODE ───────────────────────────────────────────

function setOverlayEditMode(enabled) {
    overlayEditMode = enabled;
    if (!enabled) {
        stopCurrentDrawHandler();
        overlayActiveTool = null;
        overlayEditingStandortNummer = null;
        overlayUndoStack = [];
        if (overlayEditGroup) overlayEditGroup.clearLayers();
        refreshVisibleOverlays();
        updateSidebarState();
        return;
    }
    if (!overlayExclusiveStandortNummer) { overlayEditMode = false; updateSidebarState(); return; }
    overlayEditingStandortNummer = overlayExclusiveStandortNummer;
    overlayUndoStack = [];
    renderEditOverlaysForStandort(overlayEditingStandortNummer);
    renderDisplayOverlaysForStandort(overlayEditingStandortNummer);
    updateSidebarState();
}

function toggleOverlayEditMode() {
    if (!overlayExclusiveStandortNummer && !overlayEditMode) return;
    setOverlayEditMode(!overlayEditMode);
}

function closeOverlayEditMode() { if (overlayEditMode) setOverlayEditMode(false); }

function stopCurrentDrawHandler() {
    if (overlayCurrentDrawHandler) { overlayCurrentDrawHandler.disable(); overlayCurrentDrawHandler = null; }
}

// ─── TOOL MANAGEMENT ─────────────────────────────────────

function activateTool(toolId) {
    if (overlayActiveTool === toolId) { deactivateCurrentTool(); return; }
    deactivateCurrentTool();
    overlayActiveTool = toolId;
    const dc = OVERLAY_DEFAULT_COLORS[toolId];
    if (dc) setActiveColor(dc);
    if (!overlayEditMode) setOverlayEditMode(true);
    if (!overlayEditMode) return;

    switch (toolId) {
        case 'hauptzufahrt': case 'alternativ': case 'route_custom':
            startLineDraw(); break;
        case 'schranke': case 'tresor': case 'hinweis':
            startMarkerDraw(getIconTypeForTool(toolId)); break;
        case 'eisabfall_poly': case 'zone_poly':
            startPolygonDraw(); break;
        case 'eisabfall_kreis': case 'zone_kreis':
            startCircleDraw(); break;
        case 'pfad_solid':      startPfadDraw('solid');      break;
        case 'pfad_dash':       startPfadDraw('dash');       break;
        case 'pfad_dot':        startPfadDraw('dot');        break;
        case 'pfad_arrow':      startPfadDraw('arrow');      break;
        case 'pfad_arrow_many': startPfadDraw('arrow_many'); break;
    }
    updateToolBtnStates();
}

function deactivateCurrentTool() {
    stopCurrentDrawHandler();
    overlayActiveTool = null;
    updateToolBtnStates();
}

function startLineDraw() {
    stopCurrentDrawHandler();
    overlayCurrentDrawHandler = new L.Draw.Polyline(leafletMap, {
        shapeOptions: { color: overlayActiveColor, weight: 4, dashArray: '8, 8', opacity: 0.9 }
    });
    overlayCurrentDrawHandler.enable();
}

function startMarkerDraw(iconType) {
    stopCurrentDrawHandler();
    overlayCurrentDrawHandler = new L.Draw.Marker(leafletMap, {
        icon: getOverlayMarkerIcon(iconType, overlayActiveColor)
    });
    overlayCurrentDrawHandler.enable();
}

function startPolygonDraw() {
    stopCurrentDrawHandler();
    overlayCurrentDrawHandler = new L.Draw.Polygon(leafletMap, {
        shapeOptions: { color: overlayActiveColor, fillColor: overlayActiveColor, fillOpacity: 0.18, weight: 2, dashArray: '6, 4' },
        showArea: false
    });
    overlayCurrentDrawHandler.enable();
}

function startCircleDraw() {
    stopCurrentDrawHandler();
    overlayCurrentDrawHandler = new L.Draw.Circle(leafletMap, {
        shapeOptions: { color: overlayActiveColor, fillColor: overlayActiveColor, fillOpacity: 0.18, weight: 2, dashArray: '6, 4' }
    });
    overlayCurrentDrawHandler.enable();
}

function startPfadDraw(strokeStyle) {
    stopCurrentDrawHandler();
    const styleOpts = PFAD_STROKE_STYLES[strokeStyle] || PFAD_STROKE_STYLES.solid;
    overlayCurrentDrawHandler = new L.Draw.Polyline(leafletMap, {
        shapeOptions: {
            color: overlayActiveColor,
            weight: styleOpts.weight,
            dashArray: styleOpts.dashArray,
            lineCap: styleOpts.lineCap,
            lineJoin: styleOpts.lineJoin,
            opacity: 0.9
        }
    });
    overlayCurrentDrawHandler.enable();
}

// ─── PFAD RENDERING HELPERS ───────────────────────────────

function createPfadPolyline(latlngs, color, strokeStyle) {
    const styleOpts = PFAD_STROKE_STYLES[strokeStyle] || PFAD_STROKE_STYLES.solid;
    const polyline = L.polyline(latlngs, {
        color,
        weight:    styleOpts.weight,
        dashArray: styleOpts.dashArray,
        lineCap:   styleOpts.lineCap,
        lineJoin:  styleOpts.lineJoin,
        opacity:   0.9
    });
    if (strokeStyle === 'arrow' || strokeStyle === 'arrow_many') {
        applyArrowheads(polyline, strokeStyle, color);
    }
    return polyline;
}

function applyArrowheads(polyline, strokeStyle, color) {
    // Each polyline gets a unique marker id so independent re-styling is possible
    if (!polyline._ovMarkerId) {
        polyline._ovMarkerId = `ovarrow_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    const markerId = polyline._ovMarkerId;

    function inject() {
        const path = polyline._path;
        if (!path) return;
        const svgRoot = path.ownerSVGElement || path.closest('svg');
        if (!svgRoot) return;

        let defs = svgRoot.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svgRoot.insertBefore(defs, svgRoot.firstChild);
        }

        // Remove stale marker for this polyline
        const existing = svgRoot.getElementById(markerId);
        if (existing) existing.remove();

        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', markerId);
        marker.setAttribute('markerWidth', '6');
        marker.setAttribute('markerHeight', '6');
        marker.setAttribute('refX', '5');
        marker.setAttribute('refY', '3');
        marker.setAttribute('orient', 'auto');
        marker.setAttribute('markerUnits', 'strokeWidth');

        const arrowHead = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrowHead.setAttribute('points', '0,0 6,3 0,6 1.5,3');
        arrowHead.setAttribute('fill', color);
        marker.appendChild(arrowHead);
        defs.appendChild(marker);

        path.setAttribute('marker-end', `url(#${markerId})`);
        if (strokeStyle === 'arrow_many') {
            path.setAttribute('marker-mid', `url(#${markerId})`);
        } else {
            path.removeAttribute('marker-mid');
        }
    }

    // Execute after layer is in DOM
    polyline.on('add', inject);
    if (polyline._path) inject(); // already rendered
    // Re-apply after any style redraw (Leaflet may recreate _path on canvas switch)
    polyline.on('redraw', inject);
}

function refreshArrowStyle(polyline, strokeStyle, color) {
    if (!polyline) return;
    if (strokeStyle === 'arrow' || strokeStyle === 'arrow_many') {
        applyArrowheads(polyline, strokeStyle, color);
    } else {
        // Remove arrowheads if style was changed away from arrow
        const path = polyline._path;
        if (path) {
            path.removeAttribute('marker-end');
            path.removeAttribute('marker-mid');
            if (polyline._ovMarkerId) {
                const svgRoot = path.ownerSVGElement || path.closest('svg');
                const existing = svgRoot?.getElementById(polyline._ovMarkerId);
                if (existing) existing.remove();
            }
        }
    }
}

function updateToolBtnStates() {
    if (!ovPanelEl) return;
    ovPanelEl.querySelectorAll('[data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === overlayActiveTool);
    });
}

// ─── CLEAR ALL ───────────────────────────────────────────

async function clearAllOverlays() {
    if (!overlayEditMode || !overlayEditingStandortNummer) return;
    pushUndo();
    overlayEditGroup.clearLayers();
    await saveEditedOverlays();
}

// ─── SIDEBAR HTML ────────────────────────────────────────

function buildSidebarHTML() {
    const paletteSwatches = OVERLAY_PALETTE.map(c =>
        `<button type="button" class="ov-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`
    ).join('');

    // Returns HTML for the Leaflet control container (just the trigger button).
    // The full panel is built separately in buildPanelHTML() and appended to <body>.
    return `
    <div class="ov-wrap">
        <div class="leaflet-bar ov-bar ov-hidden" id="ovBar">
            <button type="button" id="ovTrigger" class="ov-trigger-btn" data-tooltip="Kartenebenen" title="Kartenebenen">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
                           m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
            </button>
        </div>
    </div>`;
}

// Panel HTML — created once and appended to <body> so it escapes overflow:hidden map wrappers.
function buildPanelHTML() {
    const paletteSwatches = OVERLAY_PALETTE.map(c =>
        `<button type="button" class="ov-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`
    ).join('');

    return `
    <div id="ovPanel" class="ov-panel ov-hidden">
        <!-- Header -->
        <div class="ov-header">
            <div class="ov-header-info">
                <div class="ov-header-kicker">Standort-Overlay</div>
                <div id="ovEditStation" class="ov-header-station">—</div>
                <div id="ovEditName" class="ov-header-name"></div>
            </div>
            <button type="button" id="ovCloseEdit" class="ov-close-btn" title="Schließen">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>

        <!-- Body (scrollable) -->
        <div class="ov-body">
            <!-- ANFAHRT -->
            <div class="ov-section">
                <div class="ov-section-title">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                    Anfahrt
                    <span id="ovBadgeAnfahrt" class="ov-badge ov-hidden">0</span>
                </div>
                <div class="ov-tool-grid">
                    <button type="button" class="ov-tool-btn" data-tool="hauptzufahrt">
                        <span class="ov-color-dot" style="background:#ef4444"></span>
                        <span class="ov-tool-text">Hauptzufahrt</span>
                    </button>
                    <button type="button" class="ov-tool-btn" data-tool="alternativ">
                        <span class="ov-color-dot" style="background:#f97316"></span>
                        <span class="ov-tool-text">Alternative</span>
                    </button>
                    <button type="button" class="ov-tool-btn" data-tool="route_custom" style="grid-column: span 2;">
                        <span class="ov-color-dot" style="background:#3b82f6"></span>
                        <span class="ov-tool-text">Freie Route</span>
                    </button>
                </div>
            </div>

            <!-- PFADE & PFEILE -->
            <div class="ov-section">
                <div class="ov-section-title">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                    Pfade &amp; Pfeile
                    <span id="ovBadgePfad" class="ov-badge ov-hidden">0</span>
                </div>
                <div class="ov-section-hint">Linien mit Strichstärke / Pfeile für Richtungsangaben.</div>
                <div class="ov-tool-grid">
                    <button type="button" class="ov-tool-btn" data-tool="pfad_solid" title="Durchgehende Linie">
                        <svg class="ov-tool-icon" width="20" height="14" viewBox="0 0 20 14" fill="none">
                            <line x1="1" y1="7" x2="19" y2="7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                        </svg>
                        <span class="ov-tool-text">Solide</span>
                    </button>
                    <button type="button" class="ov-tool-btn" data-tool="pfad_dash" title="Gestrichelte Linie">
                        <svg class="ov-tool-icon" width="20" height="14" viewBox="0 0 20 14" fill="none">
                            <line x1="1" y1="7" x2="19" y2="7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="5,3"/>
                        </svg>
                        <span class="ov-tool-text">Gestrichelt</span>
                    </button>
                    <button type="button" class="ov-tool-btn" data-tool="pfad_dot" title="Gepunktete Linie">
                        <svg class="ov-tool-icon" width="20" height="14" viewBox="0 0 20 14" fill="none">
                            <line x1="1" y1="7" x2="19" y2="7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0.1,4"/>
                        </svg>
                        <span class="ov-tool-text">Gepunktet</span>
                    </button>
                    <button type="button" class="ov-tool-btn" data-tool="pfad_arrow" title="Linie mit Pfeil am Ende">
                        <svg class="ov-tool-icon" width="20" height="14" viewBox="0 0 20 14" fill="none">
                            <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            <polygon points="11,3 19,7 11,11 13.5,7" fill="currentColor"/>
                        </svg>
                        <span class="ov-tool-text">Pfeil</span>
                    </button>
                    <button type="button" class="ov-tool-btn" data-tool="pfad_arrow_many" style="grid-column: span 2;" title="Richtungspfeile entlang des Pfades">
                        <svg class="ov-tool-icon" width="36" height="14" viewBox="0 0 36 14" fill="none">
                            <line x1="1" y1="7" x2="35" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            <polygon points="7,3 13,7 7,11 9,7" fill="currentColor"/>
                            <polygon points="19,3 25,7 19,11 21,7" fill="currentColor"/>
                            <polygon points="29,3 35,7 29,11 31,7" fill="currentColor"/>
                        </svg>
                        <span class="ov-tool-text">Richtungspfeile</span>
                    </button>
                </div>
            </div>

            <!-- MARKIERUNGEN -->
            <div class="ov-section">
                <div class="ov-section-title">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Markierungen
                    <span id="ovBadgeMarker" class="ov-badge ov-hidden">0</span>
                </div>
                <div class="ov-tool-grid">
                    <button type="button" class="ov-tool-btn" data-tool="schranke">
                        <svg class="ov-tool-icon" width="14" height="14" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M4.93 4.93l14.14 14.14"></path></svg>
                        <span class="ov-tool-text">Schranke</span>
                    </button>
                    <button type="button" class="ov-tool-btn" data-tool="tresor">
                        <svg class="ov-tool-icon" width="14" height="14" fill="none" stroke="#3b82f6" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path></svg>
                        <span class="ov-tool-text">Tresor</span>
                    </button>
                    <button type="button" class="ov-tool-btn" data-tool="hinweis" style="grid-column: span 2;">
                        <svg class="ov-tool-icon" width="14" height="14" fill="none" stroke="#eab308" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
                        <span class="ov-tool-text">Hinweis hinzufügen</span>
                    </button>
                </div>
            </div>

            <!-- ZONEN -->
            <div class="ov-section">
                <div class="ov-section-title">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path></svg>
                    Zonen
                    <span id="ovBadgeZone" class="ov-badge ov-hidden">0</span>
                </div>
                <div class="ov-tool-grid">
                    <button type="button" class="ov-tool-btn" data-tool="eisabfall_poly" style="grid-column: span 2;">
                        <svg class="ov-tool-icon" width="14" height="14" fill="none" stroke="#eab308" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                        <span class="ov-tool-text">Eisabfallzone</span>
                    </button>
                    <button type="button" class="ov-tool-btn" data-tool="zone_poly">
                        <svg class="ov-tool-icon" width="14" height="14" fill="none" stroke="#8b5cf6" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"></path></svg>
                        <span class="ov-tool-text">Polygon-Zone</span>
                    </button>
                    <button type="button" class="ov-tool-btn" data-tool="zone_kreis">
                        <svg class="ov-tool-icon" width="14" height="14" fill="none" stroke="#8b5cf6" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
                        <span class="ov-tool-text">Kreis-Zone</span>
                    </button>
                </div>
            </div>

            <!-- FARBE -->
            <div class="ov-section">
                <div class="ov-section-title">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485"/></svg>
                    Farbe
                </div>
                <div class="ov-section-hint">Aktive Farbe für das aktuell gewählte Werkzeug.</div>
                <div class="ov-palette">${paletteSwatches}</div>
                <div class="ov-custom-row">
                    <input type="color" id="ovCustomColorInput" value="#dc2626" class="ov-custom-input" title="Eigene Farbe" />
                    <span id="ovCustomColorLabel" class="ov-custom-label">Eigene Farbe</span>
                </div>
            </div>

            <!-- ELEMENTE -->
            <div class="ov-section">
                <div class="ov-section-title">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                    Elemente
                    <span id="ovBadgeTotal" class="ov-badge ov-hidden">0</span>
                </div>
                <div class="ov-section-hint">Doppelklick auf ein Objekt in der Karte oder lösche es hier.</div>
                <div id="ovElementList" class="ov-element-list">
                    <div class="ov-empty">Noch keine Elemente</div>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div class="ov-footer">
            <div class="ov-footer-actions">
                <button type="button" id="ovUndoBtn" class="ov-footer-btn" disabled title="Letzte Aktion rückgängig">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 10h10a5 5 0 010 10H9"/><path d="M3 10l4-4m-4 4l4 4"/></svg>
                    Rückgängig
                </button>
                <button type="button" id="ovClearBtn" class="ov-footer-btn danger" title="Alle Elemente löschen">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    Alle löschen
                </button>
            </div>
            <div id="ovSyncStatus" class="ov-sync-status">Lokal</div>
        </div>
    </div>`;
}

// ─── SIDEBAR UI UPDATE ───────────────────────────────────

function updateSidebarState() {
    if (!overlaySidebarEl) return;
    const bar     = overlaySidebarEl.querySelector('#ovBar');
    const trigger = overlaySidebarEl.querySelector('#ovTrigger');
    if (!bar) return;

    // No standort → hide trigger + panel
    if (!overlayExclusiveStandortNummer) {
        bar.classList.add('ov-hidden');
        if (ovPanelEl) ovPanelEl.classList.add('ov-hidden');
        return;
    }

    const s      = standorte.find(x => String(x.nummer) === overlayExclusiveStandortNummer);
    const stNum  = overlayExclusiveStandortNummer;
    const stName = s ? s.name : '';
    const tooltip = stName ? `${stNum} · ${stName}` : stNum;

    // Show trigger, update hover tooltip
    bar.classList.remove('ov-hidden');
    if (trigger) {
        trigger.setAttribute('data-tooltip', tooltip);
        trigger.setAttribute('title', tooltip);
        trigger.classList.toggle('active', overlayEditMode);
    }

    if (overlayEditMode) {
        if (ovPanelEl) {
            // Sync dark class with document
            ovPanelEl.classList.toggle('dark', document.documentElement.classList.contains('dark'));
            ovPanelEl.classList.remove('ov-hidden');
            positionOvPanel();
        }
        const stationEl = document.getElementById('ovEditStation');
        const nameEl    = document.getElementById('ovEditName');
        if (stationEl) stationEl.textContent = stNum;
        if (nameEl)    nameEl.textContent    = stName;
        renderElementList();
        updateUndoBtn();
        updatePaletteUI();
        updateToolBtnStates();
    } else {
        if (ovPanelEl) ovPanelEl.classList.add('ov-hidden');
    }
}

function setSyncStatus(msg, ok) {
    const el = document.getElementById('ovSyncStatus');
    if (el) {
        el.textContent = (ok ? '✓ ' : '') + msg;
        el.style.color = ok ? '#22c55e' : '';
    }
}

// ─── ELEMENT LIST ────────────────────────────────────────

function renderElementList() {
    if (!ovPanelEl || !overlayEditMode) return;
    const container = document.getElementById('ovElementList');
    if (!container) return;

    const features = [];
    overlayEditGroup.eachLayer(layer => {
        if (layer.feature) features.push({ feature: layer.feature, layer });
    });

    // Update badges
    let cAnfahrt = 0, cMarker = 0, cZone = 0, cPfad = 0;
    features.forEach(({ feature }) => {
        const ot = feature.properties?.overlayType;
        if (ot === 'anfahrt') cAnfahrt++;
        else if (ot === 'icon') cMarker++;
        else if (ot === 'zone' || ot === 'gefahrenzone' || ot === 'kreis') cZone++;
        else if (ot === 'pfad') cPfad++;
    });
    setBadge('ovBadgeAnfahrt', cAnfahrt);
    setBadge('ovBadgeMarker', cMarker);
    setBadge('ovBadgeZone', cZone);
    setBadge('ovBadgePfad', cPfad);
    setBadge('ovBadgeTotal', features.length);

    if (features.length === 0) {
        container.innerHTML = '<div class="ov-empty">Noch keine Elemente</div>';
        return;
    }

    container.innerHTML = features.map(({ feature }, idx) => {
        const d = describeFeature(feature);
        return `<div class="ov-element-row">
            <span class="ov-element-icon">${d.icon}</span>
            <span class="ov-element-color" style="background:${d.color || '#94a3b8'}"></span>
            <span class="ov-element-label">${escapeHTML(d.label)}</span>
            <button type="button" class="ov-element-delete" data-idx="${idx}" title="Löschen">
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>`;
    }).join('');

    // Attach delete handlers
    container.querySelectorAll('.ov-element-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const layers = [];
            overlayEditGroup.eachLayer(l => layers.push(l));
            if (layers[idx]) {
                pushUndo();
                overlayEditGroup.removeLayer(layers[idx]);
                await saveEditedOverlays();
            }
        });
    });
}

function setBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) { el.textContent = count; el.classList.remove('ov-hidden'); }
    else el.classList.add('ov-hidden');
}

function escapeHTML(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

// ─── DRAW EVENT HANDLER ──────────────────────────────────

function attachDrawListeners() {
    leafletMap.on(L.Draw.Event.CREATED, async (event) => {
        if (!overlayEditMode) return;
        const layer = event.layer;
        const tool = overlayActiveTool;
        const color = overlayActiveColor;

        stopCurrentDrawHandler();

        // ─── MARKER ───
        if (layer instanceof L.Marker) {
            const iconType = getIconTypeForTool(tool);

            if (iconType === 'hinweis') {
                ovModalPendingLayer = layer;
                ovModalPendingLayer.feature = {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [layer.getLatLng().lng, layer.getLatLng().lat] },
                    properties: { overlayType: 'icon', iconType: 'hinweis', color, note: '' }
                };
                showOverlayModal('hinweis');
                return;
            }

            layer.feature = {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [layer.getLatLng().lng, layer.getLatLng().lat] },
                properties: { overlayType: 'icon', iconType, color }
            };
            layer.setIcon(getOverlayMarkerIcon(iconType, color));
            layer.bindTooltip(OVERLAY_ICONS[iconType]?.label || 'POI', { direction: 'top', offset: [0, -10] });
            attachDeleteHandler(layer);
        }

        // ─── POLYLINE (Route or Pfad) ───
        else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
            const coords = layer.getLatLngs().map(p => [p.lng, p.lat]);

            if (tool && tool.startsWith('pfad_')) {
                // Custom styled path
                const strokeStyle = tool.replace('pfad_', '');
                const styleOpts = PFAD_STROKE_STYLES[strokeStyle] || PFAD_STROKE_STYLES.solid;
                layer.setStyle({
                    color,
                    weight: styleOpts.weight,
                    dashArray: styleOpts.dashArray,
                    lineCap: styleOpts.lineCap,
                    lineJoin: styleOpts.lineJoin
                });
                layer.feature = {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords },
                    properties: { overlayType: 'pfad', strokeStyle, color }
                };
                if (strokeStyle === 'arrow' || strokeStyle === 'arrow_many') {
                    applyArrowheads(layer, strokeStyle, color);
                }
                layer.bindTooltip(PFAD_STYLE_LABELS[strokeStyle] || 'Pfad', { sticky: true, className: 'overlay-route-tooltip' });
                attachDeleteHandler(layer);
            } else {
                // Standard route (anfahrt)
                const routeType = getRouteTypeForTool(tool);
                layer.setStyle({ color });
                layer.feature = {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords },
                    properties: { overlayType: 'anfahrt', routeType, color }
                };
                layer.bindTooltip(getRouteLabel(routeType), { sticky: true, className: 'overlay-route-tooltip' });
                attachDeleteHandler(layer);
            }
        }

        // ─── POLYGON (Zone) ───
        else if (layer instanceof L.Polygon) {
            const zoneType = getZoneTypeForTool(tool);
            layer.setStyle({ color, fillColor: color, fillOpacity: 0.18, weight: 2, dashArray: '6, 4' });

            if (zoneType === 'eisabfall') {
                const latlngs = (layer.getLatLngs()[0] || []).map(p => [p.lng, p.lat]);
                layer.feature = {
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [latlngs] },
                    properties: { overlayType: 'zone', zoneType: 'eisabfall', color, note: 'Eisabfallzone' }
                };
                layer.bindTooltip('⚠️ Eisabfallzone', { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
                attachDeleteHandler(layer);
            } else {
                // Need name input
                const latlngs = (layer.getLatLngs()[0] || []).map(p => [p.lng, p.lat]);
                ovModalPendingLayer = layer;
                ovModalPendingLayer.feature = {
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [latlngs] },
                    properties: { overlayType: 'zone', zoneType: 'custom', color, note: '' }
                };
                showOverlayModal('zone');
                return;
            }
        }

        // ─── CIRCLE (Zone) ───
        else if (layer instanceof L.Circle) {
            const zoneType = getZoneTypeForTool(tool);
            layer.setStyle({ color, fillColor: color, fillOpacity: 0.18, weight: 2, dashArray: '6, 4' });
            const ll = layer.getLatLng();

            if (zoneType === 'eisabfall') {
                layer.feature = {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
                    properties: { overlayType: 'kreis', zoneType: 'eisabfall', radius: layer.getRadius(), color, note: 'Eisabfallzone' }
                };
                layer.bindTooltip('⚠️ Eisabfallzone', { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
                attachDeleteHandler(layer);
            } else {
                ovModalPendingLayer = layer;
                ovModalPendingLayer.feature = {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
                    properties: { overlayType: 'kreis', zoneType: 'custom', radius: layer.getRadius(), color, note: '' }
                };
                showOverlayModal('zone');
                return;
            }
        }

        // Commit immediately (non-modal tools)
        pushUndo();
        overlayEditGroup.addLayer(layer);
        await saveEditedOverlays();
        deactivateCurrentTool();
    });

    leafletMap.on(L.Draw.Event.DRAWSTOP, () => { stopCurrentDrawHandler(); });
}

// ─── MODAL (Hinweis & Zone name input) ───────────────────

function showOverlayModal(mode) {
    ovModalMode = mode;
    const modal = document.getElementById('overlayInputModal');
    const title = document.getElementById('ovModalTitle');
    const presetRow = document.getElementById('ovModalPresetRow');
    const inputLabel = document.getElementById('ovModalInputLabel');
    const input = document.getElementById('ovModalInput');
    const preview = document.getElementById('ovModalPreview');
    const presetSelect = document.getElementById('ovModalPreset');

    if (!modal || !input) return;

    if (mode === 'hinweis' || mode === 'edit-hinweis') {
        title.textContent = '💬 Hinweis-Text';
        presetRow.classList.add('hidden');
        inputLabel.textContent = 'Hinweis-Text:';
        input.placeholder = 'z.B. Tor ist nur von 7–18 Uhr offen...';
        input.value = mode === 'edit-hinweis' ? (ovModalEditLayer?.feature?.properties?.note || '') : '';
    } else {
        title.textContent = '📐 Zone benennen';
        presetRow.classList.remove('hidden');
        inputLabel.textContent = 'Zonenname:';
        input.placeholder = 'z.B. Gefahrenbereich Nord';
        if (presetSelect) presetSelect.value = 'custom';
        input.value = mode === 'edit-zone' ? (ovModalEditLayer?.feature?.properties?.note || '') : '';
    }

    if (preview) preview.textContent = input.value || '(kein Text)';
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);
}

function onOverlayPresetChange() {
    const sel = document.getElementById('ovModalPreset');
    const input = document.getElementById('ovModalInput');
    if (!sel || !input) return;
    if (sel.value === 'eisabfall') {
        input.value = 'Eisabfallzone';
        setActiveColor('#eab308');
        updatePaletteUI();
    } else {
        input.value = '';
    }
    updateOverlayInputPreview();
    input.focus();
}

function updateOverlayInputPreview() {
    const t = document.getElementById('ovModalInput')?.value || '';
    const p = document.getElementById('ovModalPreview');
    if (p) p.textContent = t || '(kein Text)';
}

async function confirmOverlayInput() {
    const text = (document.getElementById('ovModalInput')?.value || '').trim();
    closeOverlayModal();

    // ─── EDIT existing
    if (ovModalMode === 'edit-hinweis' && ovModalEditLayer) {
        const layer = ovModalEditLayer;
        const nummer = ovModalEditNummer;
        layer.feature.properties.note = text;
        const color = layer.feature.properties.color || '#eab308';
        layer.setIcon(getOverlayMarkerIcon('hinweis', color, text));
        layer.unbindTooltip();
        layer.bindTooltip(text || 'Hinweis', {
            permanent: true, direction: 'right', offset: [16, 0], className: 'overlay-hinweis-permanent'
        });
        // Update in stored payload
        const payload = getOverlayPayloadForStandort(nummer);
        const ll = layer.getLatLng();
        const idx = payload.features.findIndex(f =>
            f.geometry?.type === 'Point' && f.properties?.iconType === 'hinweis' &&
            Math.abs(f.geometry.coordinates[0] - ll.lng) < 0.00005 &&
            Math.abs(f.geometry.coordinates[1] - ll.lat) < 0.00005
        );
        if (idx >= 0) {
            payload.features[idx].properties.note = text;
            payload.updatedAt = new Date().toISOString();
            payload.updatedBy = 'gui';
            await saveOverlayPayload(nummer, payload);
        }
        ovModalEditLayer = null;
        ovModalEditNummer = null;
        return;
    }

    if (ovModalMode === 'edit-zone' && ovModalEditLayer) {
        ovModalEditLayer.feature.properties.note = text;
        const label = text || 'Zone';
        ovModalEditLayer.unbindTooltip();
        ovModalEditLayer.bindTooltip(label, { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
        ovModalEditLayer = null;
        ovModalEditNummer = null;
        if (overlayEditMode) await saveEditedOverlays();
        return;
    }

    // ─── NEW placement
    if (!ovModalPendingLayer) return;
    const layer = ovModalPendingLayer;
    ovModalPendingLayer = null;

    layer.feature.properties.note = text;
    const color = layer.feature.properties.color || overlayActiveColor;
    const ot = layer.feature.properties.overlayType;

    if (ot === 'icon' && layer.feature.properties.iconType === 'hinweis') {
        layer.setIcon(getOverlayMarkerIcon('hinweis', color, text));
        layer.bindTooltip(text || 'Hinweis', { direction: 'top', offset: [0, -14], className: 'overlay-hinweis-tooltip' });
        if (text) layer.bindPopup(
            `<div class="overlay-hinweis-popup"><strong>💬 Hinweis</strong><p>${text.replace(/\n/g, '<br>')}</p></div>`,
            { maxWidth: 260, className: 'overlay-hinweis-popup-wrap' }
        );
    } else {
        // Zone
        const zoneType = layer.feature.properties.zoneType || 'custom';
        // Auto-detect preset selection
        const presetSel = document.getElementById('ovModalPreset');
        if (presetSel && presetSel.value === 'eisabfall') {
            layer.feature.properties.zoneType = 'eisabfall';
            layer.feature.properties.note = text || 'Eisabfallzone';
        }
        const label = layer.feature.properties.zoneType === 'eisabfall'
            ? '⚠️ Eisabfallzone'
            : (text || 'Zone');
        layer.bindTooltip(label, { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
    }

    attachDeleteHandler(layer);
    pushUndo();
    overlayEditGroup.addLayer(layer);
    await saveEditedOverlays();
    deactivateCurrentTool();
}

function cancelOverlayInput() {
    ovModalPendingLayer = null;
    ovModalEditLayer = null;
    ovModalEditNummer = null;
    closeOverlayModal();
    deactivateCurrentTool();
}

function closeOverlayModal() {
    const m = document.getElementById('overlayInputModal');
    if (m) m.classList.add('hidden');
    ovModalMode = null;
}

function beginEditExistingHinweis(layer, nummer) {
    ovModalEditLayer = layer;
    ovModalEditNummer = nummer;
    showOverlayModal('edit-hinweis');
}

// ─── SIDEBAR EVENT WIRING ────────────────────────────────

function attachSidebarListeners() {
    if (!overlaySidebarEl) return;

    // Trigger button (in Leaflet control container)
    const trigger = overlaySidebarEl.querySelector('#ovTrigger');
    if (trigger) trigger.addEventListener('click', () => {
        if (overlayEditMode) {
            setOverlayEditMode(false);
        } else {
            // Only activate edit mode when a standort is selected
            if (overlayExclusiveStandortNummer) setOverlayEditMode(true);
        }
    });

    // All panel listeners wired to ovPanelEl (body-appended portal)
    if (!ovPanelEl) return;

    // Close edit
    const closeEdit = document.getElementById('ovCloseEdit');
    if (closeEdit) closeEdit.addEventListener('click', () => setOverlayEditMode(false));

    // Tool buttons
    ovPanelEl.querySelectorAll('[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => activateTool(btn.dataset.tool));
    });

    // Palette swatches
    ovPanelEl.querySelectorAll('.ov-swatch').forEach(btn => {
        btn.addEventListener('click', () => setActiveColor(btn.dataset.color));
    });

    // Custom color
    const customInput = document.getElementById('ovCustomColorInput');
    if (customInput) {
        customInput.addEventListener('input', () => setActiveColor(customInput.value));
    }

    // Undo
    const undoBtn = document.getElementById('ovUndoBtn');
    if (undoBtn) undoBtn.addEventListener('click', performUndo);

    // Clear all
    const clearBtn = document.getElementById('ovClearBtn');
    if (clearBtn) clearBtn.addEventListener('click', clearAllOverlays);

    // Prevent clicks on the panel from propagating to the map (would close it in some themes)
    L.DomEvent.disableClickPropagation(ovPanelEl);
    L.DomEvent.disableScrollPropagation(ovPanelEl);
}

// ─── PANEL POSITIONING (body-portal approach) ────────────

function positionOvPanel() {
    if (!ovPanelEl || !overlaySidebarEl) return;
    const bar = overlaySidebarEl.querySelector('#ovBar');
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const margin = 12;
    const panelWidth = Math.min(360, Math.max(280, window.innerWidth - (margin * 2)));

    ovPanelEl.style.width = `${panelWidth}px`;
    ovPanelEl.style.maxWidth = `calc(100vw - ${margin * 2}px)`;
    ovPanelEl.style.maxHeight = `calc(100vh - ${margin * 2}px)`;

    const desiredLeft = rect.left - panelWidth - 8;
    const left = Math.max(margin, Math.min(desiredLeft, window.innerWidth - panelWidth - margin));

    ovPanelEl.style.left = `${left}px`;
    ovPanelEl.style.right = 'auto';

    const panelHeight = ovPanelEl.offsetHeight || Math.min(window.innerHeight - (margin * 2), 620);
    const desiredTop = rect.top;
    const top = Math.max(margin, Math.min(desiredTop, window.innerHeight - panelHeight - margin));
    ovPanelEl.style.top = `${top}px`;
}

// ─── SIDEBAR CREATION (Leaflet Control) ──────────────────

function createOverlaySidebar() {
    if (!leafletMap || overlaySidebarEl) return;

    const OverlayControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-control ov-control');
            container.innerHTML = buildSidebarHTML();
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);
            overlaySidebarEl = container;
            return container;
        }
    });

    overlayMapControl = new OverlayControl();
    leafletMap.addControl(overlayMapControl);

    // Build the panel, append to <body> to escape overflow:hidden map wrapper
    const panelWrapper = document.createElement('div');
    panelWrapper.innerHTML = buildPanelHTML();
    ovPanelEl = panelWrapper.querySelector('#ovPanel');
    if (ovPanelEl) {
        document.body.appendChild(ovPanelEl);
        // Mark dark mode if active
        if (document.documentElement.classList.contains('dark')) {
            ovPanelEl.classList.add('dark');
        }
    }

    attachSidebarListeners();
}

// ─── PUBLIC EVENT HOOKS ──────────────────────────────────

function onOverlayTargetStandortChanged() { refreshVisibleOverlays(); }
function onOverlayListOrMapChanged() { refreshVisibleOverlays(); }

// ─── INITIALIZATION ──────────────────────────────────────

async function initStandortOverlays() {
    if (!leafletMap) return;

    createOverlaySidebar();
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

    // Reposition panel on window resize (it's position:fixed on body)
    window.addEventListener('resize', () => { if (overlayEditMode) positionOvPanel(); });

    // Mirror dark class onto body-appended panel whenever html[class] changes
    new MutationObserver(() => {
        if (ovPanelEl) {
            ovPanelEl.classList.toggle('dark', document.documentElement.classList.contains('dark'));
        }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    updateSidebarState();
    refreshVisibleOverlays();
}

// ─── WINDOW EXPORTS ──────────────────────────────────────

window.initStandortOverlays = initStandortOverlays;
window.onOverlayTargetStandortChanged = onOverlayTargetStandortChanged;
window.onOverlayListOrMapChanged = onOverlayListOrMapChanged;
window.toggleOverlayEditMode = toggleOverlayEditMode;
window.closeOverlayEditMode = closeOverlayEditMode;

window.confirmOverlayInput = confirmOverlayInput;
window.cancelOverlayInput = cancelOverlayInput;
window.updateOverlayInputPreview = updateOverlayInputPreview;
window.onOverlayPresetChange = onOverlayPresetChange;
window.beginEditExistingHinweis = beginEditExistingHinweis;

// Legacy aliases (for any external references)
window.confirmHinweisNote = confirmOverlayInput;
window.cancelHinweisNote = cancelOverlayInput;
window.updateHinweisPreview = updateOverlayInputPreview;
