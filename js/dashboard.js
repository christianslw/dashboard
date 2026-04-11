// ─── Dashboard & Way Instructions ────────────────────────────────────────────

let dashMobileMapInstance = null;
let dashMobileTileLayer = null;
let dashMobileMarker = null;
let dashMobileRouteLayer = null;
let dashMobileOverlayGroup = null;

function openDashboard(nummer) {
    const standort = standorte.find(s => String(s.nummer) === String(nummer));
    if (!standort) return;
    currentStandort = standort;

    // Deep link: reflect open site in URL
    history.replaceState(null, '', '?standort=' + encodeURIComponent(standort.nummer));

    if (typeof onOverlayTargetStandortChanged === 'function') {
        onOverlayTargetStandortChanged(standort.nummer);
    }

    focusMapOnStandort(standort.nummer);
    highlightListItem(nummer);

    const modal = document.getElementById("dashboardModal");

    document.getElementById("dashTitleNum").innerText = standort.nummer;
    document.getElementById("dashTitleName").innerText = standort.name;
    updateDashboardFavoriteButton();

    document.getElementById("trafficAlertBox").classList.add("hidden");

    if (standort.distance) {
        document.getElementById("driveTimeValue").innerText = "Prüfe...";
        document.getElementById("driveDistValue").innerText = `${standort.distance.toFixed(1)} km`;
        fetchRealRouteTimeDashboard(userLat, userLon, standort.lat, standort.lon, standort.distance);
    } else {
        document.getElementById("driveTimeValue").innerText = "--";
        document.getElementById("driveDistValue").innerText = "Start fehlt";
    }

    document.getElementById("windyIframe").src = `${WINDY_EMBED_URL}?type=map&location=coordinates&lat=${standort.lat}&lon=${standort.lon}&zoom=11&overlay=wind&marker=true&metricWind=m/s`;

    document.getElementById("btnTagebuch").href = getTagebuchLink(standort);
    const ordnerLink = standort.link.includes("/_standortinfo") ? standort.link.split("/_standortinfo")[0] : standort.link;
    document.getElementById("btnOrdner").href = ordnerLink;

    // Hauptzufahrt entry point (used for notice badge only)
    const hzEntry = getHauptzufahrtEntryPoint(standort.nummer);
    document.getElementById("btnRoute").href  = getNavLink(standort.lat, standort.lon);
    document.getElementById("btnRoute").title = '';

    // Update Hauptzufahrt notice badge
    const notice = document.getElementById('hauptzufahrtNotice');
    if (notice) {
        if (hzEntry) {
            notice.className = 'col-span-2 text-[11px] px-2 py-1.5 rounded-md flex items-center gap-1.5 justify-center bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50';
            notice.innerHTML = '<i class="mdi mdi-map-check text-sm shrink-0"></i> Hauptzufahrt hinterlegt — Bei Navigation berücksichtigen oder vor Ort anpeilen';
        } else {
            notice.className = 'col-span-2 text-[11px] px-2 py-1.5 rounded-md flex items-center gap-1.5 justify-center bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50';
            notice.innerHTML = '<i class="mdi mdi-map-marker-alert-outline text-sm shrink-0"></i> Keine Hauptzufahrt hinterlegt — Zufahrt vor Ort eigenständig recherchieren';
        }
    }

    fetchWeather(standort.lat, standort.lon);
    updateDWDDetailBox(standort.lat, standort.lon);
    updateStandortInfoPanel(standort);

    setupMobileMap(standort);

    // Planner button state
    if (typeof updatePlannerButtonForCurrent === 'function') {
        updatePlannerButtonForCurrent();
    }

    modal.classList.remove("hidden");
    modal.classList.add("modal-enter");
    setTimeout(() => modal.classList.add("modal-enter-active"), 10);

    displayWayInstructions();
    updateDashboardPrintButton();
}

