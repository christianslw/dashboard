// ─── Standort Overlays v2 ─────────────────────────────────────────────────────
// Anfahrt · Markers · Zones · Color palette · Undo · Backend + localStorage

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
    solid:      'minus',
    dash:       'dots-horizontal',
    dot:        'circle-small',
    arrow:      'arrow-right',
    arrow_many: 'ray-start-arrow'
};

const OVERLAY_ICONS = {
    schranke: { label: 'Schranke',        symbol: '\u26d4', mdi: 'boom-gate'      },
    tresor:   { label: 'Schl\u00fcsseltresor', symbol: '\ud83d\udd10', mdi: 'lock' },
    hinweis:  { label: 'Hinweis',         symbol: '\ud83d\udcac', mdi: 'comment-text' }
};

/** Returns a colored MDI icon element as an HTML string. */
function mdiIcon(name, color, sizePx) {
    let style = '';
    if (color || sizePx) {
        const parts = [];
        if (color)  parts.push(`color:${color}`);
        if (sizePx) parts.push(`font-size:${sizePx}px`);
        style = ` style="${parts.join(';')}"`;
    }
    return `<i class="mdi mdi-${name}"${style} aria-hidden="true"></i>`;
}

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

// Draw mode for anfahrt tools
let overlayAnfahrtDrawMode = 'snap'; // 'path' | 'freehand' | 'snap'

// Freehand draw cleanup ref
let freehandCleanup = null;

// Shared accumulated route geometry — persists across mode switches mid-draw
let accumulatedRoutePoints = [];          // LatLng[] combining all mode segments
let accumulatedRoutePreviewLayer = null;  // polyline showing accumulated route on map

// Snap-to-road draw state
let snapRouteActive = false;
let snapRouteWaypoints = [];   // user-clicked LatLng[] for current snap session
let snapRouteMouseLine = null; // cursor-following ghost line
let snapRouteClickTimer = null;
let snapRouteCleanup = null;

let overlaySyncClient = null;
let overlaySyncChannel = null;
let overlayPollingTimer = null;
let overlaySidebarEl = null;   // Leaflet control container (trigger button only)
let ovPanelEl = null;          // Panel element — appended to <body> to escape overflow:hidden
let ovActiveCategoryTab = null; // 'anfahrt' | 'pfad' | 'marker' | 'zone' | 'farbe' | null

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
function routeIconSVG(routeType, color) {
    const c = color || '#dc2626';
    if (routeType === 'hauptzufahrt') return `<svg width="18" height="10" viewBox="0 0 18 10" fill="none" style="display:inline-block;vertical-align:middle"><line x1="1" y1="5" x2="11" y2="5" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/><polygon points="9,1 17,5 9,9 11.5,5" fill="${c}"/></svg>`;
    if (routeType === 'alternativ')   return `<svg width="18" height="10" viewBox="0 0 18 10" fill="none" style="display:inline-block;vertical-align:middle"><line x1="1" y1="5" x2="11" y2="5" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-dasharray="4,2.5"/><polygon points="9,1 17,5 9,9 11.5,5" fill="${c}"/></svg>`;
    return `<svg width="18" height="10" viewBox="0 0 18 10" fill="none" style="display:inline-block;vertical-align:middle"><path d="M1 7 Q5 1 9 5 Q13 9 17 3" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function describeFeature(f) {
    const p = f?.properties || {};
    if (p.overlayType === 'anfahrt') {
        const color = p.color || '#dc2626';
        if (p.routeType === 'hauptzufahrt') return { icon: routeIconSVG('hauptzufahrt', color), label: p.label || 'Hauptzufahrt', color };
        if (p.routeType === 'alternativ')   return { icon: routeIconSVG('alternativ',   color), label: p.label || 'Alternative Zufahrt', color };
        return { icon: routeIconSVG('custom', color), label: p.label || 'Freie Route', color };
    }
    if (p.overlayType === 'icon') {
        const color = p.color || '#ef4444';
        if (p.iconType === 'schranke') return { icon: mdiIcon('boom-gate',     color), label: p.label || 'Schranke',           color };
        if (p.iconType === 'tresor')   return { icon: mdiIcon('lock',          color), label: p.label || 'Schl\u00fcsseltresor', color };
        if (p.iconType === 'hinweis')  return { icon: mdiIcon('comment-text',  color), label: (p.note || 'Hinweis').substring(0, 35), color };
    }
    if (p.overlayType === 'zone' || p.overlayType === 'gefahrenzone') {
        const color = p.color || '#8b5cf6';
        if (p.zoneType === 'eisabfall') return { icon: mdiIcon('snowflake-alert', '#eab308'), label: p.label || 'Eisabfallzone', color };
        return { icon: mdiIcon('vector-polygon', color), label: p.label || p.note || 'Zone', color };
    }
    if (p.overlayType === 'kreis') {
        const color = p.color || '#8b5cf6';
        if (p.zoneType === 'eisabfall') return { icon: mdiIcon('snowflake-alert', '#eab308'), label: p.label || 'Eisabfallzone (Kreis)', color };
        return { icon: mdiIcon('circle-outline', color), label: p.label || p.note || 'Kreis-Zone', color };
    }
    if (p.overlayType === 'pfad') {
        const ss = p.strokeStyle || 'solid';
        const color = p.color || '#0ea5e9';
        return { icon: mdiIcon(PFAD_STYLE_ICONS[ss] || 'minus', color), label: p.label || PFAD_STYLE_LABELS[ss] || 'Pfad', color };
    }
    return { icon: mdiIcon('map-marker', p.color || '#94a3b8'), label: p.label || 'Element', color: p.color || '#94a3b8' };
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

// ─── GEOMETRY HELPERS ────────────────────────────────────

function calcPolylineLength(latlngs) {
    // Accepts LatLng objects, [lat, lon] arrays, or mixed
    let total = 0;
    for (let i = 1; i < latlngs.length; i++) {
        total += L.latLng(latlngs[i - 1]).distanceTo(L.latLng(latlngs[i]));
    }
    return total;
}

function formatDistance(meters) {
    if (meters >= 1000) return (meters / 1000).toFixed(2).replace('.', ',') + '\u00a0km';
    return Math.round(meters) + '\u00a0m';
}

// ─── TOOLTIP COLOR HELPERS ─────────────────────────────

/** Convert #rrggbb / #rgb to rgba() string */
function hexToRgba(hex, alpha) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Bind a Leaflet tooltip and inject the element's color as CSS variables
 * (--ov-tt-border, --ov-tt-glow) on the tooltip DOM element when it opens.
 * The CSS for .overlay-route-tooltip / .overlay-zone-tooltip reads these vars.
 */
function bindColoredTooltip(layer, content, options) {
    layer.bindTooltip(content, options);
    layer.on('tooltipopen', () => {
        const el = layer.getTooltip()?.getElement();
        const color = layer.feature?.properties?.color;
        if (el && color) {
            el.style.setProperty('--ov-tt-border', hexToRgba(color, 0.7));
            el.style.setProperty('--ov-tt-glow',   hexToRgba(color, 0.25));
        }
    });
}

// ─── CLOUDFLARE SYNC ─────────────────────────────────────────────────────────
// Replaces the previous Supabase integration.
// Backend: Cloudflare Pages Functions  (/api/overlays/*)
// Real-time: polling via js/sync.js  (no WebSocket dependency)

async function initCFOverlaySync() {
    if (typeof window.__cfSync === 'undefined') {
        overlaySyncClient = null;
        return;
    }
    const reachable = await window.__cfSync.probeBackend();
    overlaySyncClient = reachable ? 'cf' : null;   // truthy = backend active
}

async function fetchAllOverlaysRemote() {
    if (!overlaySyncClient) return null;
    try {
        const res = await fetch('/api/overlays');
        if (!res.ok) return null;
        const data = await res.json();
        const store = {};
        Object.entries(data).forEach(([nummer, payload]) => {
            store[normalizeStandortNummer(nummer)] = {
                features:  Array.isArray(payload.features) ? payload.features : [],
                updatedAt: payload.updatedAt || null,
                updatedBy: payload.updatedBy || null,
            };
        });
        return store;
    } catch (err) {
        console.error('Overlay CF fetch failed', err);
        return null;
    }
}

async function saveOverlaysRemote(nummer, payload) {
    if (!overlaySyncClient) return false;
    try {
        const res = await fetch(`/api/overlays/${encodeURIComponent(normalizeStandortNummer(nummer))}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        return res.ok;
    } catch (err) {
        console.error('Overlay CF save failed', err);
        return false;
    }
}

