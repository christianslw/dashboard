// ==========================================
// Initialization (runs after all modules loaded)
// ==========================================

// ── Split-pane resizer ────────────────────────────────────────────────────────
function initSplitPane() {
    const list     = document.getElementById('resultList');
    const divider  = document.getElementById('splitDivider');
    if (!list || !divider) return;

    const STORAGE_KEY = 'splitListWidth';
    const MIN_WIDTH   = 200;   // px
    const MAX_RATIO   = 0.65;  // 65 % of viewport

    // Restore persisted width (only meaningful on md+ screens)
    function applyWidth() {
        if (window.innerWidth < 768) {
            list.style.width = ''; // let CSS/Tailwind w-full take over
            return;
        }
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            list.style.width = Math.max(MIN_WIDTH, Math.min(parseFloat(saved), window.innerWidth * MAX_RATIO)) + 'px';
        } else {
            list.style.width = '340px'; // matches former md:w-[340px] default
        }
    }
    applyWidth();
    // Notify Leaflet of the initial container size right after the list width is set
    requestAnimationFrame(() => {
        if (typeof leafletMap !== 'undefined' && leafletMap) {
            leafletMap.invalidateSize({ animate: false });
        }
    });
    window.addEventListener('resize', applyWidth);

    let dragging = false;
    let startX   = 0;
    let startW   = 0;

    function beginDrag(clientX) {
        dragging = true;
        startX   = clientX;
        startW   = list.offsetWidth;
        document.body.classList.add('split-dragging');
    }

    function moveDrag(clientX) {
        if (!dragging) return;
        const dx       = clientX - startX;
        const newWidth = Math.max(MIN_WIDTH, Math.min(startW + dx, window.innerWidth * MAX_RATIO));
        list.style.width = newWidth + 'px';
    }

    function endDrag() {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('split-dragging');
        localStorage.setItem(STORAGE_KEY, list.offsetWidth);
        // Tell Leaflet to repaint — it doesn't watch container size on its own
        if (typeof leafletMap !== 'undefined' && leafletMap) {
            setTimeout(() => leafletMap.invalidateSize({ animate: false }), 50);
        }
    }

    // Mouse
    divider.addEventListener('mousedown', (e) => { beginDrag(e.clientX); e.preventDefault(); });
    document.addEventListener('mousemove', (e) => moveDrag(e.clientX));
    document.addEventListener('mouseup',   endDrag);

    // Touch
    divider.addEventListener('touchstart', (e) => { beginDrag(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
    document.addEventListener('touchmove',  (e) => { if (dragging) { moveDrag(e.touches[0].clientX); e.preventDefault(); } }, { passive: false });
    document.addEventListener('touchend',   endDrag);

    // Double-click → reset to default
    divider.addEventListener('dblclick', () => {
        list.style.width = '340px';
        localStorage.removeItem(STORAGE_KEY);
        if (typeof leafletMap !== 'undefined' && leafletMap) {
            setTimeout(() => leafletMap.invalidateSize({ animate: false }), 50);
        }
    });
}

window.onload = async () => {
    // 1. Apply locally cached theme immediately (no flash)
    applyThemeAndAppearance();

    // ── 2. Cloudflare backend sync ─────────────────────────────────────────────
    if (typeof window.__cfSync !== 'undefined') {
        // Pull user settings (appearance, favorites, sort, …) from the backend.
        // This must happen before loadFavorites / loadFilterState so that
        // any changes made on another device are reflected right away.
        await window.__cfSync.loadSettingsFromBackend();

        // Re-apply theme in case the backend had a different value
        applyThemeAndAppearance();

        // Start watching for local setting changes and push them to the backend
        window.__cfSync.startSettingsSync();
    }

    // ── 3. Restore per-user in-memory state from (possibly updated) localStorage
    loadFavorites();
    loadFilterState();

    // ── 4. Load standorte ──────────────────────────────────────────────────────
    // Try the CF backend first (admin-managed data).
    // If not seeded yet, fall back to the bundled standorte.js.
    let backendHasStandorte = false;
    if (typeof window.__cfSync !== 'undefined') {
        backendHasStandorte = await window.__cfSync.loadStandorteFromBackend();
    }
    if (!backendHasStandorte) {
        // Fallback: use the static JS bundle
        standorte = typeof standorteDaten !== 'undefined' ? standorteDaten : [];
    }

    // ── 5. Map + overlays ──────────────────────────────────────────────────────
    initLeafletMap();
    if (typeof initStandortOverlays === 'function') {
        initStandortOverlays();
    }

    // ── 6. List rendering ──────────────────────────────────────────────────────
    if (standorte.length > 0) {
        standorte.sort((a, b) => String(a.nummer).localeCompare(String(b.nummer)));
        initFilterMenu();
        loadSavedLocation();
    } else {
        document.getElementById("locationStatus").innerHTML =
            "Fehler: Keine Standortdaten (standorte.js fehlt und Backend nicht erreichbar).";
    }

    initTutorialHighlight();
    initSplitPane();
};
