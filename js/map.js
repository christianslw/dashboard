// ─── Leaflet Map & Clustering ────────────────────────────────────────────────────────────

let osmLayer, cartoDBPositronLayer;
let richtfunkLayer = null; // module-level so buildRichtfunkLayer() can access it
const RADAR_MAX_NATIVE_ZOOM      = 10;
const RAINVIEWER_COLOR_SCHEME    = 8;
const ACTIVE_OVERLAYS_STORAGE_KEY = 'activeOverlayLayers';
const RAINVIEWER_LAYER_NAME      = 'Regenradar';
const RICHTFUNK_LAYER_NAME       = 'Richtfunkstrecken';

function loadActiveOverlayLayerNames() {
    try {
        const raw = localStorage.getItem(ACTIVE_OVERLAYS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveActiveOverlayLayerNames(overlayLayers) {
    if (!leafletMap || !overlayLayers) return;
    const activeNames = Object.keys(overlayLayers).filter(name => leafletMap.hasLayer(overlayLayers[name]));
    localStorage.setItem(ACTIVE_OVERLAYS_STORAGE_KEY, JSON.stringify(activeNames));
}

function restoreActiveOverlayLayers(overlayLayers) {
    const names = loadActiveOverlayLayerNames();
    names.forEach(name => {
        // Migrate legacy names
        const normalizedName = (name === 'Regenradar + Vorhersage') ? RAINVIEWER_LAYER_NAME
                             : (name === 'Blitzortung ⚡')           ? null
                             : name;
        if (!normalizedName) return; // removed layer — skip silently
        const layer = overlayLayers[normalizedName];
        if (!layer || leafletMap.hasLayer(layer)) return;
        layer.addTo(leafletMap);
        if (normalizedName === RAINVIEWER_LAYER_NAME) {
            loadRadarFrames();
            showRadarTimeline();
        }
    });
    saveActiveOverlayLayerNames(overlayLayers);
}

function getThemeAwareCartoUrl(isDarkMode) {
    return `${CARTODB_TILE_BASE_URL}/${isDarkMode ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`;
}

function initLeafletMap() {
    leafletMap = L.map('mainMap').setView([48.6, 9.2], 7);

    const isDarkMode = document.documentElement.classList.contains('dark');
    const useDarkMap = isDarkMode;

    osmLayer = L.tileLayer(OSM_TILE_URL, {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        className: 'osm-tiles'
    });

    cartoDBPositronLayer = L.tileLayer(getThemeAwareCartoUrl(useDarkMap), {
        attribution: '© CartoDB © OpenStreetMap contributors',
        maxZoom: 19,
        className: 'no-filter'
    });

    const openTopoMapLayer = L.tileLayer(OPENTOPOMAP_TILE_URL, {
        attribution: '© OpenTopoMap',
        maxZoom: 17,
        className: 'no-filter'
    });

    const satelliteLayer = L.tileLayer(ESRI_IMAGERY_URL, {
        attribution: '© Esri, DigitalGlobe, Earthstar Geographics',
        maxZoom: 19,
        className: 'no-filter'
    });

    const hybridLayer = L.layerGroup([
        L.tileLayer(ESRI_IMAGERY_URL, {
            attribution: '© Esri',
            maxZoom: 19,
            className: 'no-filter'
        }),
        L.tileLayer(ESRI_TRANSPORT_URL, {
            attribution: '© Esri',
            maxZoom: 19,
            className: 'no-filter'
        }),
        L.tileLayer(ESRI_BOUNDARIES_URL, {
            attribution: '© Esri',
            maxZoom: 19,
            className: 'no-filter'
        })
    ]);

    const baseLayers = {
        'OpenStreetMap': osmLayer,
        'CartoDB Positron': cartoDBPositronLayer,
        'OpenTopoMap': openTopoMapLayer,
        'Satellitenbild': satelliteLayer,
        'Hybrid (Satellit+Straßen)': hybridLayer
    };

    const savedMap = localStorage.getItem('selectedMapLayer');
    
    if (savedMap && baseLayers[savedMap]) {
        baseLayers[savedMap].addTo(leafletMap);
    } else {
        if (useDarkMap) {
            cartoDBPositronLayer.addTo(leafletMap);
        } else {
            osmLayer.addTo(leafletMap);
        }
    }

    // DWD Warning Zones (WMS)
    const dwdWarningsLayer = L.tileLayer.wms(DWD_WMS_URL, {
        layers: 'dwd:Warnungen_Gemeinden_vereinigt',
        format: 'image/png',
        transparent: true,
        opacity: 0.65,
        attribution: '© Deutscher Wetterdienst (DWD)',
        className: 'no-filter dwd-warn-tile',
        zIndex: 150
    });

    // Rain radar overlay group (lazy-populated via loadRadarFrames)
    radarOverlayGroup = L.layerGroup();

    // Richtfunkstrecken — inter-station radio link lines (populated by buildRichtfunkLayer)
    richtfunkLayer = L.layerGroup();

    const overlayLayers = {
        'DWD Warnzonen': dwdWarningsLayer,
        [RAINVIEWER_LAYER_NAME]: radarOverlayGroup,
        [RICHTFUNK_LAYER_NAME]: richtfunkLayer
    };

    L.control.layers(baseLayers, overlayLayers, { position: 'topright' }).addTo(leafletMap);
    restoreActiveOverlayLayers(overlayLayers);

    // Inject MDI icons, then init DiPUL control inside the same overlay panel
    requestAnimationFrame(function() {
        const defs = [
            { sel: '.leaflet-control-layers-toggle', icon: 'layers-outline' },
            { sel: '.leaflet-control-zoom-in',       icon: 'plus'   },
            { sel: '.leaflet-control-zoom-out',      icon: 'minus'  }
        ];
        defs.forEach(function(d) {
            const el = document.querySelector(d.sel);
            if (!el) return;
            el.innerHTML = '';
            const i = document.createElement('i');
            i.className = 'mdi mdi-' + d.icon;
            i.style.cssText = 'font-size:18px;line-height:1;pointer-events:none';
            el.appendChild(i);
        });

        // DiPUL Flugzonen: master checkbox + collapsible colored sub-layers
        if (typeof initDipulControl === 'function') {
            initDipulControl(leafletMap);
        }
    });

    leafletMap.on('baselayerchange', function(e) {
        localStorage.setItem('selectedMapLayer', e.name);
    });

    // Overlay state + radar timeline
    leafletMap.on('overlayadd', function(e) {
        saveActiveOverlayLayerNames(overlayLayers);
        if (e.name === RAINVIEWER_LAYER_NAME) {
            loadRadarFrames();
            showRadarTimeline();
        }
    });
    leafletMap.on('overlayremove', function(e) {
        saveActiveOverlayLayerNames(overlayLayers);
        if (e.name === RAINVIEWER_LAYER_NAME) {
            hideRadarTimeline();
        }
    });

}

function updateLeafletMapTheme() {
    const isDarkMode = document.documentElement.classList.contains('dark');
    const newCartoUrl = getThemeAwareCartoUrl(isDarkMode);

    if (leafletMap && cartoDBPositronLayer) {
        cartoDBPositronLayer.setUrl(newCartoUrl);
    }
    // OSM dark mode is handled via CSS inversion on .osm-tiles — no URL swap needed
}

// ─── Richtfunkstrecken Layer ─────────────────────────────────────────────────

/**
 * (Re-)builds the Richtfunkstrecken polyline layer from the global `standorte`
 * array.  Call this after standorte data loads or changes.
 */
function buildRichtfunkLayer() {
    if (!richtfunkLayer) return;
    richtfunkLayer.clearLayers();

    if (!Array.isArray(standorte)) return;

    // Collect deduplicated pairs [A, B] where A.nummer < B.nummer (string compare)
    const seen = new Set();
    standorte.forEach(s => {
        if (!Array.isArray(s.richtfunkverbindungen)) return;
        s.richtfunkverbindungen.forEach(linkedNummer => {
            const linked = standorte.find(t => String(t.nummer) === String(linkedNummer));
            if (!linked || !linked.lat || !linked.lon || !s.lat || !s.lon) return;

            // Build a canonical key so we only draw each line once
            const key = [String(s.nummer), String(linked.nummer)].sort().join(':');
            if (seen.has(key)) return;
            seen.add(key);

            const line = L.polyline(
                [[s.lat, s.lon], [linked.lat, linked.lon]],
                {
                    color:    '#818cf8', // indigo-400
                    weight:   2,
                    opacity:  0.8,
                    dashArray: '6, 6',
                    className: 'no-filter',
                    zIndex:   300
                }
            );

            line.bindTooltip(
                `<b>Richtfunkstrecke</b><br/>${s.nummer} ${s.name} ↔ ${linked.nummer} ${linked.name}`,
                { sticky: true, direction: 'top' }
            );

            richtfunkLayer.addLayer(line);
        });
    });
}

function updateMapMarkers(liste) {
    if (markerClusterGroup) {
        leafletMap.removeLayer(markerClusterGroup);
    }

    markerClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 40,
        disableClusteringAtZoom: 12,
        iconCreateFunction: function (cluster) {
            const count = cluster.getChildCount();
            const childMarkers = cluster.getAllChildMarkers();

            const prefixCounts = {};
            childMarkers.forEach(m => {
                const prefix = m.options.prefix;
                prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
            });

            const dominantPrefix = Object.keys(prefixCounts).reduce((a, b) =>
                prefixCounts[a] > prefixCounts[b] ? a : b
            );
            const clusterColor = STATION_PREFIX_COLORS[dominantPrefix] || '#3b82f6';

            return L.divIcon({
                html: `<div style="background-color: ${clusterColor}; color: white; font-weight: bold; font-size: 12px; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${count}</div>`,
                className: 'custom-cluster-icon',
                iconSize: [32, 32]
            });
        }
    });

    window._markersByNummer = new Map();

    liste.forEach(s => {
        if (!s.lat || !s.lon) return;
        const prefix = Math.floor(s.nummer / 1000);
        const markerColor = STATION_PREFIX_COLORS[prefix] || '#3b82f6';
        const isFav = isFavorite(s.nummer);

        const isMainStation = parseInt(s.nummer) % 1000 === 0;
        const markerSize = isMainStation ? 24 : 14;
        const iconSize = isMainStation ? [24, 24] : [14, 14];
        const anchorOffset = isMainStation ? 12 : 7;
        const starSize = isMainStation ? 28 : 20;

        const ringStyle = 'box-shadow:0 2px 4px rgba(0,0,0,0.3);';

        const smallMarker = isFav
            ? L.divIcon({
                html: `<div style="width:${starSize}px;height:${starSize}px;display:flex;align-items:center;justify-content:center;color:${markerColor};font-size:${starSize}px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))"><i class="mdi mdi-star" style="font-size:${starSize}px"></i></div>`,
                className: 'custom-small-marker',
                iconSize: [starSize, starSize],
                iconAnchor: [Math.round(starSize / 2), Math.round(starSize / 2)]
            })
            : L.divIcon({
                html: `<div style="width: ${markerSize}px; height: ${markerSize}px; background-color: ${markerColor}; border-radius: 50%; border: 2px solid white; ${ringStyle} box-sizing: border-box;"></div>`,
                className: 'custom-small-marker',
                iconSize: iconSize,
                iconAnchor: [anchorOffset, anchorOffset]
            });

        const marker = L.marker([s.lat, s.lon], { icon: smallMarker, prefix: prefix });
        marker.bindTooltip(`<b>${s.nummer}</b> ${s.name}${isFav ? ' ★' : ''}`, { direction: 'top', offset: [0, -10] });
        marker.on('click', (e) => {
            if (e.originalEvent.shiftKey) {
                openTagebuch(s.nummer);
            } else if (e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
                openRouteNavigation(s.nummer);
            } else {
                selectFromList(s.nummer);
            }
        });
        markerClusterGroup.addLayer(marker);
        window._markersByNummer.set(String(s.nummer), marker);
    });

    leafletMap.addLayer(markerClusterGroup);

    if (liste.length > 0) {
        if (liste.length === 1) {
            const s = liste[0];
            let bounds = L.latLngBounds([[s.lat, s.lon]]);

            if (typeof getOverlayPayloadForStandort === 'function') {
                const payload = getOverlayPayloadForStandort(s.nummer);
                extendBoundsWithOverlayFeatures(bounds, payload);
            }

            if (bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
                leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: true });
            } else {
                leafletMap.setView([s.lat, s.lon], 17, { animate: true });
            }
        } else {
            leafletMap.invalidateSize({ animate: false });
            leafletMap.fitBounds(markerClusterGroup.getBounds(), { padding: [30, 30], maxZoom: 12, animate: true });
        }
    }

    if (typeof onOverlayListOrMapChanged === 'function') {
        onOverlayListOrMapChanged();
    }
}

