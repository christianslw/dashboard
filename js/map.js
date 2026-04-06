// ==========================================
// Leaflet Map & Clustering
// ==========================================

let osmLayer, cartoDBPositronLayer;
const RADAR_MAX_NATIVE_ZOOM = 10;
const RAINVIEWER_COLOR_SCHEME = 8;
const ACTIVE_OVERLAYS_STORAGE_KEY = 'activeOverlayLayers';
const RAINVIEWER_LAYER_NAME = 'Regenradar';

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
    });
    saveActiveOverlayLayerNames(overlayLayers);
}

function getThemeAwareOsmUrl(isDarkMode) {
    return isDarkMode
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
}

function getThemeAwareCartoUrl(isDarkMode) {
    return `https://{s}.basemaps.cartocdn.com/${isDarkMode ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`;
}

function initLeafletMap() {
    leafletMap = L.map('mainMap').setView([48.6, 9.2], 7);

    const isDarkMode = document.documentElement.classList.contains('dark');
    const useDarkMap = isDarkMode; // Respect appearance mode regardless of theme

    osmLayer = L.tileLayer(getThemeAwareOsmUrl(useDarkMap), {
        attribution: '© OpenStreetMap contributors, © CARTO',
        maxZoom: 19,
        className: 'no-filter'
    });

    cartoDBPositronLayer = L.tileLayer(getThemeAwareCartoUrl(useDarkMap), {
        attribution: '© CartoDB © OpenStreetMap contributors',
        maxZoom: 19,
        className: 'no-filter'
    });

    const openTopoMapLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenTopoMap',
        maxZoom: 17,
        className: 'no-filter'
    });

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri, DigitalGlobe, Earthstar Geographics',
        maxZoom: 19,
        className: 'no-filter'
    });

    const hybridLayer = L.layerGroup([
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri',
            maxZoom: 19,
            className: 'no-filter'
        }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri',
            maxZoom: 19,
            className: 'no-filter'
        }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
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
    const dwdWarningsLayer = L.tileLayer.wms('https://maps.dwd.de/geoserver/dwd/wms', {
        layers: 'dwd:Warnungen_Gemeinden_vereinigt',
        format: 'image/png',
        transparent: true,
        opacity: 0.65,
        attribution: '© Deutscher Wetterdienst (DWD)',
        className: 'no-filter dwd-warn-tile',
        zIndex: 150
    });

    // Rain radar overlay group (populated on demand by loadRadarFrames)
    radarOverlayGroup = L.layerGroup();

    const overlayLayers = {
        'DWD Warnzonen': dwdWarningsLayer,
        [RAINVIEWER_LAYER_NAME]: radarOverlayGroup
    };

    L.control.layers(baseLayers, overlayLayers, { position: 'topright' }).addTo(leafletMap);
    restoreActiveOverlayLayers(overlayLayers);

    // Inject local icons into Leaflet controls (layers toggle + zoom buttons)
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
    const newOsmUrl = getThemeAwareOsmUrl(isDarkMode);
    const newCartoUrl = getThemeAwareCartoUrl(isDarkMode);

    if (leafletMap && cartoDBPositronLayer && osmLayer) {
        cartoDBPositronLayer.setUrl(newCartoUrl);
        osmLayer.setUrl(newOsmUrl);
    }

    // Update Mobile Dashboard Map if it is currently initialized
    if (typeof dashMobileTileLayer !== 'undefined' && dashMobileTileLayer) {
        dashMobileTileLayer.setUrl(newOsmUrl);
    }
}

function updateMapMarkers(liste) {
    if (markerClusterGroup) {
        leafletMap.removeLayer(markerClusterGroup);
    }

    const colors = {
        1: '#8b5cf6',
        2: '#10b981',
        3: '#f59e0b',
        4: '#ef4444',
        5: '#ec4899',
        6: '#06b6d4',
        8: '#6366f1',
        9: '#eab308'
    };

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

        const smallMarker = isFav
            ? L.divIcon({
                html: `<div style="width:${starSize}px;height:${starSize}px;display:flex;align-items:center;justify-content:center;color:${markerColor};font-size:${starSize}px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))"><i class="mdi mdi-star" style="font-size:${starSize}px"></i></div>`,
                className: 'custom-small-marker',
                iconSize: [starSize, starSize],
                iconAnchor: [Math.round(starSize / 2), Math.round(starSize / 2)]
            })
            : L.divIcon({
                html: `<div style="width: ${markerSize}px; height: ${markerSize}px; background-color: ${markerColor}; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); box-sizing: border-box;"></div>`,
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
    });

    leafletMap.addLayer(markerClusterGroup);

    if (liste.length > 0) {
        if (liste.length === 1) {
            const s = liste[0];
            let bounds = L.latLngBounds([[s.lat, s.lon]]);

            if (s.zufahrt && s.zufahrt.length > 0) {
                const routeLatLngs = s.zufahrt.map(coord => [coord[1], coord[0]]);
                currentZufahrtLayer = L.polyline(routeLatLngs, {
                    color: '#ef4444',
                    weight: 5,
                    dashArray: '10, 10',
                    opacity: 0.9,
                    lineCap: 'round'
                }).addTo(leafletMap);
                bounds.extend(currentZufahrtLayer.getBounds());
            }

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

    if (currentZufahrtLayer) {
        leafletMap.removeLayer(currentZufahrtLayer);
        currentZufahrtLayer = null;
    }

    let bounds = L.latLngBounds([[standort.lat, standort.lon]]);

    if (standort.zufahrt && standort.zufahrt.length > 0) {
        const routeLatLngs = standort.zufahrt.map(coord => [coord[1], coord[0]]);
        currentZufahrtLayer = L.polyline(routeLatLngs, {
            color: '#ef4444',
            weight: 5,
            dashArray: '10, 10',
            opacity: 0.9,
            lineCap: 'round'
        }).addTo(leafletMap);

        bounds.extend(currentZufahrtLayer.getBounds());
    }
    
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
// ==========================================
// Rain Radar (RainViewer)
// ==========================================

async function loadRadarFrames() {
    radarFrames = [];
    radarLayerCache = {};
    radarCurrentFrameIndex = 0;
    updateRadarTimeline();
    try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await res.json();
        radarHost = data.host || 'https://tilecache.rainviewer.com';
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
