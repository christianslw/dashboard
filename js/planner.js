// ─── Tourenplaner v2 ─────────────────────────────────────────────────────────
// Persistent queue, per-stop comments, dual-route comparison,
// navMode-aware navigation, geofenced arrival notifications.

let plannerQueue          = [];   // [{ nummer, name, lat, lon, comment, visited }]
let plannerRouteLayer     = null; // Leaflet layer for optimised route
let plannerOpen           = false;
let tourName              = '';
let _geoWatchId           = null; // watchPosition handle
let _drawerResizeInited   = false;

// ── custom start / end overrides ──────────────────────────────────────────
let tourStartOverride     = null; // { lat, lon, name } or null → use userLat/userLon
let tourEndOverride       = null; // { lat, lon, name } or null → round-trip to start

// ── route display state ───────────────────────────────────────────────────
let _plannerUnclustered   = null; // L.layerGroup for tour markers removed from cluster
let _lastOptRouteGeom     = null; // [[lon,lat],…] optimised geometry
let _stdRouteGeom         = null; // [[lon,lat],…] standard geometry
let _activeRouteType      = 'opt'; // 'std' | 'opt'
let _previewRouteLayer    = null; // transient hover preview layer
let _orderedStops         = [];   // optimised stop order

// ── nearby suggestions setting ────────────────────────────────────────────
let showRouteSuggestions  = localStorage.getItem('routeSuggestions') !== 'false';
let suggestRadiusKm       = parseFloat(localStorage.getItem('suggestRadiusKm') || '3');
const SUGGEST_MAX_COUNT   = 8;
let _suggestionUnclustered = null; // L.layerGroup for suggestion markers pulled from cluster
let _suggestionRingLayer   = null; // L.layerGroup for circleMarker highlight rings

// ─── DATA MODEL HELPERS ───────────────────────────────────────────────────────

function _newStop(s) {
    return { nummer: s.nummer, name: s.name, lat: s.lat, lon: s.lon, comment: '', visited: false };
}

// ─── QUEUE MANAGEMENT ────────────────────────────────────────────────────────

function addToPlannerQueue(nummer) {
    const s = standorte.find(st => String(st.nummer) === String(nummer));
    if (!s) return;
    if (plannerQueue.some(q => String(q.nummer) === String(nummer))) return;
    if (plannerQueue.length >= 12) { alert('Tourenplaner: Maximal 12 Stopps möglich.'); return; }
    plannerQueue.push(_newStop(s));
    _clearRouteLayer();
    _saveActiveTour();
    renderPlannerList();
    refreshPlannerAddBtns();
    updatePlannerButtonForCurrent();
}

function removeFromPlannerQueue(nummer) {
    plannerQueue = plannerQueue.filter(q => String(q.nummer) !== String(nummer));
    _clearRouteLayer();
    _saveActiveTour();
    renderPlannerList();
    refreshPlannerAddBtns();
    updatePlannerButtonForCurrent();
}

function clearPlannerQueue() {
    plannerQueue = [];
    tourName = '';
    tourStartOverride = null;
    tourEndOverride   = null;
    _lastOptRouteGeom = null;
    _stdRouteGeom     = null;
    _orderedStops     = [];
    _clearRouteLayer();
    localStorage.removeItem('activeTour');
    stopTourGeofence();
    const inp = document.getElementById('tourNameInput');
    if (inp) inp.value = '';
    renderPlannerList();
    updatePlannerButtonForCurrent();
    _syncPlannerBadge();
}

function completeTour() {
    if (!confirm('Tour als abgeschlossen markieren und löschen?')) return;
    const saved = _getSavedTours();
    const active = _getActiveTourData();
    if (active && active.stops && active.stops.length > 0) {
        active.completedAt = new Date().toISOString();
        saved.unshift(active);
        localStorage.setItem('savedTours', JSON.stringify(saved.slice(0, 50)));
    }
    clearPlannerQueue();
}

function movePlannerStop(index, direction) {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= plannerQueue.length) return;
    [plannerQueue[index], plannerQueue[newIdx]] = [plannerQueue[newIdx], plannerQueue[index]];
    _clearRouteLayer();
    _saveActiveTour();
    renderPlannerList();
}

function isPlannerQueued(nummer) {
    return plannerQueue.some(q => String(q.nummer) === String(nummer));
}

function togglePlannerForCurrent() {
    if (!currentStandort) return;
    isPlannerQueued(currentStandort.nummer)
        ? removeFromPlannerQueue(currentStandort.nummer)
        : addToPlannerQueue(currentStandort.nummer);
}

function togglePlannerFromList(nummer) {
    isPlannerQueued(nummer) ? removeFromPlannerQueue(nummer) : addToPlannerQueue(nummer);
}

function updateStopComment(nummer, value) {
    const stop = plannerQueue.find(q => String(q.nummer) === String(nummer));
    if (stop) { stop.comment = value.trim(); _saveActiveTour(); }
}

function _clearRouteLayer() {
    _clearRouteLayerOnly();
    const resultEl = document.getElementById('plannerResult');
    if (resultEl) resultEl.innerHTML = '';
    _collapseRouteResults();
}

function _clearRouteLayerOnly() {
    if (plannerRouteLayer && leafletMap) {
        leafletMap.removeLayer(plannerRouteLayer);
        plannerRouteLayer = null;
    }
    clearRoutePreview();
}

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────

function _getActiveTourData() {
    try { return JSON.parse(localStorage.getItem('activeTour') || 'null'); } catch { return null; }
}

function _saveActiveTour() {
    if (plannerQueue.length === 0) { localStorage.removeItem('activeTour'); return; }
    const existing = _getActiveTourData();
    const data = {
        id: existing?.id || ('tour_' + Date.now()),
        name: tourName,
        stops: plannerQueue,
        startOverride: tourStartOverride,
        endOverride:   tourEndOverride,
        createdAt: existing?.createdAt || new Date().toISOString(),
        savedAt: new Date().toISOString(),
    };
    localStorage.setItem('activeTour', JSON.stringify(data));
    _syncPlannerBadge();
}

function _loadActiveTour() {
    const data = _getActiveTourData();
    if (!data || !Array.isArray(data.stops) || data.stops.length === 0) return;
    plannerQueue = data.stops.map(saved => {
        const live = standorte.find(s => String(s.nummer) === String(saved.nummer));
        return {
            nummer: saved.nummer,
            name: live ? live.name : saved.name,
            lat: live ? live.lat : saved.lat,
            lon: live ? live.lon : saved.lon,
            comment: saved.comment || '',
            visited: saved.visited || false,
        };
    });
    tourName          = data.name || '';
    tourStartOverride = data.startOverride || null;
    tourEndOverride   = data.endOverride   || null;
    const inp = document.getElementById('tourNameInput');
    if (inp) inp.value = tourName;
    renderPlannerList();
    refreshPlannerAddBtns();
    _syncPlannerBadge();
    if (Notification.permission === 'granted' && plannerQueue.some(s => s.comment)) {
        startTourGeofence();
    }
}