function focusMapOnStandort(nummer) {
    const standort = standorte.find(s => String(s.nummer) === String(nummer));
    if (!standort || !standort.lat || !standort.lon || !leafletMap) return;

    if (typeof onOverlayTargetStandortChanged === 'function') {
        onOverlayTargetStandortChanged(standort.nummer);
    }

    let bounds = L.latLngBounds([[standort.lat, standort.lon]]);

    // Extend bounds with overlay elements
    if (typeof getOverlayPayloadForStandort === 'function') {
        const payload = getOverlayPayloadForStandort(standort.nummer);
        extendBoundsWithOverlayFeatures(bounds, payload);
    }

    if (bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
        leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: true });
    } else {
        leafletMap.setView([standort.lat, standort.lon], 13, { animate: true });
    }
}
// ─── Rain Radar (RainViewer) ─────────────────────────────────────────────────────────────────

async function loadRadarFrames() {
    radarFrames = [];
    radarLayerCache = {};
    radarCurrentFrameIndex = 0;
    updateRadarTimeline();
    try {
        const res = await fetch(RAINVIEWER_API_URL);
        const data = await res.json();
        radarHost = data.host || RAINVIEWER_TILE_HOST_FALLBACK;
        radarFrames = [...(data.radar?.past || []), ...(data.radar?.nowcast || [])];
        updateRadarTimeline();
        setRadarFrame(radarFrames.length - 1);
    } catch (e) {
        console.error('Regenradar-Daten konnten nicht geladen werden:', e);
    }
}

