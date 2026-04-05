// ==========================================
// Initialization (runs after all modules loaded)
// ==========================================

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
};