function saveCurrentTour() {
    if (plannerQueue.length === 0) return;
    let nameVal = (document.getElementById('tourNameInput')?.value || '').trim() || tourName.trim();
    if (!nameVal) {
        // Auto-generate a date-based name
        const now = new Date();
        nameVal = `Tour ${now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    }
    tourName = nameVal;
    const inp = document.getElementById('tourNameInput');
    if (inp) inp.value = tourName;
    const savedList = _getSavedTours();
    const existing = _getActiveTourData();
    const entry = {
        id: existing?.id || ('tour_' + Date.now()),
        name: tourName,
        stops: plannerQueue.map(s => ({ ...s })),
        createdAt: existing?.createdAt || new Date().toISOString(),
        savedAt: new Date().toISOString(),
    };
    const idx = savedList.findIndex(t => t.id === entry.id);
    if (idx >= 0) savedList[idx] = entry; else savedList.unshift(entry);
    localStorage.setItem('savedTours', JSON.stringify(savedList.slice(0, 50)));
    _saveActiveTour();
    showPlannerToast('Tour gespeichert ✓');
}

function _getSavedTours() {
    try { return JSON.parse(localStorage.getItem('savedTours') || '[]'); } catch { return []; }
}

function deleteSavedTour(id) {
    localStorage.setItem('savedTours', JSON.stringify(_getSavedTours().filter(t => t.id !== id)));
    renderSavedToursModal();
}

function loadSavedTour(id) {
    const tour = _getSavedTours().find(t => t.id === id);
    if (!tour) return;
    plannerQueue = tour.stops.map(s => ({ ...s }));
    tourName = tour.name || '';
    const inp = document.getElementById('tourNameInput');
    if (inp) inp.value = tourName;
    _clearRouteLayer();
    _saveActiveTour();
    renderPlannerList();
    refreshPlannerAddBtns();
    updatePlannerButtonForCurrent();
    closeSavedToursModal();
    if (!plannerOpen) togglePlannerDrawer();
}

// ─── SAVED TOURS MODAL ───────────────────────────────────────────────────────

function openSavedToursModal() {
    renderSavedToursModal();
    document.getElementById('savedToursModal')?.classList.remove('hidden');
}

function closeSavedToursModal() {
    document.getElementById('savedToursModal')?.classList.add('hidden');
}

function renderSavedToursModal() {
    const list = document.getElementById('savedToursList');
    if (!list) return;
    const tours = _getSavedTours();
    if (tours.length === 0) {
        list.innerHTML = `<p class="text-sm text-slate-400 dark:text-zinc-500 text-center py-6">Noch keine gespeicherten Touren.</p>`;
        return;
    }
    list.innerHTML = tours.map(t => {
        const date = t.savedAt ? new Date(t.savedAt).toLocaleDateString('de-DE') : '';
        const stops = Array.isArray(t.stops) ? t.stops.length : 0;
        const completed = !!t.completedAt;
        return `
        <div class="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-zinc-800 last:border-0">
            <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-slate-800 dark:text-zinc-100 truncate flex items-center gap-1.5">
                    <i class="mdi ${completed ? 'mdi-check-circle text-green-500' : 'mdi-map-marker-path text-violet-500'} text-base shrink-0"></i>
                    ${_esc(t.name || 'Unbenannte Tour')}
                </p>
                <p class="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">${stops} Stopp${stops !== 1 ? 's' : ''} · ${date}</p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
                ${!completed ? `<button onclick="loadSavedTour('${t.id}')" class="px-2.5 py-1 text-xs font-medium border border-blue-500 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">Laden</button>` : ''}
                <button onclick="deleteSavedTour('${t.id}')" class="p-1.5 text-slate-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors" title="Löschen">
                    <i class="mdi mdi-delete-outline text-base"></i>
                </button>
            </div>
        </div>`;
    }).join('');
}

function _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
    if (plannerOpen) {
        _initDrawerResize();
        // Re-apply dim + redraw route if one was computed
        if (plannerQueue.length > 0) _applyRouteDimming(true);
        if (_lastOptRouteGeom || _stdRouteGeom) selectPlannerRoute(_activeRouteType);
    } else {
        _clearSuggestionPulse();
        clearRoutePreview();
        _clearRouteLayerOnly();      // remove route from map
        _applyRouteDimming(false);   // restore all markers
    }
}

// Drag the top handle to resize the whole drawer
function _initDrawerResize() {
    if (_drawerResizeInited) return;
    const handle = document.getElementById('plannerDragHandle');
    const inner  = document.getElementById('plannerInner');
    if (!handle || !inner) return;
    _drawerResizeInited = true;

    let dragging = false, startY = 0, startH = 0;
    const MIN_H = 120, MAX_H_VH = 0.85;

    function onStart(y) {
        dragging = true;
        startY   = y;
        startH   = inner.offsetHeight;
        document.body.style.userSelect = 'none';
        document.body.style.cursor     = 'row-resize';
    }
    function onMove(y) {
        if (!dragging) return;
        const maxH = Math.floor(window.innerHeight * MAX_H_VH);
        // dragging UP (y < startY) → taller drawer
        const h = Math.max(MIN_H, Math.min(startH + (startY - y), maxH));
        inner.style.height = h + 'px';
    }
    function onEnd() {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = '';
        document.body.style.cursor     = '';
    }

    handle.addEventListener('mousedown',  e => { onStart(e.clientY); e.preventDefault(); });
    document.addEventListener('mousemove', e => onMove(e.clientY));
    document.addEventListener('mouseup',   onEnd);
    handle.addEventListener('touchstart',  e => { onStart(e.touches[0].clientY); }, { passive: false });
    document.addEventListener('touchmove',
        e => { if (dragging) { onMove(e.touches[0].clientY); e.preventDefault(); } },
        { passive: false }
    );
    document.addEventListener('touchend', onEnd);
}

function closePlannerDrawer() {
    plannerOpen = false;
    const drawer = document.getElementById('plannerDrawer');
    if (drawer) {
        drawer.classList.remove('translate-y-0');
        drawer.classList.add('translate-y-full');
    }
    document.body.classList.remove('planner-mode');
    _clearSuggestionPulse();
    clearRoutePreview();
    _clearRouteLayerOnly();
    _applyRouteDimming(false);
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
        _collapseRouteResults();
        return;
    }
    if (empty)   empty.classList.add('hidden');
    if (actions) actions.classList.remove('hidden');

    const effectiveStart = _effectiveStart();
    const hasLocation    = !!effectiveStart;
    const startLabel     = effectiveStart?.name || 'Mein Standort';
    const endLabel       = _effectiveEnd()?.name || startLabel;

    // Embedded inline picker (same for start or end)
    function epPickerHtml(type, hasOverride) {
        return `<div id="ep-picker-${type}" class="hidden pl-3 pr-1 pb-2 pt-1 space-y-1.5">
            <div class="flex items-center justify-between">
                <span class="text-[11px] font-semibold text-slate-600 dark:text-zinc-300">${type === 'start' ? 'Startpunkt' : 'Ziel'} \xe4ndern</span>
                <div class="flex items-center gap-1">
                    ${hasOverride ? `<button onclick="clearTourEndpoint('${type}')" class="text-[10px] text-red-400 hover:text-red-500 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800 transition-colors">Zur\xfccksetzen</button>` : ''}
                    <button onclick="closeEndpointPicker('${type}')" class="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
                        <i class="mdi mdi-close text-xs"></i>
                    </button>
                </div>
            </div>
            <input id="plannerEpInput-${type}" type="text" placeholder="PLZ, Ort oder Standort-Nr." maxlength="80"
                class="w-full text-xs rounded border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 placeholder-slate-300 dark:placeholder-zinc-600 px-2 py-1.5 focus:outline-none focus:border-blue-400 transition-colors"
                oninput="_endpointSearch(this.value,'${type}')" />
            <div id="plannerEpResults-${type}" class="max-h-28 overflow-y-auto space-y-0.5"></div>
        </div>`;
    }

    const stops = plannerQueue.map((s, i) => `
        <div class="planner-stop-row ${s.visited ? 'opacity-60' : ''}" id="prow-${_esc(String(s.nummer))}">
            <div class="flex items-center gap-2 py-2">
                <span class="w-6 h-6 rounded-full ${s.visited ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400' : 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300'} text-xs font-bold flex items-center justify-center shrink-0">
                    ${s.visited ? '<i class="mdi mdi-check text-xs"></i>' : (i + 1)}
                </span>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <span class="text-sm font-semibold text-slate-800 dark:text-zinc-200 shrink-0">${_esc(String(s.nummer))}</span>
                        <span class="text-sm text-slate-500 dark:text-zinc-400 truncate min-w-0">${_esc(s.name)}</span>
                    </div>
                    <button onclick="toggleStopComment('${_esc(String(s.nummer))}')"
                        data-comment-preview
                        class="text-left text-xs leading-tight mt-0.5 max-w-full truncate block transition-colors
                               ${s.comment ? 'text-amber-500 dark:text-amber-400 font-medium' : 'text-slate-400 dark:text-zinc-500 hover:text-amber-500 dark:hover:text-amber-400'}"
                        title="Notiz f\xfcr diesen Stopp">
                        ${s.comment ? _esc(s.comment) : '+ Notiz hinzuf\xfcgen\u2026'}
                    </button>
                </div>
                <div class="flex items-center gap-0.5 shrink-0">
                    <button onclick="movePlannerStop(${i}, -1)" ${i === 0 ? 'disabled' : ''} class="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors" title="Nach oben">
                        <i class="mdi mdi-chevron-up text-lg"></i>
                    </button>
                    <button onclick="movePlannerStop(${i}, 1)" ${i === plannerQueue.length - 1 ? 'disabled' : ''} class="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors" title="Nach unten">
                        <i class="mdi mdi-chevron-down text-lg"></i>
                    </button>
                    <button onclick="removeFromPlannerQueue('${_esc(String(s.nummer))}')" class="w-8 h-8 flex items-center justify-center rounded text-slate-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="Entfernen">
                        <i class="mdi mdi-close text-base"></i>
                    </button>
                </div>
            </div>
            <div id="comment-box-${_esc(String(s.nummer))}" class="${s.comment ? '' : 'hidden'} pl-8 pr-1 pb-2">
                <textarea rows="2" placeholder="Erinnerung f\xfcr diesen Stopp\u2026"
                    class="planner-comment-input w-full text-xs rounded border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 px-2 py-1 resize-none focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 transition-colors"
                    oninput="handleCommentInput(this, '${_esc(String(s.nummer))}')"
                    onblur="updateStopComment('${_esc(String(s.nummer))}', this.value)"
                >${_esc(s.comment)}</textarea>
            </div>
        </div>`).join('');

    list.innerHTML = `
        <div class="planner-stop-row" id="prow-start">
            <div class="flex items-center gap-2 py-1.5 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-zinc-900 -mx-1 px-1 rounded transition-colors" onclick="openEndpointPicker('start')">
                <i class="mdi mdi-map-marker ${hasLocation ? 'text-blue-500' : 'text-amber-400'} text-base shrink-0 ml-1"></i>
                <div class="flex-1 min-w-0">
                    <p class="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500 leading-none">Start</p>
                    <p class="text-xs font-medium ${hasLocation ? 'text-slate-600 dark:text-zinc-300' : 'text-amber-500'} truncate">${_esc(startLabel)}</p>
                </div>
                <i class="mdi mdi-pencil-outline text-xs text-slate-300 dark:text-zinc-600 mr-1 shrink-0"></i>
            </div>
            ${epPickerHtml('start', !!tourStartOverride)}
        </div>
        ${stops}
        <div class="planner-stop-row border-b-0" id="prow-end">
            <div class="flex items-center gap-2 py-1.5 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-zinc-900 -mx-1 px-1 rounded transition-colors" onclick="openEndpointPicker('end')">
                <i class="mdi mdi-flag-checkered text-blue-500 text-base shrink-0 ml-1"></i>
                <div class="flex-1 min-w-0">
                    <p class="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500 leading-none">Ziel</p>
                    <p class="text-xs font-medium text-slate-600 dark:text-zinc-300 truncate">${_esc(endLabel)}</p>
                </div>
                <i class="mdi mdi-pencil-outline text-xs text-slate-300 dark:text-zinc-600 mr-1 shrink-0"></i>
            </div>
            ${epPickerHtml('end', !!tourEndOverride)}
        </div>`;
}

function toggleStopComment(nummer) {
    const box = document.getElementById(`comment-box-${nummer}`);
    if (!box) return;
    const isHidden = box.classList.toggle('hidden');
    if (!isHidden) {
        const ta = box.querySelector('textarea');
        if (ta) setTimeout(() => ta.focus(), 50);
    }
}

function handleCommentInput(textarea, nummer) {
    updateStopComment(nummer, textarea.value);
    // Update the inline comment preview text + colour
    const row = document.getElementById(`prow-${nummer}`);
    if (!row) return;
    const preview = row.querySelector('[data-comment-preview]');
    if (!preview) return;
    const val = textarea.value;
    preview.textContent = val ? val : '+ Notiz hinzuf\u00fcgen\u2026';
    const onCls  = ['text-amber-500', 'dark:text-amber-400', 'font-medium'];
    const offCls = ['text-slate-400', 'dark:text-zinc-500'];
    if (val) {
        onCls.forEach(c => preview.classList.add(c));
        offCls.forEach(c => preview.classList.remove(c));
    } else {
        offCls.forEach(c => preview.classList.add(c));
        onCls.forEach(c => preview.classList.remove(c));
    }
}

// ─── ROUTE RESULTS UI ────────────────────────────────────────────────────────

function _collapseRouteResults() {
    const results   = document.getElementById('plannerRouteResults');
    const stopsList = document.getElementById('plannerStopsList');
    const empty     = document.getElementById('plannerEmpty');
    if (results)   results.classList.add('hidden');
    if (stopsList) stopsList.classList.remove('hidden');
    if (empty)     empty.classList.toggle('hidden', plannerQueue.length > 0);
    _clearSuggestionPulse();
    _applyRouteDimming(false);
}

// Dim non-queued map markers when route is shown, restore when collapsed.
// Strategy:
//   • Add/remove CSS class "planner-dim-mode" on the Leaflet container → dims
//     ALL .custom-small-marker and .custom-cluster-icon via CSS (opacity 0.15).
//   • Remove tour-stop markers from the cluster layer so they always render
//     individually at full opacity, not hidden inside a cluster icon.
function _applyRouteDimming(dim) {
    if (!leafletMap) return;
    const container = leafletMap.getContainer();

    // Always restore any previously unclustered markers first
    if (_plannerUnclustered) {
        _plannerUnclustered.eachLayer(m => {
            try {
                if (m._icon) m._icon.classList.remove('planner-active-stop');
                if (typeof markerClusterGroup !== 'undefined' && markerClusterGroup) {
                    markerClusterGroup.addLayer(m);
                }
            } catch (_) {}
        });
        leafletMap.removeLayer(_plannerUnclustered);
        _plannerUnclustered = null;
    }

    if (dim) {
        // Dim everything via CSS class
        container.classList.add('planner-dim-mode');
        // Pull tour markers out of the cluster so they stay individually visible
        _plannerUnclustered = L.layerGroup().addTo(leafletMap);
        plannerQueue.forEach(stop => {
            const m = window._markersByNummer?.get(String(stop.nummer));
            if (!m) return;
            try {
                if (typeof markerClusterGroup !== 'undefined' && markerClusterGroup) {
                    markerClusterGroup.removeLayer(m);
                }
                _plannerUnclustered.addLayer(m);
                m.setOpacity(1);
                // Mark this icon so CSS dim rule skips it
                if (m._icon) m._icon.classList.add('planner-active-stop');
            } catch (_) {}
        });
        // Ensure cluster redraws after removal
        if (typeof markerClusterGroup !== 'undefined' && markerClusterGroup) {
            try { markerClusterGroup.refreshClusters(); } catch (_) {}
        }
    } else {
        container.classList.remove('planner-dim-mode');
        // Also restore any suggestion highlights that were pulled from cluster
        _clearSuggestionPulse();
    }
}

function _fmtTime(mins) {
    return mins < 60 ? `${mins} Min` : `${Math.floor(mins / 60)}h ${mins % 60 < 10 ? '0' : ''}${mins % 60}m`;
}

function _navBtn(stops, label) {
    const nav = typeof navMode !== 'undefined' ? navMode : 'google';
    const url = nav === 'apple' ? _buildAppleMapsUrl(stops) : _buildGoogleMapsUrl(stops);
    const icon = nav === 'apple' ? 'mdi-apple' : 'mdi-google-maps';
    return `<button onclick="window.open('${url}','_blank')" class="w-full mt-2 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
        <i class="mdi ${icon} text-sm"></i>${_esc(label)}
    </button>`;
}

function _renderRouteResults(standardData, optimisedData, orderedStops) {
    const section   = document.getElementById('plannerRouteResults');
    const stopsList = document.getElementById('plannerStopsList');
    const empty     = document.getElementById('plannerEmpty');
    if (!section) return;

    const hasLocation = !!_effectiveStart();
    const startName   = _effectiveStart()?.name || 'Mein Standort';
    const endName     = _effectiveEnd()?.name || startName;

    function stopRow(s, idx) {
        return `<div class="flex items-center gap-1.5 py-1 border-b border-slate-100 dark:border-zinc-800 last:border-0">
            <span class="w-4 h-4 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-[10px] font-bold flex items-center justify-center shrink-0 leading-none">${idx + 1}</span>
            <span class="text-xs min-w-0 truncate"><span class="font-semibold text-slate-700 dark:text-zinc-300">${_esc(String(s.nummer))}</span> <span class="text-slate-400 dark:text-zinc-500">${_esc(s.name)}</span></span>
        </div>`;
    }
    function stopRowOpt(s, idx) {
        return `<div class="flex items-center gap-1.5 py-1 border-b border-green-50 dark:border-green-900/20 last:border-0">
            <span class="w-4 h-4 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-[10px] font-bold flex items-center justify-center shrink-0 leading-none">${idx + 1}</span>
            <span class="text-xs min-w-0 truncate"><span class="font-semibold text-slate-700 dark:text-zinc-300">${_esc(String(s.nummer))}</span> <span class="text-slate-400 dark:text-zinc-500">${_esc(s.name)}</span></span>
        </div>`;
    }
    function homeRow(label, green) {
        const iconCol = green ? 'text-green-500' : 'text-blue-500';
        const txtCol  = green ? 'text-green-700 dark:text-green-300' : 'text-slate-600 dark:text-zinc-300';
        const bdrCol  = green ? 'border-green-50 dark:border-green-900/20' : 'border-slate-100 dark:border-zinc-800';
        return `<div class="flex items-center gap-1.5 py-1 border-b ${bdrCol}">
            <i class="mdi mdi-map-marker ${iconCol} text-sm shrink-0"></i>
            <span class="text-xs font-semibold ${txtCol} truncate">${_esc(label)}</span>
        </div>`;
    }

    const stdMins  = Math.round(standardData.duration / 60);
    const stdKm    = (standardData.distance / 1000).toFixed(1);
    const optMins  = Math.round(optimisedData.duration / 60);
    const optKm    = (optimisedData.distance / 1000).toFixed(1);
    const diffMins = stdMins - optMins;
    const diffKm   = (parseFloat(stdKm) - parseFloat(optKm)).toFixed(1);
    const sameOrder = diffMins === 0 && parseFloat(diffKm) === 0;

    let savings = '';
    if (!sameOrder) {
        const parts = [];
        if (diffMins > 0)           parts.push(`\u2193 ${diffMins} min`);
        if (parseFloat(diffKm) > 0) parts.push(`${diffKm} km`);
        savings = `<span class="text-[10px] font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">${parts.join(' \xb7 ')} k\xfcrzer</span>`;
    }

    const nav     = typeof navMode !== 'undefined' ? navMode : 'google';
    const navIcon = nav === 'apple' ? 'mdi-apple' : 'mdi-google-maps';
    const stdUrl  = nav === 'apple' ? _buildAppleMapsUrl(plannerQueue)  : _buildGoogleMapsUrl(plannerQueue);
    const optUrl  = nav === 'apple' ? _buildAppleMapsUrl(orderedStops)  : _buildGoogleMapsUrl(orderedStops);

    // Column base classes — active state applied by selectPlannerRoute() after render
    const colBase = 'flex flex-col gap-1.5 cursor-pointer rounded-lg border-2 border-transparent p-1.5 transition-all duration-200 hover:border-slate-200 dark:hover:border-zinc-700';

    section.innerHTML = `
        <button onclick="_collapseRouteResults()" class="flex items-center gap-1 text-xs text-slate-400 dark:text-zinc-500 hover:text-blue-500 dark:hover:text-blue-400 mb-2 transition-colors">
            <i class="mdi mdi-pencil-outline text-sm"></i>Stopps bearbeiten
        </button>
        <div class="grid grid-cols-2 gap-1">

            <!-- Standard route column -->
            <div id="route-col-std" class="${colBase}"
                 onclick="selectPlannerRoute('std')"
                 onmouseenter="previewPlannerRoute('std')"
                 onmouseleave="clearRoutePreview()">
                <div class="rounded border border-slate-200 dark:border-zinc-700 px-2 py-1.5 flex items-center gap-1.5">
                    <div class="flex-1 min-w-0">
                        <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-0.5">Ihre Reihenfolge</p>
                        <p class="text-sm font-bold text-slate-700 dark:text-zinc-200">${stdKm} km \xb7 ${_fmtTime(stdMins)}</p>
                    </div>
                    <i class="mdi route-radio mdi-radiobox-blank text-slate-300 dark:text-zinc-600 text-lg shrink-0"></i>
                </div>
                <div class="planner-route-stops">
                    ${hasLocation ? homeRow(startName, false) : ''}
                    ${plannerQueue.map((s, i) => stopRow(s, i)).join('')}
                    ${hasLocation ? homeRow(endName, false) : ''}
                </div>
                <button onclick="event.stopPropagation(); window.open('${stdUrl}','_blank')"
                    class="flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium border border-slate-300 dark:border-zinc-600 text-slate-600 dark:text-zinc-300 rounded hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors">
                    <i class="mdi ${navIcon} text-sm"></i>Navigieren
                </button>
            </div>

            <!-- Optimised route column -->
            <div id="route-col-opt" class="${colBase}"
                 onclick="selectPlannerRoute('opt')"
                 onmouseenter="previewPlannerRoute('opt')"
                 onmouseleave="clearRoutePreview()">
                <div class="rounded border ${sameOrder ? 'border-slate-200 dark:border-zinc-700' : 'border-green-400 dark:border-green-600'} px-2 py-1.5 flex items-center gap-1.5">
                    <div class="flex-1 min-w-0 overflow-hidden">
                        <div class="flex items-center justify-between gap-1 flex-wrap">
                            <p class="text-[10px] font-semibold uppercase tracking-wide ${sameOrder ? 'text-slate-400 dark:text-zinc-500' : 'text-green-600 dark:text-green-400'}">Optimiert</p>
                            ${savings}
                        </div>
                        <p class="text-sm font-bold ${sameOrder ? 'text-slate-700 dark:text-zinc-200' : 'text-green-700 dark:text-green-300'}">${optKm} km \xb7 ${_fmtTime(optMins)}</p>
                    </div>
                    <i class="mdi route-radio mdi-radiobox-blank text-slate-300 dark:text-zinc-600 text-lg shrink-0"></i>
                </div>
                <div class="planner-route-stops">
                    ${hasLocation ? homeRow(startName, true) : ''}
                    ${orderedStops.map((s, i) => stopRowOpt(s, i)).join('')}
                    ${hasLocation ? homeRow(endName, true) : ''}
                </div>
                <button onclick="event.stopPropagation(); window.open('${optUrl}','_blank')"
                    class="flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
                    <i class="mdi ${navIcon} text-sm"></i>Navigieren
                </button>
            </div>

        </div>
        ${sameOrder ? '<p class="text-xs text-center text-slate-400 dark:text-zinc-500 pt-2 pb-1">Reihenfolge bereits optimal.</p>' : ''}`;

    // Hide editable list, show route view
    if (stopsList) stopsList.classList.add('hidden');
    if (empty)     empty.classList.add('hidden');
    section.classList.remove('hidden');
    _applyRouteDimming(true);
    // Apply active-column styling (no route re-draw — done by caller after render)
    _updateRouteColUI();
    // Suggestions are rendered asynchronously (see runPlannerRoute) so the
    // drawer autosize happens first without suggestions inflating scrollHeight.
    if (showRouteSuggestions) {
        section.insertAdjacentHTML('beforeend', `
            <div id="plannerSuggestionsLoader" class="mt-3 pt-2 border-t border-slate-100 dark:border-zinc-800 animate-pulse space-y-1.5">
                <div class="flex items-center gap-1.5 mb-2">
                    <div class="w-3 h-3 rounded-full bg-slate-200 dark:bg-zinc-700"></div>
                    <div class="h-2.5 w-28 rounded bg-slate-200 dark:bg-zinc-700"></div>
                </div>
                <div class="h-5 rounded bg-slate-100 dark:bg-zinc-800/80 w-full"></div>
                <div class="h-5 rounded bg-slate-100 dark:bg-zinc-800/80 w-[90%]"></div>
                <div class="h-5 rounded bg-slate-100 dark:bg-zinc-800/80 w-[75%]"></div>
            </div>`);
    }
}

// ─── NAVIGATION URL BUILDERS ─────────────────────────────────────────────────

// Returns the effective start point (override → GPS/saved location → null)
function _effectiveStart() {
    if (tourStartOverride) return tourStartOverride;
    if (userLat && userLon) return { lat: userLat, lon: userLon, name: _homeName() };
    return null;
}

// Returns the effective end point (override → same as start → null)
function _effectiveEnd() {
    return tourEndOverride ?? _effectiveStart();
}

function _homeName() {
    try { return JSON.parse(localStorage.getItem('userCoords') || '{}').name || 'Mein Standort'; } catch { return 'Mein Standort'; }
}

function _buildGoogleMapsUrl(stops) {
    const start = _effectiveStart();
    const end   = _effectiveEnd();
    if (start) {
        const dest = end || start;
        const wps  = stops.map(s => `${s.lat},${s.lon}`).join('|');
        let url = `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lon}&destination=${dest.lat},${dest.lon}`;
        if (wps) url += `&waypoints=${encodeURIComponent(wps)}`;
        return url;
    } else {
        const origin = stops[0];
        const dest   = stops[stops.length - 1];
        const wps    = stops.slice(1, -1).map(s => `${s.lat},${s.lon}`).join('|');
        let url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lon}&destination=${dest.lat},${dest.lon}`;
        if (wps) url += `&waypoints=${encodeURIComponent(wps)}`;
        return url;
    }
}

