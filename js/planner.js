// ─── Tourenplaner ───────────────────────────────────────────────────────────────────
// Session-only queue; OSRM /trip routing; starts & ends at userLat/userLon.

let plannerQueue      = [];   // [{ nummer, name, lat, lon }]
let plannerRouteLayer = null; // Leaflet GeoJSON layer for the planned route
let plannerOpen       = false;

// ─── QUEUE MANAGEMENT ────────────────────────────────────────────────────────

function addToPlannerQueue(nummer) {
    const s = standorte.find(st => String(st.nummer) === String(nummer));
    if (!s) return;
    if (plannerQueue.some(q => String(q.nummer) === String(nummer))) return;
    if (plannerQueue.length >= 12) {
        alert('Tourenplaner: Maximal 12 Stopps möglich.');
        return;
    }
    plannerQueue.push({ nummer: s.nummer, name: s.name, lat: s.lat, lon: s.lon });
    _clearRouteLayer();
    renderPlannerList();
    refreshPlannerAddBtns();
    updatePlannerButtonForCurrent();
}

function removeFromPlannerQueue(nummer) {
    plannerQueue = plannerQueue.filter(q => String(q.nummer) !== String(nummer));
    _clearRouteLayer();
    renderPlannerList();
    refreshPlannerAddBtns();
    updatePlannerButtonForCurrent();
}

function clearPlannerQueue() {
    plannerQueue = [];
    _clearRouteLayer();
    renderPlannerList();
    updatePlannerButtonForCurrent();
}

function movePlannerStop(index, direction) {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= plannerQueue.length) return;
    const tmp = plannerQueue[index];
    plannerQueue[index] = plannerQueue[newIdx];
    plannerQueue[newIdx] = tmp;
    _clearRouteLayer();
    renderPlannerList();
}

function isPlannerQueued(nummer) {
    return plannerQueue.some(q => String(q.nummer) === String(nummer));
}

function _clearRouteLayer() {
    if (plannerRouteLayer && leafletMap) {
        leafletMap.removeLayer(plannerRouteLayer);
        plannerRouteLayer = null;
    }
    const resultEl = document.getElementById('plannerResult');
    if (resultEl) resultEl.innerHTML = '';
}

function _clearRouteLayerOnly() {
    if (plannerRouteLayer && leafletMap) {
        leafletMap.removeLayer(plannerRouteLayer);
        plannerRouteLayer = null;
    }
}

// Called by dashboard.js to keep the + button in sync
function updatePlannerButtonForCurrent() {
    if (!currentStandort) return;
    const btn = document.getElementById('btnAddToPlanner');
    if (!btn) return;
    const queued = isPlannerQueued(currentStandort.nummer);
    btn.innerHTML = queued
        ? `<i class="mdi mdi-map-minus text-base"></i><span>Von Tour entfernen</span>`
        : `<i class="mdi mdi-map-plus text-base"></i><span>Zur Tour hinzufügen</span>`;
    btn.classList.toggle('text-blue-600', queued);
    btn.classList.toggle('dark:text-blue-400', queued);
}

function togglePlannerForCurrent() {
    if (!currentStandort) return;
    if (isPlannerQueued(currentStandort.nummer)) {
        removeFromPlannerQueue(currentStandort.nummer);
    } else {
        addToPlannerQueue(currentStandort.nummer);
    }
}

// ─── DRAWER TOGGLE ───────────────────────────────────────────────────────────

function togglePlannerDrawer() {
    plannerOpen = !plannerOpen;
    const drawer = document.getElementById('plannerDrawer');
    if (!drawer) return;
    drawer.classList.toggle('translate-y-0', plannerOpen);
    drawer.classList.toggle('translate-y-full', !plannerOpen);
    document.body.classList.toggle('planner-mode', plannerOpen);
    _syncPlannerBadge();
}

function closePlannerDrawer() {
    plannerOpen = false;
    const drawer = document.getElementById('plannerDrawer');
    if (drawer) {
        drawer.classList.remove('translate-y-0');
        drawer.classList.add('translate-y-full');
    }
    document.body.classList.remove('planner-mode');
}

function _syncPlannerBadge() {
    const badge = document.getElementById('plannerBadge');
    if (!badge) return;
    badge.textContent = plannerQueue.length > 0 ? plannerQueue.length : '';
    badge.classList.toggle('hidden', plannerQueue.length === 0);
}

