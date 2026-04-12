// ─── Leaflet Map & Clustering ────────────────────────────────────────────────────────────

let osmLayer, cartoDBPositronLayer;
const RADAR_MAX_NATIVE_ZOOM = 10;
const RAINVIEWER_COLOR_SCHEME = 8;
const ACTIVE_OVERLAYS_STORAGE_KEY = 'activeOverlayLayers';
const RAINVIEWER_LAYER_NAME = 'Regenradar';

const STATION_PREFIX_COLORS = {
    1: '#8b5cf6',
    2: '#10b981',
    3: '#f59e0b',
    4: '#ef4444',
    5: '#ec4899',
    6: '#06b6d4',
    8: '#6366f1',
    9: '#eab308'
};

function getStationPrefixColor(nummer) {
    const prefix = Math.floor(Number(nummer) / 1000);
    return STATION_PREFIX_COLORS[prefix] || '#3b82f6';
}

function mixHexColors(colorA, colorB) {
    function parse(hex) {
        const clean = String(hex || '').replace('#', '');
        const full = clean.length === 3
            ? clean.split('').map(ch => ch + ch).join('')
            : clean.padEnd(6, '0').slice(0, 6);
        return {
            r: parseInt(full.slice(0, 2), 16),
            g: parseInt(full.slice(2, 4), 16),
            b: parseInt(full.slice(4, 6), 16)
        };
    }

    function toHex(value) {
        return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
    }

    const a = parse(colorA);
    const b = parse(colorB);
    return `#${toHex((a.r + b.r) / 2)}${toHex((a.g + b.g) / 2)}${toHex((a.b + b.b) / 2)}`;
}

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
        const normalizedName = name === 'Regenradar + Vorhersage' ? RAINVIEWER_LAYER_NAME : name;
        const layer = overlayLayers[normalizedName];
        if (!layer || leafletMap.hasLayer(layer)) return;
        layer.addTo(leafletMap);
        if (normalizedName === RAINVIEWER_LAYER_NAME) {
            loadRadarFrames();
            showRadarTimeline();
        }
        if (normalizedName === 'Richtfunkstrecken') {
            drawRichtfunkLines(layer);
        }
    });
    saveActiveOverlayLayerNames(overlayLayers);
}

function getThemeAwareOsmUrl() {
    return OSM_TILE_URL;
}

function getThemeAwareCartoUrl(isDarkMode) {
    return `${CARTODB_TILE_BASE_URL}/${isDarkMode ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`;
}

// ─── Custom Kartenebenen Control ─────────────────────────────────────────────
// Replaces the stock Leaflet L.control.layers with a grouped, styled panel:
//   · Karten    → mutually-exclusive radio buttons (base layer selection)
//   · Overlays  → checkboxes (DWD, Regenradar, Richtfunk…)
//   DiPUL injects its section into .leaflet-control-layers-overlays after init.

