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
    updateDashKuerzel(standort);
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

    // Update Hauptzufahrt info inside the Fahrtzeit card
    const notice = document.getElementById('driveTimeNotice');
    if (notice) {
        if (hzEntry) {
            notice.className = 'mt-3 text-[11px] px-2 py-1.5 rounded-md flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50';
            notice.innerHTML = '<i class="mdi mdi-map-check text-xs shrink-0"></i> Hauptzufahrt hinterlegt — bei Navigation berücksichtigen.';
        } else {
            notice.className = 'mt-3 text-[11px] px-2 py-1.5 rounded-md flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50';
            notice.innerHTML = '<i class="mdi mdi-map-marker-alert-outline text-xs shrink-0"></i> Keine Hauptzufahrt hinterlegt — Zufahrt vor Ort eigenständig recherchieren.';
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

// ─── Dashboard title kürzel ──────────────────────────────────────────────────────────

function updateDashKuerzel(standort) {
    const el = document.getElementById('dashTitleKuerzel');
    if (!el) return;
    const k = (standort.standortkuerzel || '').trim();
    if (k) { el.textContent = '[' + k + ']'; el.classList.remove('hidden'); }
    else    { el.classList.add('hidden'); }
}

/** Refresh the Standort-Info metadata panel. Always visible; shows empty state when no data. */
function updateStandortInfoPanel(standort) {
    const panel = document.getElementById('standortInfoPanel');
    if (!panel) return;

    panel.classList.remove('hidden');

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
    // DFMG-ID is only shown when the site or tower is operated by DFMG
    const isDfmg = standort.betreiber_standort === 'DFMG' || standort.betreiber_sender === 'DFMG';
    setField('siDfmgWrap',              'siDfmg',              (isDfmg && standort.dfmg_id) ? standort.dfmg_id : '');
    setField('siBetreiberStandortWrap', 'siBetreiberStandort', standort.betreiber_standort || '');
    setField('siBetreiberSenderWrap',   'siBetreiberSender',   standort.betreiber_sender   || '');
    setField('siPvPateWrap',            'siPvPate',            standort.pv_pate || '');
    setField('siPvVertretungWrap',      'siPvVertretung',      standort.pv_vertretung || '');
    setField('siIfsPateWrap',           'siIfsPate',           standort.ifs_pate || '');

    // Richtfunk: clickable chips
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

    const hasData = [
        standort.standortkuerzel, standort.dfmg_id,
        standort.betreiber_standort, standort.betreiber_sender,
        standort.pv_pate, standort.pv_vertretung, standort.ifs_pate,
    ].some(v => v && String(v).trim()) ||
        (Array.isArray(standort.richtfunk) && standort.richtfunk.length > 0);

    const empty  = document.getElementById('siEmptyState');
    const fields = document.getElementById('siFieldList');
    if (empty)  empty.classList.toggle('hidden',  hasData);
    if (fields) fields.classList.toggle('hidden', !hasData);
}

// ─── Standort Edit (frontend PATCH) ──────────────────────────────────────────────────

const SE_BETREIBER_KNOWN = ['SWR','SMS','DFMG','BR','SR','ORF','MB','Swisscom'];

function seToggleBetreiber(selSuffix, customSuffix) {
    const sel = document.getElementById('seBetreiber' + selSuffix);
    const inp = document.getElementById('seBetreiber' + customSuffix);
    if (sel.value === '__custom__') { inp.classList.remove('hidden'); inp.focus(); }
    else { inp.classList.add('hidden'); inp.value = ''; }
}

function seGetBetreiber(selSuffix, customSuffix) {
    const sel = document.getElementById('seBetreiber' + selSuffix);
    const inp = document.getElementById('seBetreiber' + customSuffix);
    return sel.value === '__custom__' ? (inp.value.trim() || 'SWR') : sel.value;
}

function seSetBetreiber(selSuffix, customSuffix, value) {
    const sel = document.getElementById('seBetreiber' + selSuffix);
    const inp = document.getElementById('seBetreiber' + customSuffix);
    if (!value || SE_BETREIBER_KNOWN.includes(value)) {
        sel.value = value || 'SWR';
        inp.classList.add('hidden'); inp.value = '';
    } else {
        sel.value = '__custom__'; inp.value = value;
        inp.classList.remove('hidden');
    }
}

function openStandortEdit() {
    if (!currentStandort) return;
    const s = currentStandort;
    document.getElementById('standortEditModalTitle').textContent =
        `${s.nummer} – ${s.name} bearbeiten`;
    document.getElementById('seNameInput').value         = s.name              || '';
    document.getElementById('seKuerzelInput').value      = s.standortkuerzel   || '';
    document.getElementById('seDfmgInput').value         = s.dfmg_id           || '';
    document.getElementById('seRichtfunkInput').value    = Array.isArray(s.richtfunk) ? s.richtfunk.join(', ') : '';
    document.getElementById('sePvPateInput').value       = s.pv_pate           || '';
    document.getElementById('sePvVertretungInput').value = s.pv_vertretung     || '';
    document.getElementById('seIfsPateInput').value      = s.ifs_pate          || '';
    seSetBetreiber('StandortSel', 'StandortCustom', s.betreiber_standort || 'SWR');
    seSetBetreiber('SenderSel',   'SenderCustom',   s.betreiber_sender   || 'SWR');
    document.getElementById('seError').classList.add('hidden');
    document.getElementById('seSubmitBtn').disabled = false;
    document.getElementById('seSubmitBtn').textContent = 'Speichern';
    document.getElementById('standortEditModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('seNameInput').focus(), 50);
}

function closeStandortEdit() {
    document.getElementById('standortEditModal').classList.add('hidden');
}

async function saveStandortEdit() {
    if (!currentStandort) return;
    const btn   = document.getElementById('seSubmitBtn');
    const errEl = document.getElementById('seError');
    btn.disabled = true;
    btn.textContent = 'Speichere…';
    errEl.classList.add('hidden');

    const richtfunk = document.getElementById('seRichtfunkInput').value
        .split(/[,\s]+/).map(v => v.trim()).filter(Boolean);

    const body = {
        name:               document.getElementById('seNameInput').value.trim(),
        standortkuerzel:    document.getElementById('seKuerzelInput').value.trim().slice(0, 3),
        dfmg_id:            document.getElementById('seDfmgInput').value.trim(),
        richtfunk,
        pv_pate:            document.getElementById('sePvPateInput').value.trim(),
        pv_vertretung:      document.getElementById('sePvVertretungInput').value.trim(),
        ifs_pate:           document.getElementById('seIfsPateInput').value.trim(),
        betreiber_standort: seGetBetreiber('StandortSel', 'StandortCustom'),
        betreiber_sender:   seGetBetreiber('SenderSel',   'SenderCustom'),
    };

    let res;
    try {
        res = await fetch(`/api/standorte/${encodeURIComponent(currentStandort.nummer)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch (err) {
        errEl.textContent = 'Netzwerkfehler: ' + err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Speichern';
        return;
    }

    btn.disabled = false;
    btn.textContent = 'Speichern';

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errEl.textContent = data.error || 'Fehler beim Speichern.';
        errEl.classList.remove('hidden');
        return;
    }

    const data = await res.json();
    // Merge updated record into in-memory standort
    Object.assign(currentStandort, data.record ?? body);
    const idx = (typeof standorte !== 'undefined' ? standorte : [])
        .findIndex(s => String(s.nummer) === String(currentStandort.nummer));
    if (idx !== -1) standorte[idx] = currentStandort;

    closeStandortEdit();

    // Refresh dashboard display
    document.getElementById('dashTitleName').innerText = currentStandort.name;
    updateDashKuerzel(currentStandort);
    updateStandortInfoPanel(currentStandort);

    // Refresh list so name + kürzel chip update
    if (typeof filterStandorte === 'function') filterStandorte();
}

function getWayInstructions(nummer) {
    const stored = localStorage.getItem(`wayInstructions_${nummer}`);
    return stored ? stored : null;
}

function saveWayInstructionsToStorage(nummer, instructions) {
    if (instructions.trim() === '') {
        localStorage.removeItem(`wayInstructions_${nummer}`);
        localStorage.removeItem(`wayInstructionsBy_${nummer}`);
    } else {
        localStorage.setItem(`wayInstructions_${nummer}`, instructions);
        const nick = localStorage.getItem('nickname');
        if (nick) localStorage.setItem(`wayInstructionsBy_${nummer}`, nick);
        else      localStorage.removeItem(`wayInstructionsBy_${nummer}`);
    }
}

function displayWayInstructions() {
    if (!currentStandort) return;
    const instructions = getWayInstructions(currentStandort.nummer);
    const by = localStorage.getItem(`wayInstructionsBy_${currentStandort.nummer}`);
    const display = document.getElementById('wayInstructionsDisplay');
    if (instructions) {
        display.innerText = instructions;
        display.title = by ? `Bearbeitet von: ${by}` : '';
    } else {
        display.innerText = 'Keine Anweisungen';
        display.title = '';
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
let _printDetailMap = null;
let _printDetailMapOverlays = null;

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
function printAnfahrt(nummer) {
    const standort = nummer
        ? standorte.find(s => String(s.nummer) === String(nummer))
        : currentStandort;
    if (!standort) return;
    const container = document.getElementById('printAnfahrt');

    // —— Populate header ——
    // Remove dash between number and name, render both parts in normal weight
    const printTitle = document.getElementById('printTitle');
    printTitle.innerHTML = `<span style="font-weight:400;">${standort.nummer}</span> <span style="font-weight:300;">${standort.name}</span>`;
        // Add QR code for this Standort (link or dashboard URL)
        const qrWrap = document.getElementById('printQRWrap');
        if (qrWrap) {
            let qrData = window.location.origin + '/?standort=' + encodeURIComponent(standort.nummer);
            try {
                const qrUrl = generateQRCode(qrData, 80);
                qrWrap.innerHTML = `<img src="${qrUrl}" alt="QR Code" style="margin-top:0.2em;max-width:80px;max-height:80px;" />`;
            } catch (e) {
                qrWrap.innerHTML = '';
            }
        }
        // Ansprechpartner (if available)
        const aspDiv = document.getElementById('printAnsprechpartner');
        const pateDiv = document.getElementById('printPaten');
        if (aspDiv) {
            let asp = [];
            if (standort.ansprechpartner1) asp.push(standort.ansprechpartner1);
            if (standort.ansprechpartner2) asp.push(standort.ansprechpartner2);
            if (standort.ansprechpartner3) asp.push(standort.ansprechpartner3);
            if (asp.length) {
                aspDiv.innerHTML = `<b>Ansprechpartner:</b><br>` + asp.map(a => `<span style="display:inline-block;margin-right:1.5em;">${a}</span>`).join('');
            } else {
                aspDiv.innerHTML = '';
            }
        }
        if (pateDiv) {
            const paten = [];
            if (standort.pv_pate) paten.push(`<span style="display:inline-block;margin-right:1.5em;"><b>PV-Pate:</b> ${standort.pv_pate}</span>`);
            if (standort.pv_vertretung) paten.push(`<span style="display:inline-block;margin-right:1.5em;"><b>PV-Vertretung:</b> ${standort.pv_vertretung}</span>`);
            if (standort.ifs_pate) paten.push(`<span style="display:inline-block;margin-right:1.5em;"><b>IFS-Pate:</b> ${standort.ifs_pate}</span>`);
            pateDiv.innerHTML = paten.length ? paten.join('') : '';
        }
    document.getElementById('printCoords').textContent =
        `${standort.lat.toFixed(5)}\u00b0 N, ${standort.lon.toFixed(5)}\u00b0 E`;

    const printLegendSection = document.getElementById('printOverlayLegendSection');
    const printLegend = document.getElementById('printOverlayLegend');
    if (printLegend) printLegend.innerHTML = '';

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

    if (!_printDetailMap) {
        _printDetailMap = L.map('printMapDetail', {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
            tap: false
        });
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri, DigitalGlobe, Earthstar Geographics',
            maxZoom: 19,
            className: 'no-filter'
        }).addTo(_printDetailMap);
    }

    // Clear overlays from previous call
    if (_printMapOverlays) _printMap.removeLayer(_printMapOverlays);
    _printMapOverlays = L.layerGroup().addTo(_printMap);
    if (_printDetailMapOverlays) _printDetailMap.removeLayer(_printDetailMapOverlays);
    _printDetailMapOverlays = L.layerGroup().addTo(_printDetailMap);

    function ensurePrintEisabfallPattern(targetMap = _printMap) {
        const pane = targetMap?.getPane?.('overlayPane');
        const svg = pane?.querySelector?.('svg');
        if (!svg) return;
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.insertBefore(defs, svg.firstChild);
        }
        if (defs.querySelector('#ovEisabfallHatchPrint') && defs.querySelector('#ovEisabfallHatch')) return;

        const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        pattern.setAttribute('id', 'ovEisabfallHatchPrint');
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        pattern.setAttribute('width', '10');
        pattern.setAttribute('height', '10');
        pattern.setAttribute('patternTransform', 'rotate(45)');

        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', '0');
        bg.setAttribute('y', '0');
        bg.setAttribute('width', '10');
        bg.setAttribute('height', '10');
        bg.setAttribute('fill', '#fef3c7');

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', '0');
        line.setAttribute('y1', '0');
        line.setAttribute('x2', '0');
        line.setAttribute('y2', '10');
        line.setAttribute('stroke', '#d97706');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '4 3');

        pattern.appendChild(bg);
        pattern.appendChild(line);
        defs.appendChild(pattern);

        const patternCompat = pattern.cloneNode(true);
        patternCompat.setAttribute('id', 'ovEisabfallHatch');
        defs.appendChild(patternCompat);
    }

    function enforcePrintEisabfallHatch(layer, targetMap = _printMap) {
        const isEisabfall = layer?.feature?.properties?.zoneType === 'eisabfall';
        if (!isEisabfall) return;
        const apply = () => {
            ensurePrintEisabfallPattern(targetMap);
            const path = layer?._path;
            if (!path) return;
            path.classList.add('overlay-eisabfall-hatch');
            path.setAttribute('fill', 'rgba(234, 179, 8, 0.28)');
            path.setAttribute('fill-opacity', '1');
            path.style.fillOpacity = '1';
            path.style.strokeDasharray = 'none';
            if (!path.style.stroke) path.style.stroke = layer.feature?.properties?.color || '#eab308';
        };
        layer._ovEnforceHatch = apply;
        layer.on('add', apply);
        setTimeout(apply, 0);
    }

    function enforcePrintHatchesForAllLayers() {
        if (_printMapOverlays) _printMapOverlays.eachLayer(layer => {
            if (typeof layer._ovEnforceHatch === 'function') layer._ovEnforceHatch();
        });
        if (_printDetailMapOverlays) _printDetailMapOverlays.eachLayer(layer => {
            if (typeof layer._ovEnforceHatch === 'function') layer._ovEnforceHatch();
        });
    }

    function getPrintOverlayLegendName(feature) {
        if (typeof getOverlayFeatureName === 'function') return getOverlayFeatureName(feature);
        const p = feature?.properties || {};
        if (p.label && String(p.label).trim()) return String(p.label).trim();
        if (p.overlayType === 'anfahrt') {
            if (p.routeType === 'hauptzufahrt') return 'Hauptzufahrt';
            if (p.routeType === 'alternativ') return 'Alternative Zufahrt';
            return 'Freie Route';
        }
        if (p.overlayType === 'pfad') return 'Pfad';
        if (p.overlayType === 'zone' || p.overlayType === 'kreis') {
            if (p.zoneType === 'eisabfall') return 'Eisabfallzone';
            return p.note || 'Zone';
        }
        if (p.overlayType === 'icon') {
            if (p.iconType === 'schranke') return 'Schranke';
            if (p.iconType === 'tresor') return 'Schlüsseltresor';
            if (p.iconType === 'tor') return 'Tor';
            return p.note || 'Hinweis';
        }
        return 'Element';
    }

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
    L.marker([standort.lat, standort.lon], { icon }).addTo(_printDetailMapOverlays);

    // Main map overview bounds (station + full route/overlay extent)
    let overviewBounds = L.latLngBounds([[standort.lat, standort.lon]]);

    // Overlay features (routes, markers, zones)
    if (typeof getOverlayPayloadForStandort === 'function' && typeof createLayerFromFeature === 'function') {
        const payload = getOverlayPayloadForStandort(standort.nummer);
        const legendEntries = [];
        if (payload?.features) {
            payload.features.forEach(f => {
                const lyr = createLayerFromFeature(f);
                if (!lyr) return;
                _printMapOverlays.addLayer(lyr);
                enforcePrintEisabfallHatch(lyr);

                const detailLyr = createLayerFromFeature(f);
                if (detailLyr) {
                    _printDetailMapOverlays.addLayer(detailLyr);
                    enforcePrintEisabfallHatch(detailLyr, _printDetailMap);
                }

                const geom = f.geometry;
                if (geom?.coordinates) {
                    if (geom.type === 'Point') {
                        overviewBounds.extend([geom.coordinates[1], geom.coordinates[0]]);
                    } else if (geom.type === 'LineString') {
                        geom.coordinates.forEach(c => overviewBounds.extend([c[1], c[0]]));
                    } else if (geom.type === 'Polygon' && geom.coordinates[0]) {
                        geom.coordinates[0].forEach(c => overviewBounds.extend([c[1], c[0]]));
                    }
                }

                const label = getPrintOverlayLegendName(f);
                const color = f?.properties?.color || '#64748b';
                if (label) legendEntries.push({ label, color });
            });
        }

        if (printLegendSection && printLegend) {
            if (legendEntries.length === 0) {
                printLegendSection.style.display = 'none';
            } else {
                const esc = (value) => String(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
                printLegend.innerHTML = legendEntries.map(entry =>
                    `<span class="print-legend-inline-item"><span class="print-legend-swatch" style="background:${esc(entry.color)}"></span><span>${esc(entry.label)}</span></span>`
                ).join('');
                printLegendSection.style.display = '';
            }
        }
    }

    // Compute a station-near detail extent for inset map
    const stationLatLng = L.latLng(standort.lat, standort.lon);
    const detailRadiusMeters = 180;
    const detailPoints = [stationLatLng];

    if (typeof getOverlayPayloadForStandort === 'function') {
        const payload = getOverlayPayloadForStandort(standort.nummer);
        if (payload?.features) {
            payload.features.forEach(f => {
                const geom = f.geometry;
                if (!geom?.coordinates) return;

                const maybeAdd = (lat, lon) => {
                    if (typeof lat !== 'number' || typeof lon !== 'number') return;
                    const p = L.latLng(lat, lon);
                    if (stationLatLng.distanceTo(p) <= detailRadiusMeters) detailPoints.push(p);
                };

                if (geom.type === 'Point') {
                    maybeAdd(geom.coordinates[1], geom.coordinates[0]);
                } else if (geom.type === 'LineString') {
                    geom.coordinates.forEach(c => maybeAdd(c[1], c[0]));
                } else if (geom.type === 'Polygon' && geom.coordinates[0]) {
                    geom.coordinates[0].forEach(c => maybeAdd(c[1], c[0]));
                }
            });
        }
    }

    let detailBounds = L.latLngBounds(detailPoints);
    if (detailPoints.length <= 1 || !detailBounds.isValid() || detailBounds.getNorthEast().equals(detailBounds.getSouthWest())) {
        const pad = 0.0012;
        detailBounds = L.latLngBounds(
            [standort.lat - pad, standort.lon - pad],
            [standort.lat + pad, standort.lon + pad]
        );
    }

    _printMap.invalidateSize({ animate: false });
    if (overviewBounds.isValid() && !overviewBounds.getNorthEast().equals(overviewBounds.getSouthWest())) {
        _printMap.fitBounds(overviewBounds, { padding: [28, 28], maxZoom: 16, animate: false });
    } else {
        _printMap.setView([standort.lat, standort.lon], 14, { animate: false });
    }

    _printDetailMap.invalidateSize({ animate: false });
    _printDetailMap.fitBounds(detailBounds, { padding: [8, 8], maxZoom: 19, animate: false });

    function waitForPrintTiles(timeoutMs = 5000) {
        const start = Date.now();
        return new Promise(resolve => {
            const check = () => {
                const allTiles = Array.from(container.querySelectorAll('.leaflet-tile'));
                const pending = allTiles.filter(tile => !tile.classList.contains('leaflet-tile-loaded'));
                if (allTiles.length > 0 && pending.length === 0) return resolve();
                if (Date.now() - start >= timeoutMs) return resolve();
                setTimeout(check, 120);
            };
            check();
        });
    }

    // Wait for tile images (especially cross-origin satellite tiles) before print
    waitForPrintTiles(6000).then(() => {
        ensurePrintEisabfallPattern();
        enforcePrintHatchesForAllLayers();
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
    });
}