function _buildAppleMapsUrl(stops) {
    const start = _effectiveStart();
    const end   = _effectiveEnd();
    const parts = stops.map(s => `${s.lat},${s.lon}`);
    if (start) {
        const endCoord = end ? `${end.lat},${end.lon}` : `${start.lat},${start.lon}`;
        return `https://maps.apple.com/?saddr=${start.lat},${start.lon}&daddr=${[...parts, endCoord].join('+to:')}`;
    } else {
        const origin = parts.shift();
        return `https://maps.apple.com/?saddr=${origin}&daddr=${parts.join('+to:')}`;
    }
}

function openPlannerNavigation() {
    if (plannerQueue.length === 0) return;
    const nav = typeof navMode !== 'undefined' ? navMode : 'google';
    window.open(nav === 'apple' ? _buildAppleMapsUrl(plannerQueue) : _buildGoogleMapsUrl(plannerQueue), '_blank');
}

// ─── DRAWER AUTO-SIZE ───────────────────────────────────────────────────────

// Resize plannerInner to fit content after route results are rendered.
// Measures header + content scrollHeight + actions, caps at 55 % viewport height.
function _autosizePlannerDrawer() {
    const inner   = document.getElementById('plannerInner');
    const content = document.getElementById('plannerContent');
    if (!inner || !content) return;

    const maxH = Math.floor(window.innerHeight * 0.55);

    // Measure the fixed chrome (header + actions bar)
    let chrome = 0;
    inner.querySelectorAll(':scope > :not(#plannerContent)').forEach(el => {
        chrome += el.offsetHeight;
    });

    // Natural height = full scroll content + chrome + small breathing room
    const target = Math.min(content.scrollHeight + chrome + 8, maxH);

    inner.style.transition = 'height 0.25s ease';
    inner.style.height = target + 'px';
    // Remove transition override after animation so drag-resize still feels instant
    setTimeout(() => { inner.style.transition = ''; }, 280);
}