async function subscribeRemoteOverlayChanges() {
    // CF backend uses polling (no Postgres realtime subscription needed)
    if (typeof window.__cfSync?.startOverlayPolling === 'function') {
        window.__cfSync.startOverlayPolling();
    }
}

/**
 * Called by sync.js when the overlay version polling detects a remote change.
 * Merges the remote store into local state and refreshes the map.
 */
function setOverlayStoreFromRemote(remote) {
    if (!remote || typeof remote !== 'object') return;
    Object.entries(remote).forEach(([nummer, payload]) => {
        setOverlayPayloadForStandort(nummer, payload);
    });
    persistOverlayStorageSnapshot(getOverlayStorageSnapshot());
    if (overlayEditMode && overlayEditingStandortNummer) {
        renderEditOverlaysForStandort(overlayEditingStandortNummer);
    }
    refreshVisibleOverlays();
    setSyncStatus('Sync aktiv', true);
}
window.setOverlayStoreFromRemote = setOverlayStoreFromRemote;

// Note: overlaySyncChannel and overlayPollingTimer are kept for compatibility
// but unused — real-time sync is handled by polling in js/sync.js.

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
    const preview = document.getElementById('ovColorPreview');
    if (preview) preview.style.background = overlayActiveColor;
}

function updateToolbarState() {
    if (!ovPanelEl) return;
    ovPanelEl.querySelectorAll('.ov-tb-cat').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === ovActiveCategoryTab);
    });
    const subIds = { anfahrt: 'ovSubAnfahrt', pfad: 'ovSubPfad', marker: 'ovSubMarker', zone: 'ovSubZone', farbe: 'ovSubFarbe' };
    Object.entries(subIds).forEach(([cat, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('ov-hidden', ovActiveCategoryTab !== cat);
    });
    const preview = document.getElementById('ovColorPreview');
    if (preview) preview.style.background = overlayActiveColor;
}

// ─── MARKER ICONS ────────────────────────────────────────

