// ==========================================
// Initialization (runs after all modules loaded)
// ==========================================

window.onload = () => {
    applyThemeAndAppearance();
    loadFavorites();
    loadFilterState();

    initLeafletMap();
    if (typeof initStandortOverlays === 'function') {
        initStandortOverlays();
    }

    if (standorte.length > 0) {
        standorte.sort((a, b) => String(a.nummer).localeCompare(String(b.nummer)));
        initFilterMenu();
        loadSavedLocation();
    } else {
        document.getElementById("locationStatus").innerHTML = "Fehler: standorte.js fehlt.";
    }

    initTutorialHighlight();
};