function getRadarTileLayer(index) {
    if (radarLayerCache[index]) return radarLayerCache[index];
    const frame = radarFrames[index];
    if (!frame) return null;
    const url = `${radarHost}${frame.path}/256/{z}/{x}/{y}/${RAINVIEWER_COLOR_SCHEME}/1_1.png`;
    const layer = L.tileLayer(url, {
        tileSize: 256,
        opacity: 0.72,
        maxNativeZoom: RADAR_MAX_NATIVE_ZOOM,
        maxZoom: 22,
        attribution: '© RainViewer',
        className: 'no-filter',
        zIndex: 200
    });
    radarLayerCache[index] = layer;
    return layer;
}

function setRadarFrame(index) {
    if (!leafletMap || !radarOverlayGroup) return;
    radarCurrentFrameIndex = Math.max(0, Math.min(index, Math.max(0, radarFrames.length - 1)));
    radarOverlayGroup.clearLayers();
    const layer = getRadarTileLayer(radarCurrentFrameIndex);
    if (layer) radarOverlayGroup.addLayer(layer);
    updateRadarTimeLabel();
    const slider = document.getElementById('radarSlider');
    if (slider) slider.value = radarCurrentFrameIndex;
}

function updateRadarTimeline() {
    const slider = document.getElementById('radarSlider');
    if (!slider) return;
    slider.min = 0;
    slider.max = Math.max(0, radarFrames.length - 1);
    slider.value = radarCurrentFrameIndex;
    updateRadarTimeLabel();
}