function setupMobileMap(standort) {
    // Init map on first call
    if (!dashMobileMapInstance) {
        dashMobileMapInstance = L.map('dashMobileMap', {
            zoomControl: true,
            attributionControl: false
        });
    }

    // Refresh tile layer if theme changed
    if (dashMobileTileLayer) {
        dashMobileMapInstance.removeLayer(dashMobileTileLayer);
    }
    dashMobileTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        className: 'osm-tiles'
    }).addTo(dashMobileMapInstance);

    // Remove old markers and routes
    if (dashMobileMarker) {
        dashMobileMapInstance.removeLayer(dashMobileMarker);
    }
    if (dashMobileRouteLayer) {
        dashMobileMapInstance.removeLayer(dashMobileRouteLayer);
        dashMobileRouteLayer = null;
    }

    // Rebuild overlay layer group
    if (dashMobileOverlayGroup) {
        dashMobileMapInstance.removeLayer(dashMobileOverlayGroup);
    }
    dashMobileOverlayGroup = L.layerGroup().addTo(dashMobileMapInstance);

    // Marker color by station prefix (matches updateMapMarkers)
    const markerColors = {
        1: '#8b5cf6', 2: '#10b981', 3: '#f59e0b', 4: '#ef4444',
        5: '#ec4899', 6: '#06b6d4', 8: '#6366f1', 9: '#eab308'
    };
    const prefix = Math.floor(Number(standort.nummer) / 1000);
    const markerColor = markerColors[prefix] || '#3b82f6';

    const mobileIcon = L.divIcon({
        html: `<div style="width: 16px; height: 16px; background-color: ${markerColor}; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4);"></div>`,
        className: 'custom-mobile-marker',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });

    dashMobileMarker = L.marker([standort.lat, standort.lon], { icon: mobileIcon }).addTo(dashMobileMapInstance);

    // Render overlays (Hauptzufahrt, barriers, etc.)
    if (typeof getOverlayPayloadForStandort === 'function' && typeof createLayerFromFeature === 'function') {
        const payload = getOverlayPayloadForStandort(standort.nummer);
        if (payload && payload.features) {
            payload.features.forEach(feature => {
                const layer = createLayerFromFeature(feature);
                if (layer) dashMobileOverlayGroup.addLayer(layer);
            });
        }
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

    const hasBounds = bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest());

    if (hasBounds) {
        dashMobileMapInstance.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
    } else {
        dashMobileMapInstance.setView([standort.lat, standort.lon], 13);
    }

    // Fix Leaflet rendering bug in hidden modals — invalidate + re-fit after delay
    setTimeout(() => {
        if (!dashMobileMapInstance) return;
        dashMobileMapInstance.invalidateSize();
        if (hasBounds) {
            dashMobileMapInstance.fitBounds(bounds, { padding: [20, 20], maxZoom: 16, animate: false });
        } else {
            dashMobileMapInstance.setView([standort.lat, standort.lon], 13, { animate: false });
        }
    }, 300);
}

function closeDashboard() {
    if (typeof closeOverlayEditMode === 'function') {
        closeOverlayEditMode();
    }

    // Remove OSRM route polyline
    if (currentRouteLayer && leafletMap) {
        leafletMap.removeLayer(currentRouteLayer);
        currentRouteLayer = null;
    }

    // Clean deep link URL
    history.replaceState(null, '', location.pathname);

    const modal = document.getElementById("dashboardModal");
    modal.classList.remove("modal-enter-active");
    document.getElementById("windyIframe").src = "";
    setTimeout(() => modal.classList.add("hidden"), 200);
}