function _buildCustomLayerControl(map, baseLayers, overlayLayers) {
    const ctrl = L.control({ position: 'topright' });

    ctrl.onAdd = function() {
        const wrap = L.DomUtil.create('div', 'clc-wrap');
        L.DomEvent.disableClickPropagation(wrap);
        L.DomEvent.disableScrollPropagation(wrap);

        // ── Toggle button ────────────────────────────────────────────
        const btn = L.DomUtil.create('button', 'clc-toggle', wrap);
        btn.title = 'Kartenebenen';
        const btnIcon = document.createElement('i');
        btnIcon.className = 'mdi mdi-layers-outline';
        btnIcon.style.cssText = 'font-size:18px;line-height:1;pointer-events:none';
        btn.appendChild(btnIcon);

        // ── Panel ────────────────────────────────────────────────
        const panel = L.DomUtil.create('div', 'clc-panel', wrap);
        panel.style.display = 'none';

        // ——— Karten ———
        const kHead = document.createElement('div');
        kHead.className = 'clc-section-head';
        kHead.textContent = 'Karten';
        panel.appendChild(kHead);

        const kList = document.createElement('div');
        kList.className = 'clc-list';
        Object.entries(baseLayers).forEach(function([name, layer]) {
            const lbl = document.createElement('label');
            lbl.className = 'clc-row';
            const r = document.createElement('input');
            r.type = 'radio';
            r.name = 'clc-base-layer';
            r.dataset.name = name;
            r.checked = map.hasLayer(layer);
            r.addEventListener('change', function() {
                if (!r.checked) return;
                Object.values(baseLayers).forEach(function(l) { if (map.hasLayer(l)) map.removeLayer(l); });
                layer.addTo(map);
                map.fire('baselayerchange', { name: name, layer: layer });
            });
            const s = document.createElement('span');
            s.textContent = name;
            lbl.appendChild(r);
            lbl.appendChild(s);
            kList.appendChild(lbl);
        });
        panel.appendChild(kList);

        // ——— Divider ———
        const divider = document.createElement('div');
        divider.className = 'clc-divider';
        panel.appendChild(divider);

        // ——— Overlays ———
        const oHead = document.createElement('div');
        oHead.className = 'clc-section-head';
        oHead.textContent = 'Overlays';
        panel.appendChild(oHead);

        // .leaflet-control-layers-overlays: DiPUL injects its section here
        const oList = document.createElement('div');
        oList.className = 'clc-list leaflet-control-layers-overlays';
        Object.entries(overlayLayers).forEach(function([name, layer]) {
            const lbl = document.createElement('label');
            lbl.className = 'clc-row';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.name = name;
            cb.checked = map.hasLayer(layer);
            cb.addEventListener('change', function() {
                if (cb.checked) {
                    layer.addTo(map);
                    map.fire('overlayadd', { name: name, layer: layer });
                } else {
                    map.removeLayer(layer);
                    map.fire('overlayremove', { name: name, layer: layer });
                }
            });
            const s = document.createElement('span');
            s.textContent = name;
            lbl.appendChild(cb);
            lbl.appendChild(s);
            oList.appendChild(lbl);
        });
        panel.appendChild(oList);

        // ── Toggle & close-on-outside-click ────────────────────────────
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const opening = panel.style.display === 'none';
            if (opening) {
                // Sync radio/checkbox states with actual map layer state
                Object.entries(baseLayers).forEach(function([name]) {
                    const r = kList.querySelector(`input[data-name="${CSS.escape(name)}"]`);
                    if (r) r.checked = map.hasLayer(baseLayers[name]);
                });
                Object.entries(overlayLayers).forEach(function([name]) {
                    const cb = oList.querySelector(`input[data-name="${CSS.escape(name)}"]`);
                    if (cb) cb.checked = map.hasLayer(overlayLayers[name]);
                });
            }
            panel.style.display = opening ? '' : 'none';
        });
        document.addEventListener('click', function(e) {
            if (!wrap.contains(e.target)) panel.style.display = 'none';
        });

        return wrap;
    };

    ctrl.addTo(map);
    return ctrl;
}

// ─── Richtfunkstrecken ─────────────────────────────────────────────────────────────
// Draws dashed polylines between all stations linked via their richtfunk[] arrays.
// Each pair is drawn exactly once (both directions de-duplicated via sorted key).

function drawRichtfunkLines(layerGroup) {
    layerGroup.clearLayers();
    if (!Array.isArray(standorte) || standorte.length === 0) return;
    const seen = new Set();
    standorte.forEach(function(s) {
        if (!s.lat || !s.lon || !Array.isArray(s.richtfunk) || s.richtfunk.length === 0) return;
        s.richtfunk.forEach(function(targetId) {
            const pair = [String(s.nummer), String(targetId)].sort().join('\u2194');
            if (seen.has(pair)) return;
            seen.add(pair);
            const t = standorte.find(function(st) { return String(st.nummer) === String(targetId); });
            if (!t || !t.lat || !t.lon) return;

            const startColor = getStationPrefixColor(s.nummer);
            const endColor = getStationPrefixColor(t.nummer);
            const lineColor = mixHexColors(startColor, endColor);

            L.polyline([[s.lat, s.lon], [t.lat, t.lon]], {
                color: lineColor,
                weight: 4,
                opacity: 0.95,
                dashArray: '6, 6',
                className: 'no-filter richtfunk-line'
            })
            .bindTooltip(
                s.nummer + ' \u2013 ' + s.name + '<br>' + t.nummer + ' \u2013 ' + t.name,
                { sticky: true }
            )
            .addTo(layerGroup);
        });
    });
}

