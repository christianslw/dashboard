// ─── Initialization (runs after all modules loaded) ──────────────────────────────────

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
    // Notify Leaflet of initial container size after list width is set
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
        // Tell Leaflet to repaint — it doesn't auto-watch container size
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
    let backendHasStandorte = false;
    if (typeof window.__cfSync !== 'undefined') {
        // Settings are user-specific (not edge-cached); fire without awaiting —
        // local settings already applied above; backend re-applies on resolve.
        window.__cfSync.loadSettingsFromBackend().then(() => {
            applyThemeAndAppearance();
        });

        // Fahrtanweisungen and standorte are edge-cached — await before rendering list.
        [, backendHasStandorte] = await Promise.all([
            window.__cfSync.loadFahrtanweisungen(),
            window.__cfSync.loadStandorteFromBackend(),
        ]);

        // Start watching local setting changes and push to backend
        window.__cfSync.startSettingsSync();
    }

    // ── 3. Restore per-user in-memory state from (possibly updated) localStorage
    loadFavorites();
    loadFilterState();

    // ── 4. Load standorte (falls back to bundled standorte.js if backend empty) ─
    if (backendHasStandorte) {
        standorte = window.standorte;
    } else {
        standorte = typeof standorteDaten !== 'undefined' ? standorteDaten : [];
    }

    // ── 5. Map + overlays ──────────────────────────────────────────────────────
    initLeafletMap();
    initSplitPane();        // run before first renderMap so fitBounds uses the correct container width
    if (typeof initStandortOverlays === 'function') {
        initStandortOverlays();
    }

    // ── 6. List rendering ──────────────────────────────────────────────────────
    if (standorte.length > 0) {
        standorte.sort((a, b) => String(a.nummer).localeCompare(String(b.nummer)));
        initFilterMenu();
        loadSavedLocation();
        // Restore active tour from previous session
        if (typeof _loadActiveTour === 'function') _loadActiveTour();
    } else {
        document.getElementById("locationStatus").innerHTML =
            "Fehler: Keine Standortdaten (standorte.js fehlt und Backend nicht erreichbar).";
    }

    initTutorialHighlight();

    // ── Deep link: open site from ?standort=NUMMER in URL ─────────────────────
    const urlParams = new URLSearchParams(location.search);
    const deepLinkNummer = urlParams.get('standort');
    if (deepLinkNummer) {
        const found = standorte.find(s => String(s.nummer) === String(deepLinkNummer));
        if (found) {
            setTimeout(() => openDashboard(deepLinkNummer), 100);
        }
    }

    // ── Deep link: load tour from ?tour=num1,num2,… ────────────────────────────
    const deepLinkTour = urlParams.get('tour');
    if (deepLinkTour) {
        const tourNums = deepLinkTour.split(',').map(n => decodeURIComponent(n.trim())).filter(n => n);
        const validNums = tourNums.filter(n => standorte.find(s => String(s.nummer) === n));
        if (validNums.length > 0) {
            validNums.forEach(n => addToPlannerQueue(n));
            setTimeout(() => {
                if (!plannerOpen) togglePlannerDrawer();
            }, 300);
        }
    }

    // ── PWA / Shortcut: focus search if ?focus=search ──────────────────────────
    if (urlParams.get('focus') === 'search') {
        setTimeout(() => document.getElementById('searchInput')?.focus(), 200);
    }

    // ── Keyboard shortcuts ─────────────────────────────────────────────────────
    document.addEventListener('keydown', handleGlobalKeydown);
};