// ─── ROUTE SELECTION & PREVIEW ───────────────────────────────────────────────

// Select a route type ('std' or 'opt'), redraw on map, highlight column.
// Pass fitBounds=true on first render to zoom to the route.
function selectPlannerRoute(type, fitBounds) {
    _activeRouteType = type;
    clearRoutePreview();
    _clearRouteLayerOnly();

    const geom  = type === 'opt' ? _lastOptRouteGeom : _stdRouteGeom;
    const color = type === 'opt' ? '#16a34a' : '#3b82f6';

    if (geom && leafletMap) {
        plannerRouteLayer = L.geoJSON(
            { type: 'LineString', coordinates: geom },
            { style: { color, weight: 4, opacity: 0.82 } }
        ).addTo(leafletMap);
        if (fitBounds) leafletMap.fitBounds(plannerRouteLayer.getBounds(), { padding: [40, 40] });
    }
    _updateRouteColUI();
}

// Update column border + radio icon to reflect _activeRouteType (no route redraw)
function _updateRouteColUI() {
    ['std', 'opt'].forEach(t => {
        const col = document.getElementById(`route-col-${t}`);
        if (!col) return;
        const isActive = t === _activeRouteType;
        col.classList.remove(
            'border-blue-400', 'border-green-400', 'border-transparent',
            'bg-blue-50/50', 'bg-green-50/50',
            'dark:bg-blue-900/10', 'dark:bg-green-900/10'
        );
        if (isActive && t === 'std') {
            col.classList.add('border-blue-400', 'bg-blue-50/50', 'dark:bg-blue-900/10');
        } else if (isActive && t === 'opt') {
            col.classList.add('border-green-400', 'bg-green-50/50', 'dark:bg-green-900/10');
        } else {
            col.classList.add('border-transparent');
        }
        const radio = col.querySelector('.route-radio');
        if (radio) {
            radio.className = isActive
                ? `mdi route-radio text-lg shrink-0 mdi-radiobox-marked ${t === 'std' ? 'text-blue-500' : 'text-green-500'}`
                : 'mdi route-radio text-lg shrink-0 mdi-radiobox-blank text-slate-300 dark:text-zinc-600';
        }
    });
}