function getOverlayMarkerIcon(iconType, color, note) {
    if (iconType === 'hinweis') {
        const bc = color || '#eab308';
        const title = note ? note.replace(/"/g, '&quot;').slice(0, 80) : 'Hinweis';
        return L.divIcon({
            html: `<div class="overlay-poi-marker overlay-poi-marker-hinweis" style="border-color:${bc}" title="${title}"><i class="mdi mdi-comment-text"></i></div>`,
            className: 'overlay-poi-icon-wrap', iconSize: [28, 28], iconAnchor: [14, 14]
        });
    }
    const mdiName = OVERLAY_ICONS[iconType]?.mdi || 'map-marker';
    const meta = OVERLAY_ICONS[iconType] || OVERLAY_ICONS.schranke;
    return L.divIcon({
        html: `<div class="overlay-poi-marker" style="border-color:${color || '#ef4444'}" title="${meta.label}"><i class="mdi mdi-${mdiName}"></i></div>`,
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
            bindColoredTooltip(circle, () => {
                const r = circle.getRadius();
                const diam = `\u00d8\u00a0${Math.round(r * 2)}\u00a0m`;
                const baseName = zoneType === 'eisabfall' ? 'Eisabfallzone' : (note || 'Kreis-Zone');
                return `${baseName} \u00b7 ${diam}`;
            }, { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
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
                `<div class="overlay-hinweis-popup"><strong><i class="mdi mdi-comment-text"></i> Hinweis</strong><p>${note.replace(/\n/g, '<br>')}</p></div>`,
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
        bindColoredTooltip(polyline, () => {
            const dist = formatDistance(calcPolylineLength(polyline.getLatLngs()));
            return `${PFAD_STYLE_LABELS[strokeStyle] || 'Pfad'} \u00b7 ${dist}`;
        }, { sticky: true, className: 'overlay-route-tooltip' });
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
        bindColoredTooltip(polyline, () => {
            const dist = formatDistance(calcPolylineLength(polyline.getLatLngs()));
            return `${getRouteLabel(routeType)} \u00b7 ${dist}`;
        }, { sticky: true, className: 'overlay-route-tooltip' });
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
        const label = zoneType === 'eisabfall' ? 'Eisabfallzone' : (note || 'Zone');
        bindColoredTooltip(polygon, label, { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
        return polygon;
    }

    return null;
}

function updateFeatureFromLayer(layer) {
    if (!layer) return null;

    // Preserve any custom label the user has set via inline rename
    const existingLabel = layer.feature?.properties?.label || '';

    if (layer instanceof L.Marker) {
        const ll = layer.getLatLng();
        const iconType = layer.feature?.properties?.iconType || 'schranke';
        const color = layer.feature?.properties?.color || overlayActiveColor;
        const note = layer.feature?.properties?.note || '';
        layer.feature = {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
            properties: { overlayType: 'icon', iconType, color, ...(note ? { note } : {}), ...(existingLabel ? { label: existingLabel } : {}) }
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
            properties: { overlayType: 'kreis', zoneType, radius: layer.getRadius(), color, ...(note ? { note } : {}), ...(existingLabel ? { label: existingLabel } : {}) }
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
            properties: { overlayType: ot === 'gefahrenzone' ? 'zone' : ot, zoneType, color, ...(note ? { note } : {}), ...(existingLabel ? { label: existingLabel } : {}) }
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
                properties: { overlayType: 'pfad', strokeStyle, color, ...(existingLabel ? { label: existingLabel } : {}) }
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
            properties: { overlayType: 'anfahrt', routeType, color, ...(existingLabel ? { label: existingLabel } : {}) }
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
    // Use the sync user-ID when available so overlay changes are attributable
    const userId = window.__cfSync?.getUserId?.() ?? 'gui';
    return { features, updatedAt: new Date().toISOString(), updatedBy: userId };
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
        ovActiveCategoryTab = null;
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
    if (freehandCleanup) { freehandCleanup(); freehandCleanup = null; }
    if (snapRouteCleanup) { snapRouteCleanup(); snapRouteCleanup = null; }
    // Only clean up transient cursor-following elements — NOT accumulatedRoutePoints
    snapRouteActive = false;
    if (snapRouteClickTimer) { clearTimeout(snapRouteClickTimer); snapRouteClickTimer = null; }
    if (snapRouteMouseLine) { try { leafletMap.removeLayer(snapRouteMouseLine); } catch(e){} snapRouteMouseLine = null; }
}

/** Remove the shared accumulated geometry + preview layer. Call on commit, cancel, or full deactivation. */
function clearAccumulatedRoute() {
    accumulatedRoutePoints = [];
    snapRouteWaypoints = [];
    if (accumulatedRoutePreviewLayer) {
        try { leafletMap.removeLayer(accumulatedRoutePreviewLayer); } catch(_) {}
        accumulatedRoutePreviewLayer = null;
    }
}

/** Create/update the map polyline that shows the full accumulated route so far. */
function updateAccumulatedPreview() {
    if (!accumulatedRoutePoints.length) return;
    if (accumulatedRoutePreviewLayer) {
        accumulatedRoutePreviewLayer.setLatLngs(accumulatedRoutePoints);
        accumulatedRoutePreviewLayer.setStyle({ color: overlayActiveColor });
    } else {
        accumulatedRoutePreviewLayer = L.polyline(accumulatedRoutePoints, {
            color: overlayActiveColor, weight: 4, dashArray: '8,6', opacity: 0.85, interactive: false
        }).addTo(leafletMap);
    }
}

/** Creates the floating hint bar. Pass `isSnap=true` for snap-specific text. */
function createDrawHint(isSnap) {
    removeDrawHint();
    const el = document.createElement('div');
    el.id = 'ovDrawHint';
    el.className = 'ov-snap-hint';
    el.innerHTML = isSnap
        ? '<span class="ov-hint-text">Klicken = Wegpunkt · Modus wechseln jederzeit möglich</span> &nbsp;'
            + '<button class="ov-hint-finish" onclick="finishAccumulatedRoute()">✓ Fertig</button>'
            + '<button class="ov-hint-cancel" onclick="deactivateCurrentTool()">✕</button>'
        : '<span class="ov-hint-text">Maus halten und ziehen · Modus wechseln jederzeit möglich</span> &nbsp;'
            + '<button class="ov-hint-finish" onclick="finishAccumulatedRoute()">✓ Fertig</button>'
            + '<button class="ov-hint-cancel" onclick="deactivateCurrentTool()">✕</button>';
    document.body.appendChild(el);
    return el;
}

function removeDrawHint() {
    const existing = document.getElementById('ovDrawHint');
    if (existing) existing.remove();
}

function updateHintSegmentCount() {
    const hint = document.getElementById('ovDrawHint');
    if (!hint) return;
    const span = hint.querySelector('.ov-hint-text');
    if (!span) return;
    if (accumulatedRoutePoints.length >= 2) {
        const dist = typeof formatDistance === 'function'
            ? formatDistance(calcPolylineLength(accumulatedRoutePoints))
            : `${accumulatedRoutePoints.length} Pkt.`;
        const modeLabel = overlayAnfahrtDrawMode === 'snap' ? 'Straße'
            : overlayAnfahrtDrawMode === 'freehand' ? 'Freihand' : 'Pfad';
        span.textContent = `${modeLabel}: ${dist} — Modus jederzeit wechselbar`;
    }
}

/** Commit the entire accumulated route then deactivate. */
async function finishAccumulatedRoute() {
    const savedTool = overlayActiveTool;
    stopCurrentDrawHandler();
    const pts = accumulatedRoutePoints.slice();
    if (pts.length < 2) { deactivateCurrentTool(); return; }
    await commitRouteLayerFromLatLngs(pts, savedTool);
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
            if (overlayAnfahrtDrawMode === 'freehand') startFreehandDraw();
            else if (overlayAnfahrtDrawMode === 'snap') startSnapRouteDraw();
            else startLineDraw();
            break;
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
    clearAccumulatedRoute();
    removeDrawHint();
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

// ─── FREEHAND DRAWING ────────────────────────────────────

function startFreehandDraw() {
    stopCurrentDrawHandler();
    const container = leafletMap.getContainer();
    let strokePoints = [];       // current drag stroke
    let strokePreviewLine = null; // temp line during drag only
    let drawing = false;

    const hint = createDrawHint(false);
    updateHintSegmentCount();

    function onPointerDown(e) {
        if (e.button !== 0 && e.pointerType !== 'touch') return;
        e.preventDefault();
        try { container.setPointerCapture(e.pointerId); } catch(_) {}
        leafletMap.dragging.disable();
        drawing = true;
        strokePoints = [];
        // Seed stroke from last accumulated point so continuity is visible
        if (accumulatedRoutePoints.length > 0) {
            strokePoints.push(accumulatedRoutePoints[accumulatedRoutePoints.length - 1]);
        }
        const pt = leafletMap.containerPointToLatLng(L.point(e.offsetX, e.offsetY));
        strokePoints.push(pt);
        if (strokePreviewLine) { try { leafletMap.removeLayer(strokePreviewLine); } catch(_) {} }
        strokePreviewLine = L.polyline(strokePoints, {
            color: overlayActiveColor, weight: 3, dashArray: '3,3', opacity: 0.7, interactive: false
        }).addTo(leafletMap);
    }

    function onPointerMove(e) {
        if (!drawing) return;
        const ll = leafletMap.containerPointToLatLng(L.point(e.offsetX, e.offsetY));
        strokePoints.push(ll);
        if (strokePreviewLine) strokePreviewLine.setLatLngs(strokePoints);
    }

    function onPointerUp(e) {
        if (!drawing) return;
        drawing = false;
        try { container.releasePointerCapture(e.pointerId); } catch(_) {}
        leafletMap.dragging.enable();
        if (strokePreviewLine) { try { leafletMap.removeLayer(strokePreviewLine); } catch(_) {} strokePreviewLine = null; }
        const captured = strokePoints.slice();
        strokePoints = [];

        // The stroke was seeded with the last accumulated point; real content starts at index 1
        const hasAccum = accumulatedRoutePoints.length > 0;
        const meaningfulPts = hasAccum ? captured.slice(1) : captured;
        if (meaningfulPts.length < 2) return;

        const toSimplify = hasAccum
            ? [accumulatedRoutePoints[accumulatedRoutePoints.length - 1], ...meaningfulPts]
            : captured;
        const simplified = simplifyFreehandPoints(toSimplify, 0.000015);
        const toAppend = (simplified.length >= 2 ? simplified : toSimplify).slice(hasAccum ? 1 : 0);

        for (const pt of toAppend) accumulatedRoutePoints.push(pt);
        updateAccumulatedPreview();
        updateHintSegmentCount();
    }

    function onKeyDown(e) {
        if (e.key === 'Enter') {
            if (drawing) { drawing = false; leafletMap.dragging.enable(); }
            if (strokePreviewLine) { try { leafletMap.removeLayer(strokePreviewLine); } catch(_) {} strokePreviewLine = null; }
            cleanup();
            finishAccumulatedRoute();
        }
        if (e.key === 'Escape') {
            if (drawing) { drawing = false; leafletMap.dragging.enable(); }
            if (strokePreviewLine) { try { leafletMap.removeLayer(strokePreviewLine); } catch(_) {} strokePreviewLine = null; }
            cleanup();
            deactivateCurrentTool();
        }
    }

    function cleanup() {
        container.removeEventListener('pointerdown', onPointerDown);
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('keydown', onKeyDown);
        container.style.cursor = '';
        freehandCleanup = null;
    }

    freehandCleanup = cleanup;
    container.style.cursor = 'crosshair';
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keydown', onKeyDown);
}

// Ramer-Douglas-Peucker point simplification for freehand paths
function simplifyFreehandPoints(points, tolerance) {
    if (points.length < 3) return points;

    function perpDist(p, a, b) {
        const dx = b.lat - a.lat, dy = b.lng - a.lng;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) {
            const ex = p.lat - a.lat, ey = p.lng - a.lng;
            return Math.sqrt(ex * ex + ey * ey);
        }
        const t = Math.max(0, Math.min(1, ((p.lat - a.lat) * dx + (p.lng - a.lng) * dy) / len2));
        const ex = p.lat - a.lat - t * dx, ey = p.lng - a.lng - t * dy;
        return Math.sqrt(ex * ex + ey * ey);
    }

    function rdp(pts) {
        if (pts.length < 3) return pts;
        let maxD = 0, idx = 0;
        for (let i = 1; i < pts.length - 1; i++) {
            const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (maxD > tolerance) {
            const l = rdp(pts.slice(0, idx + 1));
            const r = rdp(pts.slice(idx));
            return [...l.slice(0, -1), ...r];
        }
        return [pts[0], pts[pts.length - 1]];
    }

    return rdp(points);
}

// ─── SNAP-TO-ROAD DRAWING (OSRM) ─────────────────────────

async function fetchOSRMSegment(from, to) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.code !== 'Ok' || !data.routes?.length) return null;
        return data.routes[0].geometry.coordinates.map(([lng, lat]) => L.latLng(lat, lng));
    } catch (_) { return null; }
}

function startSnapRouteDraw() {
    stopCurrentDrawHandler();
    snapRouteActive = true;
    // Resume waypoints from the last accumulated point (for mid-draw mode switching)
    snapRouteWaypoints = accumulatedRoutePoints.length > 0
        ? [accumulatedRoutePoints[accumulatedRoutePoints.length - 1]]
        : [];

    const container = leafletMap.getContainer();
    container.style.cursor = 'crosshair';

    const hint = createDrawHint(true);
    updateHintSegmentCount();

    function onMapClick(e) {
        if (snapRouteClickTimer) { clearTimeout(snapRouteClickTimer); snapRouteClickTimer = null; }
        snapRouteClickTimer = setTimeout(() => addSnapWaypoint(e.latlng), 220);
    }

    function onMapDblClick(e) {
        if (snapRouteClickTimer) { clearTimeout(snapRouteClickTimer); snapRouteClickTimer = null; }
        L.DomEvent.stop(e);
        cleanup();
        finishAccumulatedRoute();
    }

    function onMapMouseMove(e) {
        if (!snapRouteActive || !snapRouteWaypoints.length) return;
        const last = snapRouteWaypoints[snapRouteWaypoints.length - 1];
        if (snapRouteMouseLine) {
            snapRouteMouseLine.setLatLngs([last, e.latlng]);
        } else {
            snapRouteMouseLine = L.polyline([last, e.latlng], {
                color: overlayActiveColor, weight: 2, dashArray: '4,4', opacity: 0.45, interactive: false
            }).addTo(leafletMap);
        }
    }

    function onKeyDown(e) {
        if (e.key === 'Escape') { cleanup(); deactivateCurrentTool(); }
        if (e.key === 'Enter') { cleanup(); finishAccumulatedRoute(); }
    }

    function cleanup() {
        leafletMap.off('click', onMapClick);
        leafletMap.off('dblclick', onMapDblClick);
        leafletMap.off('mousemove', onMapMouseMove);
        document.removeEventListener('keydown', onKeyDown);
        container.style.cursor = '';
        snapRouteCleanup = null;
    }

    snapRouteCleanup = cleanup;
    leafletMap.on('click', onMapClick);
    leafletMap.on('dblclick', onMapDblClick);
    leafletMap.on('mousemove', onMapMouseMove);
    document.addEventListener('keydown', onKeyDown);
}

async function addSnapWaypoint(newLatlng) {
    if (!snapRouteActive) return;

    if (snapRouteWaypoints.length === 0) {
        // First click — just mark the starting point
        snapRouteWaypoints.push(newLatlng);
        if (accumulatedRoutePoints.length === 0) {
            accumulatedRoutePoints.push(newLatlng);
            updateAccumulatedPreview();
        }
        return;
    }

    const prev = snapRouteWaypoints[snapRouteWaypoints.length - 1];

    // Fetch OSRM road-snapped segment
    const snapped = await fetchOSRMSegment(prev, newLatlng);
    if (!snapRouteActive) return; // cancelled while fetching

    if (snapped && snapped.length >= 2) {
        // Skip first point of segment — it duplicates the last accumulated point
        const startIdx = accumulatedRoutePoints.length > 0 ? 1 : 0;
        for (let i = startIdx; i < snapped.length; i++) accumulatedRoutePoints.push(snapped[i]);
        if (accumulatedRoutePoints.length === 0) accumulatedRoutePoints.push(...snapped);
    } else {
        // Fallback: straight line
        if (accumulatedRoutePoints.length === 0) accumulatedRoutePoints.push(prev);
        accumulatedRoutePoints.push(newLatlng);
    }
    snapRouteWaypoints.push(newLatlng);

    if (snapRouteMouseLine) { try { leafletMap.removeLayer(snapRouteMouseLine); } catch(_) {} snapRouteMouseLine = null; }
    updateAccumulatedPreview();
    updateHintSegmentCount();
}

// ─── SHARED ROUTE COMMIT ─────────────────────────────────

async function commitRouteLayerFromLatLngs(latLngs, toolOverride) {
    const tool = toolOverride || overlayActiveTool;
    const color = overlayActiveColor;
    const routeType = getRouteTypeForTool(tool);

    // Normalize to plain [lat, lng] for polyline and [lng, lat] for GeoJSON
    const normalizedLatLngs = latLngs.map(ll => {
        if (ll && typeof ll.lat !== 'undefined') return ll;
        if (Array.isArray(ll)) return L.latLng(ll[0], ll[1]);
        return ll;
    }).filter(Boolean);

    if (normalizedLatLngs.length < 2) { deactivateCurrentTool(); return; }

    const coords = normalizedLatLngs.map(ll => [ll.lng, ll.lat]);

    // Remove accumulated preview before adding the final committed layer
    clearAccumulatedRoute();
    removeDrawHint();

    const layer = L.polyline(normalizedLatLngs, { color, weight: 4, opacity: 0.9 });
    layer.feature = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { overlayType: 'anfahrt', routeType, color }
    };
    bindColoredTooltip(layer, () => {
        const dist = formatDistance(calcPolylineLength(layer.getLatLngs()));
        return `${getRouteLabel(routeType)} \u00b7 ${dist}`;
    }, { sticky: true, className: 'overlay-route-tooltip' });
    attachDeleteHandler(layer);

    pushUndo();
    overlayEditGroup.addLayer(layer);
    await saveEditedOverlays();
    deactivateCurrentTool();
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
    updateDrawModeBtnStates();
    updateToolbarState();
}

function updateDrawModeBtnStates() {
    if (!ovPanelEl) return;
    ovPanelEl.querySelectorAll('[data-drawmode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.drawmode === overlayAnfahrtDrawMode);
    });
}

// ─── CLEAR ALL ───────────────────────────────────────────

async function clearAllOverlays() {
    if (!overlayEditMode || !overlayEditingStandortNummer) return;
    const count = overlayEditGroup.getLayers().length;
    if (count === 0) return;
    const confirmed = window.confirm(`Alle ${count} Elemente für diesen Standort löschen?`);
    if (!confirmed) return;
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
                <i class="mdi mdi-pencil-outline pointer-events-none"></i>
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
        <!-- Header -->
        <div class="ov-header">
            <div class="ov-header-info">
                <span id="ovEditStation" class="ov-header-station">—</span>
                <span id="ovEditName" class="ov-header-name"></span>
            </div>
            <button type="button" id="ovCloseEdit" class="ov-close-btn" title="Schließen">
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>

        <!-- Compact category toolbar -->
        <div class="ov-toolbar">
            <div class="ov-tb-item">
                <button type="button" class="ov-tb-cat" data-cat="anfahrt" title="Anfahrt">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                    <span id="ovBadgeAnfahrt" class="ov-badge ov-hidden">0</span>
                </button>
            </div>
            <div class="ov-tb-item">
                <button type="button" class="ov-tb-cat" data-cat="pfad" title="Pfade &amp; Pfeile">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                    <span id="ovBadgePfad" class="ov-badge ov-hidden">0</span>
                </button>
            </div>
            <div class="ov-tb-item">
                <button type="button" class="ov-tb-cat" data-cat="marker" title="Markierungen">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <span id="ovBadgeMarker" class="ov-badge ov-hidden">0</span>
                </button>
            </div>
            <div class="ov-tb-item">
                <button type="button" class="ov-tb-cat" data-cat="zone" title="Zonen">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/></svg>
                    <span id="ovBadgeZone" class="ov-badge ov-hidden">0</span>
                </button>
            </div>
            <div class="ov-tb-sep"></div>
            <div class="ov-tb-item">
                <button type="button" class="ov-tb-cat" data-cat="farbe" title="Farbe wählen">
                    <span id="ovColorPreview" class="ov-color-preview" style="background:#dc2626"></span>
                </button>
            </div>
            <div class="ov-tb-sep"></div>
            <button type="button" id="ovUndoBtn" class="ov-tb-act" disabled title="Rückgängig">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 10h10a5 5 0 010 10H9"/><path d="M3 10l4-4m-4 4l4 4"/></svg>
            </button>
            <button type="button" id="ovClearBtn" class="ov-tb-act ov-tb-act-danger" title="Alle löschen">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
        </div>

        <!-- Sub-toolbar: Anfahrt -->
        <div class="ov-subtoolbar ov-subtoolbar-anfahrt ov-hidden" id="ovSubAnfahrt">
            <!-- Row 1: Route type -->
            <div class="ov-sub-row">
                <button type="button" class="ov-sub-btn" data-tool="hauptzufahrt" title="Hauptzufahrt einzeichnen">
                    <svg width="18" height="10" viewBox="0 0 18 10" fill="none"><line x1="1" y1="5" x2="11" y2="5" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round"/><polygon points="9,1 17,5 9,9 11.5,5" fill="#dc2626"/></svg>
                    Haupt
                </button>
                <button type="button" class="ov-sub-btn" data-tool="alternativ" title="Alternative Route">
                    <svg width="18" height="10" viewBox="0 0 18 10" fill="none"><line x1="1" y1="5" x2="11" y2="5" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-dasharray="4,2.5"/><polygon points="9,1 17,5 9,9 11.5,5" fill="#f97316"/></svg>
                    Alternativ
                </button>
                <button type="button" class="ov-sub-btn" data-tool="route_custom" title="Freie Route einzeichnen">
                    <svg width="18" height="10" viewBox="0 0 18 10" fill="none"><path d="M1 7 Q5 1 9 5 Q13 9 17 3" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/></svg>
                    Frei
                </button>
            </div>
            <!-- Divider -->
            <div class="ov-drawmode-divider"></div>
            <!-- Row 2: Drawing mode -->
            <div class="ov-draw-mode-row">
                <button type="button" class="ov-draw-mode-btn" data-drawmode="path" title="Wegpunkte durch Klicken setzen (Standard)">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3,17 9,11 13,15 21,7"/><circle cx="3" cy="17" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="11" r="1.5" fill="currentColor" stroke="none"/><circle cx="13" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="21" cy="7" r="1.5" fill="currentColor" stroke="none"/></svg>
                    Pfad
                </button>
                <button type="button" class="ov-draw-mode-btn" data-drawmode="freehand" title="Freihand zeichnen (Maus gedrückt halten)">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 17c2-4 5-7 8-5s4 5 7 2"/></svg>
                    Freihand
                </button>
                <button type="button" class="ov-draw-mode-btn active" data-drawmode="snap" title="Wegpunkte klicken – Strecke rastet automatisch auf Straßen ein (OSRM)">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
                    Straße
                </button>
            </div>
        </div>

        <!-- Sub-toolbar: Pfade -->
        <div class="ov-subtoolbar ov-hidden" id="ovSubPfad">
            <button type="button" class="ov-sub-btn" data-tool="pfad_solid" title="Solide Linie">
                <svg width="20" height="10" viewBox="0 0 20 10" fill="none"><line x1="1" y1="5" x2="19" y2="5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
            </button>
            <button type="button" class="ov-sub-btn" data-tool="pfad_dash" title="Gestrichelte Linie">
                <svg width="20" height="10" viewBox="0 0 20 10" fill="none"><line x1="1" y1="5" x2="19" y2="5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="5,3"/></svg>
            </button>
            <button type="button" class="ov-sub-btn" data-tool="pfad_dot" title="Gepunktete Linie">
                <svg width="20" height="10" viewBox="0 0 20 10" fill="none"><line x1="1" y1="5" x2="19" y2="5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0.1,4"/></svg>
            </button>
            <button type="button" class="ov-sub-btn" data-tool="pfad_arrow" title="Pfeil">
                <svg width="20" height="10" viewBox="0 0 20 10" fill="none"><line x1="1" y1="5" x2="13" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polygon points="11,1.5 19,5 11,8.5 13,5" fill="currentColor"/></svg>
            </button>
            <button type="button" class="ov-sub-btn" data-tool="pfad_arrow_many" title="Richtungspfeile">
                <svg width="28" height="10" viewBox="0 0 28 10" fill="none"><line x1="1" y1="5" x2="27" y2="5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polygon points="5,1.5 11,5 5,8.5 7,5" fill="currentColor"/><polygon points="16,1.5 22,5 16,8.5 18,5" fill="currentColor"/></svg>
            </button>
        </div>

        <!-- Sub-toolbar: Markierungen -->
        <div class="ov-subtoolbar ov-hidden" id="ovSubMarker">
            <button type="button" class="ov-sub-btn" data-tool="schranke" title="Schranke setzen">
                <i class="mdi mdi-boom-gate" aria-hidden="true"></i>
                Schranke
            </button>
            <button type="button" class="ov-sub-btn" data-tool="tresor" title="Schlüsseltresor">
                <i class="mdi mdi-lock" aria-hidden="true"></i>
                Tresor
            </button>
            <button type="button" class="ov-sub-btn" data-tool="hinweis" title="Hinweis hinzufügen">
                <i class="mdi mdi-comment-text" aria-hidden="true"></i>
                Hinweis
            </button>
        </div>

        <!-- Sub-toolbar: Zonen -->
        <div class="ov-subtoolbar ov-subtoolbar-wrap ov-hidden" id="ovSubZone">
            <button type="button" class="ov-sub-btn" data-tool="eisabfall_poly" title="Eisabfallzone (Polygon)">
                <svg width="13" height="13" fill="none" stroke="#eab308" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                Eisabfall Polygon
            </button>
            <button type="button" class="ov-sub-btn" data-tool="eisabfall_kreis" title="Eisabfallzone (Kreis)">
                <svg width="13" height="13" fill="none" stroke="#eab308" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>
                Eisabfall Kreis
            </button>
            <button type="button" class="ov-sub-btn" data-tool="zone_poly" title="Freie Polygon-Zone">
                <svg width="13" height="13" fill="none" stroke="#8b5cf6" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"/></svg>
                Poly
            </button>
            <button type="button" class="ov-sub-btn" data-tool="zone_kreis" title="Freie Kreis-Zone">
                <svg width="13" height="13" fill="none" stroke="#8b5cf6" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                Kreis
            </button>
        </div>

        <!-- Sub-toolbar: Farbe -->
        <div class="ov-subtoolbar ov-subtoolbar-color ov-hidden" id="ovSubFarbe">
            <div class="ov-palette">${paletteSwatches}</div>
            <div class="ov-custom-row">
                <input type="color" id="ovCustomColorInput" value="#dc2626" class="ov-custom-input" title="Eigene Farbe"/>
                <span id="ovCustomColorLabel" class="ov-custom-label">Eigene Farbe</span>
            </div>
        </div>

        <!-- Element list (scrollable) -->
        <div class="ov-body">
            <div id="ovElementList" class="ov-element-list">
                <div class="ov-empty">Noch keine Elemente</div>
            </div>
        </div>

        <!-- Footer -->
        <div class="ov-footer">
            <div id="ovSyncStatus" class="ov-sync-status">Lokal</div>
            <span id="ovBadgeTotal" class="ov-badge ov-hidden">0</span>
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
        updateToolbarState();
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
        const canRename = feature.properties?.iconType !== 'hinweis';
        const labelHtml = canRename
            ? `<span class="ov-element-label ov-rename" contenteditable="true" data-idx="${idx}" title="Klicken zum Umbenennen">${escapeHTML(d.label)}</span>`
            : `<span class="ov-element-label">${escapeHTML(d.label)}</span>`;
        // Color text/unicode icons with the element color; HTML icons (<svg>, <i>) already carry their color
        const iconIsHtml = d.icon.startsWith('<');
        const iconStyle = (!iconIsHtml && d.color) ? ` style="color:${d.color}"` : '';
        return `<div class="ov-element-row">
            <span class="ov-element-icon"${iconStyle}>${d.icon}</span>
            ${labelHtml}
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

    // Attach inline rename handlers
    container.querySelectorAll('.ov-rename').forEach(span => {
        span.addEventListener('focus', () => {
            span.dataset.orig = span.textContent;
            // place cursor at end
            const range = document.createRange();
            range.selectNodeContents(span);
            range.collapse(false);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        span.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
            if (e.key === 'Escape') { span.textContent = span.dataset.orig || ''; span.blur(); }
        });
        span.addEventListener('blur', async () => {
            const newLabel = span.textContent.trim();
            const origLabel = span.dataset.orig || '';
            if (!newLabel || newLabel === origLabel) {
                if (!newLabel) span.textContent = origLabel; // restore if cleared
                return;
            }
            const idx = parseInt(span.dataset.idx, 10);
            // Only collect layers that have features — must match renderElementList indexing
            const layers = [];
            overlayEditGroup.eachLayer(l => { if (l.feature) layers.push(l); });
            const layer = layers[idx];
            if (!layer?.feature) return;
            layer.feature.properties.label = newLabel;
            await saveEditedOverlays();
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
                bindColoredTooltip(layer, () => {
                    const dist = formatDistance(calcPolylineLength(layer.getLatLngs()));
                    return `${PFAD_STYLE_LABELS[strokeStyle] || 'Pfad'} \u00b7 ${dist}`;
                }, { sticky: true, className: 'overlay-route-tooltip' });
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
                bindColoredTooltip(layer, () => {
                    const dist = formatDistance(calcPolylineLength(layer.getLatLngs()));
                    return `${getRouteLabel(routeType)} \u00b7 ${dist}`;
                }, { sticky: true, className: 'overlay-route-tooltip' });
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
                bindColoredTooltip(layer, 'Eisabfallzone', { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
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
                bindColoredTooltip(layer, () => {
                    const diam = `\u00d8\u00a0${Math.round(layer.getRadius() * 2)}\u00a0m`;
                    return `Eisabfallzone \u00b7 ${diam}`;
                }, { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
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
        title.textContent = 'Hinweis-Text';
        presetRow.classList.add('hidden');
        inputLabel.textContent = 'Hinweis-Text:';
        input.placeholder = 'z.B. Tor ist nur von 7–18 Uhr offen...';
        input.value = mode === 'edit-hinweis' ? (ovModalEditLayer?.feature?.properties?.note || '') : '';
    } else {
        title.textContent = 'Zone benennen';
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
        const isCircle = ovModalEditLayer instanceof L.Circle;
        ovModalEditLayer.unbindTooltip();
        if (isCircle) {
            const circleRef = ovModalEditLayer;
            const zt = circleRef.feature.properties.zoneType || 'custom';
            bindColoredTooltip(circleRef, () => {
                const diam = `\u00d8\u00a0${Math.round(circleRef.getRadius() * 2)}\u00a0m`;
                const base = zt === 'eisabfall' ? 'Eisabfallzone' : (circleRef.feature.properties.note || 'Kreis-Zone');
                return `${base} \u00b7 ${diam}`;
            }, { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
        } else {
            ovModalEditLayer.bindTooltip(label, { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
        }
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
            `<div class="overlay-hinweis-popup"><strong><i class="mdi mdi-comment-text"></i> Hinweis</strong><p>${text.replace(/\n/g, '<br>')}</p></div>`,
            { maxWidth: 260, className: 'overlay-hinweis-popup-wrap' }
        );
    } else {
        // Zone / Circle
        // Auto-detect preset selection
        const presetSel = document.getElementById('ovModalPreset');
        if (presetSel && presetSel.value === 'eisabfall') {
            layer.feature.properties.zoneType = 'eisabfall';
            layer.feature.properties.note = text || 'Eisabfallzone';
        }
        if (layer instanceof L.Circle) {
            const zt = layer.feature.properties.zoneType || 'custom';
            bindColoredTooltip(layer, () => {
                const diam = `\u00d8\u00a0${Math.round(layer.getRadius() * 2)}\u00a0m`;
                const base = zt === 'eisabfall' ? 'Eisabfallzone' : (layer.feature.properties.note || 'Kreis-Zone');
                return `${base} \u00b7 ${diam}`;
            }, { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
        } else {
            const label = layer.feature.properties.zoneType === 'eisabfall'
                ? 'Eisabfallzone'
                : (text || 'Zone');
            bindColoredTooltip(layer, label, { direction: 'center', sticky: true, className: 'overlay-zone-tooltip' });
        }
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

    // Category tab buttons — toggle sub-toolbars
    ovPanelEl.querySelectorAll('.ov-tb-cat').forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.cat;
            if (ovActiveCategoryTab === cat) {
                ovActiveCategoryTab = null;
                deactivateCurrentTool();
            } else {
                ovActiveCategoryTab = cat;
            }
            updateToolbarState();
        });
    });

    // Tool buttons
    ovPanelEl.querySelectorAll('[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => activateTool(btn.dataset.tool));
    });

    // Draw-mode buttons (path / freehand / snap) — inside Anfahrt subtoolbar
    ovPanelEl.querySelectorAll('[data-drawmode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const newMode = btn.dataset.drawmode;
            if (newMode === overlayAnfahrtDrawMode) return;
            overlayAnfahrtDrawMode = newMode;
            updateDrawModeBtnStates();
            // Hot-switch: if an anfahrt tool is already active, restart handler with new mode
            // WITHOUT clearing accumulated points so the route continues seamlessly.
            const anfahrtTools = ['hauptzufahrt', 'alternativ', 'route_custom'];
            if (overlayActiveTool && anfahrtTools.includes(overlayActiveTool)) {
                stopCurrentDrawHandler(); // stops listeners, keeps accumulatedRoutePoints
                if (overlayAnfahrtDrawMode === 'freehand') startFreehandDraw();
                else if (overlayAnfahrtDrawMode === 'snap') startSnapRouteDraw();
                else {
                    // path mode: commit what's accumulated, then start L.Draw fresh
                    if (accumulatedRoutePoints.length >= 2) {
                        finishAccumulatedRoute();
                    } else {
                        clearAccumulatedRoute();
                        removeDrawHint();
                        startLineDraw();
                    }
                }
            }
        });
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
    const panelWidth = Math.min(240, Math.max(200, window.innerWidth - (margin * 2)));

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

    await initCFOverlaySync();
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