function handleGlobalKeydown(e) {
    const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;

    // / → focus search
    if (e.key === '/' && !inInput) {
        e.preventDefault();
        document.getElementById('searchInput')?.focus();
        return;
    }

    // ? → open tutorial
    if (e.key === '?' && !inInput) {
        if (typeof openTutorial === 'function') openTutorial();
        return;
    }

    // Escape → close top-most open modal
    if (e.key === 'Escape') {
        const modals = [
            { id: 'bugReportModal',      close: () => { if (typeof BugReport !== 'undefined') BugReport.close(); } },
            { id: 'overlayInputModal',   close: () => { if (typeof cancelOverlayInput === 'function') cancelOverlayInput(); } },
            { id: 'savedToursModal',     close: () => { if (typeof closeSavedToursModal === 'function') closeSavedToursModal(); } },
            { id: 'locationModal',       close: () => { if (typeof closeLocationModal === 'function') closeLocationModal(); } },
            { id: 'wayInstructionsModal', close: () => { if (typeof closeWayInstructionsModal === 'function') closeWayInstructionsModal(); } },
            { id: 'settingsModal',       close: () => { if (typeof closeSettingsModal === 'function') closeSettingsModal(); } },
            { id: 'appSettingsModal',    close: () => { if (typeof closeAppSettingsModal === 'function') closeAppSettingsModal(); } },
            { id: 'tutorialModal',       close: () => { if (typeof closeTutorial === 'function') closeTutorial(); } },
            { id: 'dashboardModal',      close: () => { if (typeof closeDashboard === 'function') closeDashboard(); } },
            { id: 'filterMenuPanel',     close: () => { if (typeof closeFilterMenu === 'function') closeFilterMenu(); } },
            { id: 'sortMenuPanel',       close: () => { if (typeof closeSortMenu === 'function') closeSortMenu(); } },
        ];
        for (const m of modals) {
            const el = document.getElementById(m.id);
            if (el && !el.classList.contains('hidden')) {
                m.close();
                return;
            }
        }
        // Planner drawer uses translate classes, not hidden
        if (typeof plannerOpen !== 'undefined' && plannerOpen) {
            if (typeof closePlannerDrawer === 'function') closePlannerDrawer();
            return;
        }
        return;
    }

    // F → toggle favorite for open dashboard
    if ((e.key === 'f' || e.key === 'F') && !inInput) {
        const dashModal = document.getElementById('dashboardModal');
        if (dashModal && !dashModal.classList.contains('hidden') && currentStandort) {
            if (typeof toggleCurrentDashboardFavorite === 'function') toggleCurrentDashboardFavorite(e);
        }
        return;
    }

    // Arrow keys → navigate list
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !inInput) {
        e.preventDefault();
        const container = document.getElementById('resultList');
        if (!container) return;
        const items = Array.from(container.querySelectorAll('[id^="list-item-"]'));
        if (items.length === 0) return;

        let currentIdx = items.findIndex(el => el.id === `list-item-${String(selectedListItemId ?? '').replace(/[^a-zA-Z0-9]/g, '')}` );
        if (e.key === 'ArrowDown') {
            currentIdx = Math.min(currentIdx + 1, items.length - 1);
        } else {
            currentIdx = Math.max(currentIdx - 1, 0);
        }

        const targetEl  = items[currentIdx];
        const numMatch  = targetEl.id.replace('list-item-', '');
        const targetObj = standorte.find(s => String(s.nummer).replace(/[^a-zA-Z0-9]/g, '') === numMatch);
        if (targetObj) {
            if (typeof highlightListItem === 'function') highlightListItem(targetObj.nummer);
            targetEl.scrollIntoView({ block: 'nearest' });
        }
        return;
    }

    // Enter → open dashboard for highlighted list item
    if (e.key === 'Enter' && !inInput && selectedListItemId) {
        const dashModal = document.getElementById('dashboardModal');
        if (!dashModal || dashModal.classList.contains('hidden')) {
            if (typeof openDashboard === 'function') openDashboard(selectedListItemId);
        }
        return;
    }}

// ─── PWA Install ─────────────────────────────────────────────────────────────

let _pwaInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _pwaInstallPrompt = e;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
    _pwaInstallPrompt = null;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.classList.add('hidden');
});

function installPWA() {
    if (!_pwaInstallPrompt) return;
    _pwaInstallPrompt.prompt();
    _pwaInstallPrompt.userChoice.then(() => { _pwaInstallPrompt = null; });
}