// Sync all visible list-item planner add buttons to reflect current queue state
function refreshPlannerAddBtns() {
    document.querySelectorAll('[data-planner-btn]').forEach(btn => {
        const num    = btn.dataset.plannerBtn;
        const queued = isPlannerQueued(num);
        const icon   = btn.querySelector('.planner-add-icon');
        if (icon) {
            icon.classList.toggle('mdi-map-marker-plus',   !queued);
            icon.classList.toggle('mdi-map-marker-check',   queued);
        }
        btn.classList.toggle('is-queued', queued);
    });
}

// Called from list.js planner-add-btn onclick
function togglePlannerFromList(nummer) {
    if (isPlannerQueued(nummer)) {
        removeFromPlannerQueue(nummer);
    } else {
        addToPlannerQueue(nummer);
    }
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function renderPlannerList() {
    const list    = document.getElementById('plannerStopsList');
    const empty   = document.getElementById('plannerEmpty');
    const actions = document.getElementById('plannerActions');
    if (!list) return;

    _syncPlannerBadge();

    if (plannerQueue.length === 0) {
        list.innerHTML = '';
        if (empty)   empty.classList.remove('hidden');
        if (actions) actions.classList.add('hidden');
        return;
    }
    if (empty)   empty.classList.add('hidden');
    if (actions) actions.classList.remove('hidden');

    // Warn if no user location is set
    const hasLocation = !!(userLat && userLon);
    const locationNote = !hasLocation
        ? `<p class="text-[10px] text-amber-500 dark:text-amber-400 py-1 flex items-center gap-1"><i class="mdi mdi-alert-circle-outline text-sm"></i>Kein Startpunkt gesetzt — bitte oben rechts Standort festlegen.</p>`
        : `<p class="text-[10px] text-slate-400 dark:text-zinc-500 py-0.5 flex items-center gap-1"><i class="mdi mdi-map-marker text-xs text-violet-500"></i>Route beginnt &amp; endet an deinem gesetzten Standort</p>`;

    list.innerHTML = locationNote + plannerQueue.map((s, i) => `
        <div class="flex items-center gap-1.5 py-1.5 border-b border-slate-100 dark:border-zinc-800 last:border-0">
            <span class="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center shrink-0">${i + 1}</span>
            <span class="flex-1 text-sm text-slate-800 dark:text-zinc-200 truncate min-w-0">
                <span class="font-semibold">${s.nummer}</span>
                <span class="text-slate-500 dark:text-zinc-400 ml-1">${s.name}</span>
            </span>
            <div class="flex items-center gap-0.5 shrink-0">
                <button onclick="movePlannerStop(${i}, -1)" ${i === 0 ? 'disabled' : ''} class="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors" title="Nach oben">
                    <i class="mdi mdi-chevron-up text-base"></i>
                </button>
                <button onclick="movePlannerStop(${i}, 1)" ${i === plannerQueue.length - 1 ? 'disabled' : ''} class="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors" title="Nach unten">
                    <i class="mdi mdi-chevron-down text-base"></i>
                </button>
                <button onclick="removeFromPlannerQueue('${s.nummer}')" class="w-6 h-6 flex items-center justify-center rounded text-slate-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="Entfernen">
                    <i class="mdi mdi-close text-sm"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// ─── ROUTING ─────────────────────────────────────────────────────────────────

async function runPlannerRoute() {
    if (plannerQueue.length < 1) {
        alert('Bitte mindestens einen Stopp zur Tour hinzufügen.');
        return;
    }

    const resultEl = document.getElementById('plannerResult');
    if (resultEl) resultEl.innerHTML = `<p class="text-xs text-slate-500 dark:text-zinc-400 py-2 flex items-center gap-1"><i class="mdi mdi-loading mdi-spin text-sm"></i>Route wird berechnet…</p>`;

    _clearRouteLayerOnly();

    const hasLocation = !!(userLat && userLon);

    // With user location: [home, stop1, …, home] round trip; without: [stop1, …, stopN] only
    const allPoints = hasLocation
        ? [{ lat: userLat, lon: userLon }, ...plannerQueue, { lat: userLat, lon: userLon }]
        : plannerQueue;

    if (allPoints.length < 2) {
        if (resultEl) resultEl.innerHTML = `<p class="text-xs text-amber-500 py-2">Nicht genug Stopps oder kein Startpunkt gesetzt.</p>`;
        return;
    }

    const coords = allPoints.map(p => `${p.lon},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/trip/v1/driving/${coords}?roundtrip=false&source=first&destination=last&overview=full&geometries=geojson`;

    try {
        const res  = await fetch(url);
        if (!res.ok) throw new Error(`OSRM Fehler ${res.status}`);
        const data = await res.json();
        if (!data.trips || data.trips.length === 0) throw new Error('Keine Route gefunden');

        const trip    = data.trips[0];
        const distKm  = (trip.distance / 1000).toFixed(1);
        const mins    = Math.round(trip.duration / 60);
        const timeStr = mins < 60 ? `${mins} Min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;

        // Reconstruct optimised stop order from OSRM waypoints (waypoint_index = trip position).
        // Exclude first/last home points when hasLocation is true.
        let orderedStops = plannerQueue; // fallback: keep manual order
        if (data.waypoints && data.waypoints.length > 0) {
            if (hasLocation) {
                // allPoints[0] = home start, allPoints[1..n-1] = stops, allPoints[n] = home end
                const stopWaypoints = data.waypoints
                    .map((wp, originalIdx) => ({ wp, originalIdx }))
                    .filter(({ originalIdx }) => originalIdx > 0 && originalIdx < allPoints.length - 1);

                stopWaypoints.sort((a, b) => a.wp.waypoint_index - b.wp.waypoint_index);
                const mapped = stopWaypoints
                    .map(({ originalIdx }) => plannerQueue[originalIdx - 1])
                    .filter(Boolean);
                if (mapped.length === plannerQueue.length) orderedStops = mapped;
            } else {
                const sorted = data.waypoints
                    .map((wp, originalIdx) => ({ wp, originalIdx }))
                    .sort((a, b) => a.wp.waypoint_index - b.wp.waypoint_index);
                const mapped = sorted
                    .map(({ originalIdx }) => plannerQueue[originalIdx])
                    .filter(Boolean);
                if (mapped.length === plannerQueue.length) orderedStops = mapped;
            }
        }

        const homeLabel   = `<span class="font-medium text-violet-600 dark:text-violet-400">📍 Mein Standort</span>`;
        const stopLabels  = orderedStops.map(s => `<span class="font-semibold text-slate-700 dark:text-zinc-300">${s.nummer}</span>`);
        const routeParts  = hasLocation
            ? [homeLabel, ...stopLabels, homeLabel]
            : stopLabels;

        if (resultEl) {
            resultEl.innerHTML = `
                <div class="mt-2 p-2.5 bg-slate-50 dark:bg-zinc-900 rounded-md border border-slate-200 dark:border-zinc-800 text-xs space-y-1.5">
                    <div class="flex items-center gap-3 font-semibold text-slate-700 dark:text-zinc-300">
                        <span class="flex items-center gap-1"><i class="mdi mdi-map-marker-distance text-sm"></i>${distKm} km</span>
                        <span class="flex items-center gap-1"><i class="mdi mdi-clock-outline text-sm"></i>${timeStr}</span>
                        ${!hasLocation ? '<span class="text-amber-500 flex items-center gap-0.5"><i class="mdi mdi-alert-circle-outline text-xs"></i>ohne festen Startpunkt</span>' : ''}
                    </div>
                    <p class="text-slate-500 dark:text-zinc-500 leading-relaxed">Optimale Reihenfolge: ${routeParts.join(' → ')}</p>
                </div>`;
        }

        // Draw violet dashed polyline on main map
        if (leafletMap && trip.geometry) {
            plannerRouteLayer = L.geoJSON(trip.geometry, {
                style: { color: '#8b5cf6', weight: 4, opacity: 0.75, dashArray: '10 5' }
            }).addTo(leafletMap);
            leafletMap.fitBounds(plannerRouteLayer.getBounds(), { padding: [40, 40] });
        }

    } catch (e) {
        if (resultEl) resultEl.innerHTML = `<p class="text-xs text-red-500 py-2 flex items-center gap-1"><i class="mdi mdi-alert-circle text-sm"></i>${e.message}</p>`;
    }
}

function openPlannerNavigation() {
    if (plannerQueue.length === 0) return;
    const stops = plannerQueue;
    let url;

    if (userLat && userLon) {
        // Start from user's set location
        const dest      = stops[stops.length - 1];
        const waypoints = stops.slice(0, -1).map(s => `${s.lat},${s.lon}`).join('|');
        url = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLon}&destination=${dest.lat},${dest.lon}`;
        if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
    } else {
        // No user location — chain the stops
        const origin    = stops[0];
        const dest      = stops[stops.length - 1];
        const waypoints = stops.slice(1, -1).map(s => `${s.lat},${s.lon}`).join('|');
        url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lon}&destination=${dest.lat},${dest.lon}`;
        if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
    }

    window.open(url, '_blank');
}