// Draw a high-contrast two-layer preview of the hovered route (only for the non-active one).
// Outline stroke + vivid color stroke ensures visibility even where routes overlap.
function previewPlannerRoute(type) {
    clearRoutePreview();
    if (type === _activeRouteType) return;
    const geom = type === 'opt' ? _lastOptRouteGeom : _stdRouteGeom;
    if (!geom || !leafletMap) return;

    const color   = type === 'opt' ? '#16a34a' : '#3b82f6';   // green or blue
    const outline = type === 'opt' ? '#052e16' : '#1e3a5f';   // dark contrast outline
    const geoObj  = { type: 'LineString', coordinates: geom };

    // Layer 1: dark outline for contrast at intersections
    const outlineLayer = L.geoJSON(geoObj, {
        style: { color: outline, weight: 9, opacity: 0.45, lineCap: 'round', lineJoin: 'round' }
    });
    // Layer 2: vivid colored line on top
    const colorLayer = L.geoJSON(geoObj, {
        style: { color, weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }
    });

    _previewRouteLayer = L.layerGroup([outlineLayer, colorLayer]).addTo(leafletMap);
}

function clearRoutePreview() {
    if (_previewRouteLayer && leafletMap) {
        leafletMap.removeLayer(_previewRouteLayer);
        _previewRouteLayer = null;
    }
}