function updateRadarTimeLabel() {
    const label = document.getElementById('radarTimeLabel');
    if (!label) return;
    const frame = radarFrames[radarCurrentFrameIndex];
    if (!frame) { label.textContent = '--:--'; return; }
    const d = new Date(frame.time * 1000);
    label.textContent = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    label.title = d.toLocaleString('de-DE');
}

function toggleRadarPlay() {
    radarIsPlaying ? stopRadarPlay() : startRadarPlay();
}

function startRadarPlay() {
    if (radarFrames.length === 0) return;
    radarIsPlaying = true;
    const btn = document.getElementById('radarPlayBtn');
    if (btn) btn.innerHTML = '<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    radarPlayTimer = setInterval(() => {
        setRadarFrame((radarCurrentFrameIndex + 1) % radarFrames.length);
    }, 500);
}

function stopRadarPlay() {
    radarIsPlaying = false;
    if (radarPlayTimer) { clearInterval(radarPlayTimer); radarPlayTimer = null; }
    const btn = document.getElementById('radarPlayBtn');
    if (btn) btn.innerHTML = '<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
}

function showRadarTimeline() {
    const el = document.getElementById('radarTimeline');
    if (el) el.classList.remove('hidden');
}

function hideRadarTimeline() {
    stopRadarPlay();
    const el = document.getElementById('radarTimeline');
    if (el) el.classList.add('hidden');
    if (radarOverlayGroup) radarOverlayGroup.clearLayers();
    radarFrames = [];
    radarLayerCache = {};
}

function jumpToLatestRadarFrame() {
    if (!radarFrames || radarFrames.length === 0) return;
    setRadarFrame(radarFrames.length - 1);
}