function initLeafletMap() {
    leafletMap = L.map('mainMap').setView([48.6, 9.2], 7);

    const isDarkMode = document.documentElement.classList.contains('dark');
    const useDarkMap = isDarkMode;

    osmLayer = L.tileLayer(getThemeAwareOsmUrl(), {
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
        attribution: '\u00a9 Deutscher Wetterdienst (DWD)',
        className: 'no-filter dwd-warn-tile',
        zIndex: 150
    });

    // Rain radar overlay group (lazy-populated via loadRadarFrames)
    radarOverlayGroup = L.layerGroup();

    // Richtfunkstrecken: lazy-drawn polylines between linked stations
    const richtfunkLayer = L.layerGroup();

    const overlayLayers = {
        'DWD Warnzonen':         dwdWarningsLayer,
        [RAINVIEWER_LAYER_NAME]: radarOverlayGroup,
        'Richtfunkstrecken':     richtfunkLayer
    };

    _buildCustomLayerControl(leafletMap, baseLayers, overlayLayers);
    restoreActiveOverlayLayers(overlayLayers);

    // Inject MDI icons into zoom buttons; init DiPUL after DOM settles
    requestAnimationFrame(function() {
        [
            { sel: '.leaflet-control-zoom-in',  icon: 'plus'  },
            { sel: '.leaflet-control-zoom-out', icon: 'minus' }
        ].forEach(function(d) {
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

    // Overlay state + radar timeline + richtfunk lines
    leafletMap.on('overlayadd', function(e) {
        saveActiveOverlayLayerNames(overlayLayers);
        if (e.name === RAINVIEWER_LAYER_NAME) {
            loadRadarFrames();
            showRadarTimeline();
        }
        if (e.name === 'Richtfunkstrecken') {
            drawRichtfunkLines(richtfunkLayer);
        }
    });
    leafletMap.on('overlayremove', function(e) {
        saveActiveOverlayLayerNames(overlayLayers);
        if (e.name === RAINVIEWER_LAYER_NAME) {
            hideRadarTimeline();
        }
        if (e.name === 'Richtfunkstrecken') {
            richtfunkLayer.clearLayers();
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

function updateMapMarkers(liste) {
    if (markerClusterGroup) {
        leafletMap.removeLayer(markerClusterGroup);
    }

    const colors = STATION_PREFIX_COLORS;

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
            const clusterColor = colors[dominantPrefix] || '#3b82f6';

            return L.divIcon({
                html: `<div style="background-color: ${clusterColor}; color: white; font-weight: bold; font-size: 12px; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${count}</div>`,
                className: 'custom-cluster-icon',
                iconSize: [32, 32]
            });
        }
    });

    window._markersByNummer = new Map();

    window.updateStationMarkersInteractivity = function(interactive) {
        if (!window._markersByNummer) return;
        window._markersByNummer.forEach(marker => {
            if (!marker || !marker.options) return;
            marker.options.interactive = Boolean(interactive);
            if (marker._icon) marker._icon.style.pointerEvents = interactive ? '' : 'none';
            if (marker._shadow) marker._shadow.style.pointerEvents = interactive ? '' : 'none';
        });
        if (markerClusterGroup && typeof markerClusterGroup.refreshClusters === 'function') {
            try { markerClusterGroup.refreshClusters(); } catch (err) { /* ignore */ }
        }
    };

    liste.forEach(s => {
        if (!s.lat || !s.lon) return;
        const prefix = Math.floor(s.nummer / 1000);
        const markerColor = colors[prefix] || '#3b82f6';
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

        const marker = L.marker([s.lat, s.lon], { icon: smallMarker, prefix: prefix, interactive: !window.overlayEditMode });
        marker.bindTooltip(`<b>${s.nummer}</b> ${s.name}${isFav ? ' ★' : ''}`, { direction: 'top', offset: [0, -10] });
        marker.on('click', (e) => {
            if (window.overlayEditMode) return;
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
                if (payload && payload.features) {
                    payload.features.forEach(f => {
                        if (f.geometry && f.geometry.coordinates) {
                            if (f.geometry.type === 'Point') {
                                const lat = f.geometry.coordinates[1];
                                const lng = f.geometry.coordinates[0];
                                bounds.extend([lat, lng]);
                                if (f.properties && f.properties.overlayType === 'kreis') {
                                    const radius = f.properties.radius || 100;
                                    const rLat = radius / 111320;
                                    const rLng = radius / (40075 * Math.cos(lat * Math.PI / 180));
                                    bounds.extend([lat + rLat, lng + rLng]);
                                    bounds.extend([lat - rLat, lng - rLng]);
                                }
                            } else if (f.geometry.type === 'LineString') {
                                f.geometry.coordinates.forEach(c => bounds.extend([c[1], c[0]]));
                            } else if (f.geometry.type === 'Polygon' && f.geometry.coordinates[0]) {
                                f.geometry.coordinates[0].forEach(c => bounds.extend([c[1], c[0]]));
                            }
                        }
                    });
                }
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
        if (payload && payload.features) {
            payload.features.forEach(f => {
                if (f.geometry && f.geometry.coordinates) {
                    if (f.geometry.type === 'Point') {
                        const lat = f.geometry.coordinates[1];
                        const lng = f.geometry.coordinates[0];
                        bounds.extend([lat, lng]);
                        if (f.properties && f.properties.overlayType === 'kreis') {
                            const radius = f.properties.radius || 100;
                            const rLat = radius / 111320;
                            const rLng = radius / (40075 * Math.cos(lat * Math.PI / 180));
                            bounds.extend([lat + rLat, lng + rLng]);
                            bounds.extend([lat - rLat, lng - rLng]);
                        }
                    } else if (f.geometry.type === 'LineString') {
                        f.geometry.coordinates.forEach(c => bounds.extend([c[1], c[0]]));
                    } else if (f.geometry.type === 'Polygon' && f.geometry.coordinates[0]) {
                        f.geometry.coordinates[0].forEach(c => bounds.extend([c[1], c[0]]));
                    }
                }
            });
        }
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