// ─── ROUTING ─────────────────────────────────────────────────────────────────

async function runPlannerRoute() {
    if (plannerQueue.length < 1) { alert('Bitte mindestens einen Stopp zur Tour hinzufügen.'); return; }

    const resultEl = document.getElementById('plannerResult');
    if (resultEl) resultEl.innerHTML = `<span class="flex items-center gap-1 text-slate-400 dark:text-zinc-500"><i class="mdi mdi-loading mdi-spin text-sm"></i>Berechne…</span>`;

    _clearRouteLayerOnly();

    const startPt     = _effectiveStart();
    const endPt       = _effectiveEnd();
    const hasLocation = !!startPt;
    const home = hasLocation ? [startPt] : [];
    const homeEnd = (hasLocation && endPt) ? [endPt] : (hasLocation ? [startPt] : []);
    const stdPoints = [...home, ...plannerQueue, ...homeEnd];
    const optPoints = hasLocation
        ? [startPt, ...plannerQueue, (endPt || startPt)]
        : plannerQueue;

    if (stdPoints.length < 2 || optPoints.length < 2) {
        if (resultEl) resultEl.innerHTML = `<span class="text-amber-500 flex items-center gap-1"><i class="mdi mdi-alert-circle-outline text-xs"></i>Kein Startpunkt</span>`;
        return;
    }

    const stdCoords = stdPoints.map(p => `${p.lon},${p.lat}`).join(';');
    const optCoords = optPoints.map(p => `${p.lon},${p.lat}`).join(';');
    const stdUrl = `https://router.project-osrm.org/route/v1/driving/${stdCoords}?overview=full&geometries=geojson`;
    const optUrl = `https://router.project-osrm.org/trip/v1/driving/${optCoords}?roundtrip=false&source=first&destination=last&overview=full&geometries=geojson`;

    try {
        const [stdRes, optRes] = await Promise.all([fetch(stdUrl), fetch(optUrl)]);
        if (!stdRes.ok) throw new Error(`OSRM Fehler ${stdRes.status}`);
        if (!optRes.ok) throw new Error(`OSRM Fehler ${optRes.status}`);
        const [stdData, optData] = await Promise.all([stdRes.json(), optRes.json()]);

        if (!stdData.routes?.length) throw new Error('Keine Standardroute gefunden');
        if (!optData.trips?.length)  throw new Error('Keine optimierte Route gefunden');

        const stdTrip = stdData.routes[0];
        const optTrip = optData.trips[0];

        // Reconstruct optimised stop order
        let orderedStops = plannerQueue;
        if (optData.waypoints?.length) {
            if (hasLocation) {
                const stopWps = optData.waypoints
                    .map((wp, i) => ({ wp, i }))
                    .filter(({ i }) => i > 0 && i < optPoints.length - 1);
                stopWps.sort((a, b) => a.wp.waypoint_index - b.wp.waypoint_index);
                const mapped = stopWps.map(({ i }) => plannerQueue[i - 1]).filter(Boolean);
                if (mapped.length === plannerQueue.length) orderedStops = mapped;
            } else {
                const sorted = [...optData.waypoints.entries()]
                    .map(([i, wp]) => ({ wp, i }))
                    .sort((a, b) => a.wp.waypoint_index - b.wp.waypoint_index);
                const mapped = sorted.map(({ i }) => plannerQueue[i]).filter(Boolean);
                if (mapped.length === plannerQueue.length) orderedStops = mapped;
            }
        }

        // Header pill: show optimised summary
        const optMins = Math.round(optTrip.duration / 60);
        const optKm   = (optTrip.distance / 1000).toFixed(1);
        if (resultEl) {
            resultEl.innerHTML = `
                <span class="flex items-center gap-1"><i class="mdi mdi-map-marker-distance text-sm text-blue-500"></i>${optKm} km</span>
                <span class="text-slate-300 dark:text-zinc-600">·</span>
                <span class="flex items-center gap-1"><i class="mdi mdi-clock-outline text-sm text-blue-500"></i>${_fmtTime(optMins)}</span>`;
        }

        _renderRouteResults(stdTrip, optTrip, orderedStops);
        _autosizePlannerDrawer(); // sizes to route columns before suggestions load

        // Render suggestions after a short delay so they don't trigger a resize
        setTimeout(() => {
            const section = document.getElementById('plannerRouteResults');
            if (section) _renderSuggestions(section);
        }, 350);

        // Store geometries and draw active route
        _lastOptRouteGeom = optTrip.geometry?.coordinates || null;
        _stdRouteGeom     = stdTrip.geometry?.coordinates || null;
        _orderedStops     = orderedStops;
        _activeRouteType  = 'opt';
        selectPlannerRoute('opt', true); // draw + fitBounds

    } catch (e) {
        if (resultEl) resultEl.innerHTML = `<span class="text-red-500 flex items-center gap-1"><i class="mdi mdi-alert-circle text-xs"></i>${_esc(e.message)}</span>`;
    }
}