async function fetchRealRouteTimeDashboard(lat1, lon1, lat2, lon2, fallbackDist) {
    // Remove stale route polyline from a previous site
    if (currentRouteLayer && leafletMap) {
        leafletMap.removeLayer(currentRouteLayer);
        currentRouteLayer = null;
    }
    try {
        const res = await fetch(
            `${OSRM_BASE_URL}/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`
        );
        if (!res.ok) throw new Error("API Limit");

        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
            const route         = data.routes[0];
            const durationSec   = route.duration;
            const routeDistMeter = route.distance;

            const mins = Math.round(durationSec / 60);
            document.getElementById("driveTimeValue").innerText = mins < 60 ? `${mins} Min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;

            const avgSpeedKmh = (routeDistMeter / 1000) / (durationSec / 3600);
            if (avgSpeedKmh < 45 && routeDistMeter > 10000) {
                document.getElementById("trafficAlertBox").classList.remove("hidden");
                document.getElementById("trafficAlertText").innerText = "Langsame Routenführung. Möglicherweise Baustellen oder hohes Verkehrsaufkommen.";
            } else if (avgSpeedKmh < 30) {
                document.getElementById("trafficAlertBox").classList.remove("hidden");
                document.getElementById("trafficAlertText").innerText = "Sehr langsame Route. Stadtverkehr oder starker Stau erwartet.";
            }

            // Draw route polyline on main map
            if (leafletMap && route.geometry) {
                currentRouteLayer = L.geoJSON(route.geometry, {
                    style: {
                        color: '#3b82f6',
                        weight: 4,
                        opacity: 0.65
                    }
                }).addTo(leafletMap);
            }
        }
    } catch (e) {
        document.getElementById("driveTimeValue").innerText = calcDriveTimeFallback(fallbackDist);
    }
}

function copyCoords() {
    if (!currentStandort) return;
    navigator.clipboard.writeText(`${currentStandort.lat}, ${currentStandort.lon}`);
    const btnText = document.querySelector('button[onclick="copyCoords()"] span');
    const oldText = btnText.innerText;
    btnText.innerText = "Kopiert!";
    setTimeout(() => btnText.innerText = oldText, 2000);
}

// ─── Way Instructions ──────────────────────────────────────────────────────────────

// ─── Standort-Info Panel ───────────────────────────────────────────────────────────

/**
 * Populate (or hide) the Standort-Info metadata panel in the dashboard modal.
 * All fields are optional; the panel hides itself when none are present.
 */
function updateStandortInfoPanel(standort) {
    const panel = document.getElementById('standortInfoPanel');
    if (!panel) return;

    /** Helper: show/hide a wrapper element and set text or innerHTML in its child. */
    function setField(wrapId, contentId, value, isHtml = false) {
        const wrap = document.getElementById(wrapId);
        const el   = document.getElementById(contentId);
        if (!wrap || !el) return;
        if (value) {
            if (isHtml) el.innerHTML = value;
            else el.textContent = value;
            wrap.classList.remove('hidden');
        } else {
            wrap.classList.add('hidden');
        }
    }

    setField('siKuerzelWrap',           'siKuerzel',           standort.standortkuerzel || '');
    setField('siDfmgWrap',              'siDfmg',              standort.dfmg_id || '');
    setField('siBetreiberStandortWrap', 'siBetreiberStandort', standort.betreiber_standort || '');
    setField('siBetreiberSenderWrap',   'siBetreiberSender',   standort.betreiber_sender   || '');
    setField('siPvPateWrap',            'siPvPate',            standort.pv_pate || '');
    setField('siPvVertretungWrap',      'siPvVertretung',      standort.pv_vertretung || '');
    setField('siIfsPateWrap',           'siIfsPate',           standort.ifs_pate || '');

    // Richtfunk: render as clickable chips so users can jump to linked stations
    const rfWrap = document.getElementById('siRichtfunkWrap');
    const rfEl   = document.getElementById('siRichtfunk');
    if (rfWrap && rfEl) {
        const rf = Array.isArray(standort.richtfunk) ? standort.richtfunk.filter(Boolean) : [];
        if (rf.length > 0) {
            rfEl.innerHTML = rf.map(id => {
                const linked = (typeof standorte !== 'undefined' ? standorte : []).find(s => String(s.nummer) === String(id));
                const label  = linked ? `${id} – ${linked.name}` : id;
                return `<button onclick="openDashboard('${id}')" class="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors font-mono text-[11px]">${label}</button>`;
            }).join('');
            rfWrap.classList.remove('hidden');
        } else {
            rfWrap.classList.add('hidden');
        }
    }

    // Show panel only if at least one field has content
    const hasData = [
        standort.standortkuerzel, standort.dfmg_id,
        standort.betreiber_standort, standort.betreiber_sender,
        standort.pv_pate, standort.pv_vertretung, standort.ifs_pate,
    ].some(v => v && String(v).trim()) ||
        (Array.isArray(standort.richtfunk) && standort.richtfunk.length > 0);

    panel.classList.toggle('hidden', !hasData);
}

function getWayInstructions(nummer) {
    const stored = localStorage.getItem(`wayInstructions_${nummer}`);
    return stored ? stored : null;
}

function saveWayInstructionsToStorage(nummer, instructions) {
    if (instructions.trim() === '') {
        localStorage.removeItem(`wayInstructions_${nummer}`);
    } else {
        localStorage.setItem(`wayInstructions_${nummer}`, instructions);
    }
}

function displayWayInstructions() {
    if (!currentStandort) return;
    const instructions = getWayInstructions(currentStandort.nummer);
    const display = document.getElementById('wayInstructionsDisplay');
    if (instructions) {
        display.innerText = instructions;
    } else {
        display.innerText = 'Keine Anweisungen';
    }
}

function editWayInstructions() {
    if (!currentStandort) return;
    document.getElementById('wayModalStationNum').innerText = currentStandort.nummer;
    const storedInstructions = getWayInstructions(currentStandort.nummer) || '';
    document.getElementById('wayInstructionsInput').value = storedInstructions;
    document.getElementById('wayInstructionsModal').classList.remove('hidden');
}

function closeWayInstructionsModal() {
    document.getElementById('wayInstructionsModal').classList.add('hidden');
}

function saveWayInstructions() {
    if (!currentStandort) return;
    const instructions = document.getElementById('wayInstructionsInput').value;
    saveWayInstructionsToStorage(currentStandort.nummer, instructions);
    displayWayInstructions();
    updateDashboardPrintButton();
    closeWayInstructionsModal();
    // Sync to backend
    if (instructions.trim() === '') {
        window.__cfSync?.deleteFahrtanweisung(currentStandort.nummer);
    } else {
        window.__cfSync?.pushFahrtanweisung(currentStandort.nummer, instructions);
    }
}

function deleteWayInstructions() {
    if (!currentStandort) return;
    if (confirm('Fahrtanweisungen wirklich löschen?')) {
        saveWayInstructionsToStorage(currentStandort.nummer, '');
        displayWayInstructions();
        updateDashboardPrintButton();
        closeWayInstructionsModal();
        // Sync to backend
        window.__cfSync?.deleteFahrtanweisung(currentStandort.nummer);
    }
}

// ─── Hauptzufahrt helper ───────────────────────────────────────────────────────────────
// Returns the farthest coordinate on the Hauptzufahrt LineString as the nav
// entry point (the remote end = driver approach point from the public road).

function getHauptzufahrtEntryPoint(nummer) {
    if (typeof getOverlayPayloadForStandort !== 'function') return null;
    const payload = getOverlayPayloadForStandort(nummer);
    if (!payload?.features?.length) return null;

    const hz = payload.features.find(f =>
        f.geometry?.type === 'LineString' &&
        f.properties?.routeType === 'hauptzufahrt'
    );
    if (!hz || !hz.geometry.coordinates?.length) return null;

    const s = standorte.find(st => String(st.nummer) === String(nummer));
    if (!s) {
        // No station data — use first coordinate as entry point
        const c = hz.geometry.coordinates[0];
        return { lat: c[1], lon: c[0] };
    }

    // Find the coordinate that is farthest from the station location
    let entry = hz.geometry.coordinates[0];
    let maxDist = 0;
    for (const c of hz.geometry.coordinates) {
        const d = Math.hypot(c[0] - s.lon, c[1] - s.lat);
        if (d > maxDist) { maxDist = d; entry = c; }
    }
    return { lat: entry[1], lon: entry[0] };
}

// ─── Print: Anfahrt PDF ───────────────────────────────────────────────────────

let _printMap = null;
let _printMapOverlays = null;

/**
 * Show/hide the “Anfahrt drucken” button depending on whether the current
 * station has a Fahrtanweisung text and/or at least one overlay feature.
 */
function updateDashboardPrintButton() {
    const btn = document.getElementById('btnPrintAnfahrt');
    if (!btn || !currentStandort) return;

    const hasText    = !!getWayInstructions(currentStandort.nummer);
    const hasOverlay = typeof getOverlayPayloadForStandort === 'function' &&
        (getOverlayPayloadForStandort(currentStandort.nummer)?.features?.length > 0);

    btn.classList.toggle('hidden', !hasText && !hasOverlay);
}

/**
 * Build a print-ready PDF page for the current station:
 * one DIN-A4 page with the Zufahrtsoverlay rendered on a map and
 * the Fahrtanweisung text below it (sections are omitted when absent).
 *
 * Uses native window.print() so tile images render without CORS issues.
 * An extra Leaflet instance (#printMap) is used so print zoom/bounds are
 * independent of the dashboard map.
 */
function printAnfahrt() {
    if (!currentStandort) return;
    const standort  = currentStandort;
    const container = document.getElementById('printAnfahrt');

    // —— Populate header ——
    document.getElementById('printTitle').textContent =
        `${standort.nummer} – ${standort.name}`;
    document.getElementById('printDate').textContent =
        new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    document.getElementById('printCoords').textContent =
        `${standort.lat.toFixed(5)}\u00b0 N, ${standort.lon.toFixed(5)}\u00b0 E`;

    // —— Populate Fahrtanweisung text ——
    const text        = getWayInstructions(standort.nummer);
    const textSection = document.getElementById('printTextSection');
    document.getElementById('printText').textContent = text || '';
    textSection.style.display = text ? '' : 'none';

    // —— Place container off-screen but rendered so Leaflet can size itself ——
    container.style.cssText =
        'display:block;position:fixed;top:0;left:-9999px;width:210mm;z-index:-1;pointer-events:none;';

    // —— Initialise print Leaflet map (lazy, one-time) ——
    if (!_printMap) {
        _printMap = L.map('printMap', {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
            tap: false
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            crossOrigin: true
        }).addTo(_printMap);
    }

    // Clear overlays from previous call
    if (_printMapOverlays) _printMap.removeLayer(_printMapOverlays);
    _printMapOverlays = L.layerGroup().addTo(_printMap);

    // Station marker (same colour scheme as the main map)
    const markerColors = {
        1: '#8b5cf6', 2: '#10b981', 3: '#f59e0b', 4: '#ef4444',
        5: '#ec4899', 6: '#06b6d4', 8: '#6366f1', 9: '#eab308'
    };
    const prefix = Math.floor(Number(standort.nummer) / 1000);
    const mc = markerColors[prefix] || '#3b82f6';
    const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;background:${mc};border-radius:50%;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,.4)"></div>`,
        className: '',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });
    L.marker([standort.lat, standort.lon], { icon }).addTo(_printMapOverlays);

    // Overlay features (routes, markers, zones)
    if (typeof getOverlayPayloadForStandort === 'function' && typeof createLayerFromFeature === 'function') {
        const payload = getOverlayPayloadForStandort(standort.nummer);
        if (payload?.features) {
            payload.features.forEach(f => {
                const lyr = createLayerFromFeature(f);
                if (lyr) _printMapOverlays.addLayer(lyr);
            });
        }
    }

    // Compute bounds from station + overlay geometries
    let bounds = L.latLngBounds([[standort.lat, standort.lon]]);
    if (typeof getOverlayPayloadForStandort === 'function') {
        const payload = getOverlayPayloadForStandort(standort.nummer);
        if (payload?.features) {
            payload.features.forEach(f => {
                const geom = f.geometry;
                if (!geom?.coordinates) return;
                if (geom.type === 'Point') {
                    bounds.extend([geom.coordinates[1], geom.coordinates[0]]);
                } else if (geom.type === 'LineString') {
                    geom.coordinates.forEach(c => bounds.extend([c[1], c[0]]));
                } else if (geom.type === 'Polygon' && geom.coordinates[0]) {
                    geom.coordinates[0].forEach(c => bounds.extend([c[1], c[0]]));
                }
            });
        }
    }

    _printMap.invalidateSize({ animate: false });
    if (bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
        _printMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 16, animate: false });
    } else {
        _printMap.setView([standort.lat, standort.lon], 14, { animate: false });
    }

    // Let tiles load (≈900 ms) then trigger print
    setTimeout(() => {
        // Reset inline styles — @media print rules take over from here
        container.style.cssText = '';
        window.print();

        // After the print dialog closes, hide the container again
        const cleanup = () => {
            container.style.display = 'none';
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        setTimeout(cleanup, 5000); // fallback if afterprint doesn’t fire
    }, 900);
}