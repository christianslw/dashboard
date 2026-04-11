// ─── Favorites ──────────────────────────────────────────────────────────────────────

function loadFavorites() {
    try {
        const saved = localStorage.getItem('favoriteStations');
        if (!saved) {
            favoriteStationNumbers = new Set();
            return;
        }
        const parsed = JSON.parse(saved);
        favoriteStationNumbers = new Set(Array.isArray(parsed) ? parsed.map(n => String(n)) : []);
    } catch {
        favoriteStationNumbers = new Set();
    }
}

function saveFavorites() {
    localStorage.setItem('favoriteStations', JSON.stringify(Array.from(favoriteStationNumbers)));
    window.__cfSync?.notifyLocalSettingsChanged?.();
}

function isFavorite(nummer) {
    return favoriteStationNumbers.has(String(nummer));
}

function toggleFavorite(nummer, event) {
    if (event) {
        event.stopPropagation();
    }

    const key = String(nummer);
    if (favoriteStationNumbers.has(key)) {
        favoriteStationNumbers.delete(key);
    } else {
        favoriteStationNumbers.add(key);
    }

    saveFavorites();
    filterStandorte();

    if (currentStandort && String(currentStandort.nummer) === key) {
        updateDashboardFavoriteButton(true);
    }
}

function toggleCurrentDashboardFavorite(event) {
    if (!currentStandort) return;
    toggleFavorite(currentStandort.nummer, event);
}

function updateDashboardFavoriteButton(animate) {
    const btn = document.getElementById('dashFavoriteBtn');
    if (!btn || !currentStandort) return;
    const fav = isFavorite(currentStandort.nummer);
    btn.className = fav
        ? 'ml-2 transition-colors text-amber-500 hover:text-amber-600'
        : 'ml-2 transition-colors text-slate-300 dark:text-zinc-600 hover:text-amber-500';
    // Swap filled / outline star icon
    const icon = btn.querySelector('i.mdi');
    if (icon) { icon.classList.toggle('mdi-star', fav); icon.classList.toggle('mdi-star-outline', !fav); }
    // Pop animation when a favorite is added
    if (animate && fav) {
        btn.classList.remove('star-pop-anim');
        void btn.offsetWidth; // force reflow to restart animation
        btn.classList.add('star-pop-anim');
        btn.addEventListener('animationend', () => btn.classList.remove('star-pop-anim'), { once: true });
    }
}