// ─── GEOFENCING ──────────────────────────────────────────────────────────────

function startTourGeofence() {
    if (!navigator.geolocation) return;
    if (_geoWatchId !== null) return;
    _geoWatchId = navigator.geolocation.watchPosition(
        pos => _checkArrival(pos.coords.latitude, pos.coords.longitude),
        null,
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
}

function stopTourGeofence() {
    if (_geoWatchId !== null) {
        navigator.geolocation.clearWatch(_geoWatchId);
        _geoWatchId = null;
    }
}

function _checkArrival(lat, lon) {
    plannerQueue.forEach(stop => {
        if (stop.visited || !stop.comment) return;
        if (calcDistance(lat, lon, stop.lat, stop.lon) <= 0.3) _notifyArrival(stop);
    });
}

async function _notifyArrival(stop) {
    stop.visited = true;
    _saveActiveTour();
    renderPlannerList();
    try {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(`Angekommen: ${stop.nummer} ${stop.name}`, {
            body: stop.comment,
            icon: '/res/icons/app-icon.svg',
            badge: '/res/icons/app-icon.svg',
            tag: `arrival-${stop.nummer}`,
            renotify: false,
        });
    } catch {
        if (Notification.permission === 'granted') {
            new Notification(`Angekommen: ${stop.nummer} ${stop.name}`, { body: stop.comment, icon: '/res/icons/app-icon.svg' });
        }
    }
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

function showPlannerToast(msg) {
    let t = document.getElementById('plannerToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'plannerToast';
        t.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-md bg-zinc-900 text-white text-sm font-medium shadow-lg transition-opacity duration-300 pointer-events-none';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

// ─── ENDPOINT PICKER ──────────────────────────────────────────────────────────

// _updateEndpointLabels is no longer needed (labels are now embedded in renderPlannerList)
// Kept as a no-op stub in case it's referenced elsewhere
function _updateEndpointLabels() {}

let _epPickerType = null; // 'start' | 'end'

function openEndpointPicker(type) {
    _epPickerType = type;
    const other = type === 'start' ? 'end' : 'start';
    // Close the other one first
    const otherPicker = document.getElementById(`ep-picker-${other}`);
    if (otherPicker) otherPicker.classList.add('hidden');
    // Toggle this one
    const picker = document.getElementById(`ep-picker-${type}`);
    if (!picker) return;
    const opening = picker.classList.contains('hidden');
    picker.classList.toggle('hidden', !opening);
    if (opening) {
        const input = document.getElementById(`plannerEpInput-${type}`);
        if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
        const res = document.getElementById(`plannerEpResults-${type}`);
        if (res) res.innerHTML = '';
    }
}

function closeEndpointPicker(type) {
    const t = type || _epPickerType;
    if (!t) return;
    const picker = document.getElementById(`ep-picker-${t}`);
    if (picker) picker.classList.add('hidden');
    _epPickerType = null;
}

let _epSearchTimer = null;

async function _endpointSearch(query, type) {
    const t = type || _epPickerType;
    if (!t) return;
    clearTimeout(_epSearchTimer);
    const q = (query || '').trim();
    const res = document.getElementById(`plannerEpResults-${t}`);
    if (!res) return;
    if (!q) { res.innerHTML = ''; return; }

    // Instant: station number (1-4 digits)
    if (/^\d{1,4}$/.test(q)) {
        const matches = standorte.filter(s => String(s.nummer).startsWith(q));
        if (matches.length > 0) {
            res.innerHTML = '';
            matches.slice(0, 6).forEach(s => {
                const label = `Standort ${s.nummer} \u2013 ${s.name}`;
                const btn = document.createElement('button');
                btn.className = 'planner-ep-result';
                btn.textContent = label;
                btn.onclick = () => setTourEndpoint(t, s.lat, s.lon, label);
                res.appendChild(btn);
            });
            return;
        }
    }

    // Debounced Nominatim (min 3 chars)
    if (q.length < 3) { res.innerHTML = ''; return; }
    _epSearchTimer = setTimeout(async () => {
        res.innerHTML = '<p class="text-[11px] text-slate-400 dark:text-zinc-500 py-1">Sucht\u2026</p>';
        try {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=de&limit=5&format=json&addressdetails=1&accept-language=de`;
            const data = await fetch(url, { headers: { 'Accept-Language': 'de' } }).then(r => r.json());
            if (!data || data.length === 0) { res.innerHTML = '<p class="text-[11px] text-red-500 py-1">Nichts gefunden.</p>'; return; }
            res.innerHTML = '';
            data.forEach(r => {
                const a = r.address;
                const city = a.city || a.town || a.village || a.municipality || r.display_name.split(',')[0];
                const label = [a.postcode, city, a.state].filter(Boolean).join(', ');
                const btn = document.createElement('button');
                btn.className = 'planner-ep-result';
                btn.textContent = label;
                btn.onclick = () => setTourEndpoint(t, parseFloat(r.lat), parseFloat(r.lon), label);
                res.appendChild(btn);
            });
        } catch {
            res.innerHTML = '<p class="text-[11px] text-red-500 py-1">Netzwerkfehler.</p>';
        }
    }, 400);
}

function setTourEndpoint(type, lat, lon, name) {
    const override = { lat, lon, name };
    if (type === 'start') tourStartOverride = override;
    else                  tourEndOverride   = override;
    _saveActiveTour();
    closeEndpointPicker(type);
    _clearRouteLayer();
    renderPlannerList(); // re-render so labels update immediately
}

function clearTourEndpoint(type) {
    if (type === 'start') tourStartOverride = null;
    else                  tourEndOverride   = null;
    _saveActiveTour();
    _clearRouteLayer();
    renderPlannerList(); // re-render so labels update immediately
}

// ─── ROUTE SUGGESTIONS ────────────────────────────────────────────────────────

function _findSuggestedStops() {
    if (!showRouteSuggestions) return [];
    // Use whichever route is currently active
    const activeGeom = _activeRouteType === 'opt' ? _lastOptRouteGeom : _stdRouteGeom;
    if (!activeGeom) return [];
    return (typeof standorte !== 'undefined' ? standorte : [])
        .filter(s => !isPlannerQueued(s.nummer) && s.lat && s.lon)
        .map(s => {
            // Minimum distance from this station to any segment point on the active route
            const minDist = activeGeom.reduce((min, [lon, lat]) =>
                Math.min(min, calcDistance(s.lat, s.lon, lat, lon)), Infinity);
            return { ...s, distToRoute: minDist };
        })
        .filter(s => s.distToRoute < suggestRadiusKm)
        .sort((a, b) => a.distToRoute - b.distToRoute)
        .slice(0, SUGGEST_MAX_COUNT);
}

function _renderSuggestions(section) {
    // Always remove the loader placeholder first
    document.getElementById('plannerSuggestionsLoader')?.remove();
    if (!showRouteSuggestions) return;
    const suggestions = _findSuggestedStops();
    if (!suggestions.length) return;

    const div = document.createElement('div');
    div.id = 'plannerSuggestions';
    div.className = 'mt-3 pt-2 border-t border-slate-100 dark:border-zinc-800';
    div.innerHTML = `
        <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-1.5 flex items-center gap-1">
            <i class="mdi mdi-map-marker-radius-outline text-xs text-violet-500"></i>
            Nahe der Strecke
            <span class="ml-auto font-normal normal-case text-[10px] text-slate-300 dark:text-zinc-600">&le;&thinsp;${suggestRadiusKm < 1 ? Math.round(suggestRadiusKm * 1000) + ' m' : suggestRadiusKm + ' km'}</span>
        </p>
        ${suggestions.map(s => `
        <div class="planner-suggest-row">
            <span class="w-3 h-3 rounded-full bg-violet-500 ring-2 ring-violet-300 dark:ring-violet-700 shrink-0"></span>
            <span class="flex-1 min-w-0">
                <span class="font-semibold text-slate-700 dark:text-zinc-300">${_esc(String(s.nummer))}</span>
                <span class="text-slate-400 dark:text-zinc-500"> ${_esc(s.name)}</span>
                <span class="text-slate-300 dark:text-zinc-600"> &middot; ${s.distToRoute < 1 ? Math.round(s.distToRoute * 1000) + ' m' : s.distToRoute.toFixed(1) + ' km'}</span>
            </span>
            <button onclick="addToPlannerQueue('${_esc(String(s.nummer))}')"
                class="w-6 h-6 flex items-center justify-center rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-800/40 transition-colors shrink-0" title="Zur Tour hinzuf\u00fcgen">
                <i class="mdi mdi-plus text-sm"></i>
            </button>
        </div>`).join('')}`;
    section.appendChild(div);

    // ── Map highlights ─────────────────────────────────────────────────────
    // Swap each marker's icon to a small violet diamond-pin so suggestions are
    // Swap each marker's icon to a dashed hollow SVG circle in its own color.
    // The station keeps its position and tooltip; the dashed outline is the
    // only visual change, clearly distinct from solid tour-stop circles.
    _clearSuggestionPulse(); // clean any leftovers first

    if (leafletMap) {
        _suggestionUnclustered = L.layerGroup().addTo(leafletMap);

        suggestions.forEach(s => {
            const m = window._markersByNummer?.get(String(s.nummer));
            if (!m) return;
            try {
                // Pull out of cluster so it renders individually in dim mode
                if (typeof markerClusterGroup !== 'undefined' && markerClusterGroup) {
                    markerClusterGroup.removeLayer(m);
                }
                _suggestionUnclustered.addLayer(m);
                m.setOpacity(1);
                if (m._icon) m._icon.classList.add('planner-active-stop');

                // Read the marker's fill color from its inner div inline style
                const innerDiv = m._icon?.querySelector('div[style]');
                const rawColor = innerDiv?.style.backgroundColor || '#94a3b8';

                // Save original icon so we can restore it later
                m._savedOrigIcon = m.getIcon();

                // Replace with a dashed hollow SVG circle in the marker's own color.
                // --suggest-color drives the CSS glow animation.
                m.setIcon(L.divIcon({
                    className: 'custom-small-marker planner-active-stop',
                    iconSize:   [22, 22],
                    iconAnchor: [11, 11],
                    html: `<svg viewBox="0 0 22 22" width="22" height="22"
                               class="planner-suggest-icon"
                               style="overflow:visible;display:block;--suggest-color:${rawColor}">
                        <circle cx="11" cy="11" r="8"
                            fill="none"
                            stroke="${rawColor}"
                            stroke-width="2.5"
                            stroke-dasharray="4.5 3"
                            opacity="0.9"/>
                    </svg>`
                }));
            } catch (_) {}
        });

        if (typeof markerClusterGroup !== 'undefined' && markerClusterGroup) {
            try { markerClusterGroup.refreshClusters(); } catch (_) {}
        }
    }
}

// Restore suggestion marker icons and return them to the cluster
function _clearSuggestionPulse() {
    // Remove the async loader placeholder if still present (e.g. planner closed before suggestions loaded)
    document.getElementById('plannerSuggestionsLoader')?.remove();
    if (_suggestionUnclustered) {
        _suggestionUnclustered.eachLayer(m => {
            try {
                if (m._icon) m._icon.classList.remove('planner-active-stop');
                // Restore the original icon before putting back in cluster
                if (m._savedOrigIcon) { m.setIcon(m._savedOrigIcon); delete m._savedOrigIcon; }
                m.setOpacity(1);
                if (typeof markerClusterGroup !== 'undefined' && markerClusterGroup) {
                    markerClusterGroup.addLayer(m);
                }
            } catch (_) {}
        });
        if (leafletMap) leafletMap.removeLayer(_suggestionUnclustered);
        _suggestionUnclustered = null;
    }
    if (_suggestionRingLayer) {
        if (leafletMap) leafletMap.removeLayer(_suggestionRingLayer);
        _suggestionRingLayer = null;
    }
    document.querySelectorAll('.planner-suggest-pulse').forEach(el => el.classList.remove('planner-suggest-pulse'));
}

// ─── SETTINGS: ROUTE SUGGESTIONS TOGGLE ──────────────────────────────────────

function toggleRouteSuggestions() {
    showRouteSuggestions = !showRouteSuggestions;
    localStorage.setItem('routeSuggestions', showRouteSuggestions);
    _updateSuggestToggleUI();
}

function setSuggestRadius(km) {
    suggestRadiusKm = parseFloat(km) || 3;
    localStorage.setItem('suggestRadiusKm', suggestRadiusKm);
    const lbl = document.getElementById('suggestRadiusLabel');
    if (lbl) lbl.textContent = suggestRadiusKm < 1 ? Math.round(suggestRadiusKm * 1000) + ' m' : suggestRadiusKm + ' km';
}

function _updateSuggestToggleUI() {
    const btn = document.getElementById('btn-route-suggest-toggle');
    if (!btn) return;
    // Toggle track colour and knob position
    // Button: w-11 (44px), knob: w-5 (20px), left-0.5 (2px gap each side)
    // On = translate-x-5 (20px), Off = translate-x-0
    if (showRouteSuggestions) {
        btn.classList.replace('bg-slate-200', 'bg-violet-500');
        btn.classList.replace('dark:bg-zinc-700', 'dark:bg-violet-600');
        btn.querySelector('.ep-knob')?.classList.replace('translate-x-0', 'translate-x-5');
    } else {
        btn.classList.replace('bg-violet-500', 'bg-slate-200');
        btn.classList.replace('dark:bg-violet-600', 'dark:bg-zinc-700');
        btn.querySelector('.ep-knob')?.classList.replace('translate-x-5', 'translate-x-0');
    }
    // Sync radius slider & label
    const slider = document.getElementById('suggestRadiusSlider');
    const lbl    = document.getElementById('suggestRadiusLabel');
    if (slider) slider.value = suggestRadiusKm;
    if (lbl) lbl.textContent = suggestRadiusKm < 1 ? Math.round(suggestRadiusKm * 1000) + ' m' : suggestRadiusKm + ' km';
}
