// ==========================================
// Filters
// ==========================================

function loadFilterState() {
    try {
        const saved = localStorage.getItem('stationFilterState');
        if (!saved) return;

        const parsed = JSON.parse(saved);
        includedAreaCodes = new Set(Array.isArray(parsed.includedAreaCodes) ? parsed.includedAreaCodes.map(String) : []);
        excludedAreaCodes = new Set(Array.isArray(parsed.excludedAreaCodes) ? parsed.excludedAreaCodes.map(String) : []);
        favoriteFilterMode = ['all', 'only', 'exclude'].includes(parsed.favoriteFilterMode) ? parsed.favoriteFilterMode : 'all';
    } catch {
        includedAreaCodes = new Set();
        excludedAreaCodes = new Set();
        favoriteFilterMode = 'all';
    }
}

function saveFilterState() {
    const payload = {
        includedAreaCodes: Array.from(includedAreaCodes),
        excludedAreaCodes: Array.from(excludedAreaCodes),
        favoriteFilterMode
    };
    localStorage.setItem('stationFilterState', JSON.stringify(payload));
}

function getStandortAreaCode(nummer) {
    const parsed = parseInt(String(nummer), 10);
    if (Number.isNaN(parsed)) return null;
    return String(Math.floor(parsed / 1000) * 1000);
}

function getAreaFilterState(areaCode) {
    if (includedAreaCodes.has(areaCode)) return 'include';
    if (excludedAreaCodes.has(areaCode)) return 'exclude';
    return 'neutral';
}

function getAvailableAreaCodes() {
    const areaCodes = [...new Set(standorte
        .map(s => getStandortAreaCode(s.nummer))
        .filter(code => code && code !== '0' && code !== '0000'))];
    return areaCodes.sort((a, b) => Number(a) - Number(b));
}

function toggleAreaChip(areaCode) {
    const state = getAreaFilterState(areaCode);

    if (state === 'neutral') {
        includedAreaCodes.add(areaCode);
        excludedAreaCodes.delete(areaCode);
    } else if (state === 'include') {
        includedAreaCodes.delete(areaCode);
        excludedAreaCodes.add(areaCode);
    } else {
        excludedAreaCodes.delete(areaCode);
    }

    renderAreaChips();
    updateActiveFilterCount();
    saveFilterState();
    filterStandorte();
}

function renderAreaChips() {
    const container = document.getElementById('areaChipsContainer');
    if (!container) return;

    container.innerHTML = '';
    const codes = getAvailableAreaCodes();
    codes.forEach(code => {
        const state = getAreaFilterState(code);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.onclick = () => toggleAreaChip(code);

        const baseClass = 'text-xs px-2.5 py-1 rounded-full border transition-colors font-medium';
        if (state === 'include') {
            chip.className = `${baseClass} border-green-500 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300`;
            chip.textContent = `${code} +`;
        } else if (state === 'exclude') {
            chip.className = `${baseClass} border-red-500 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300`;
            chip.textContent = `${code} −`;
        } else {
            chip.className = `${baseClass} border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800`;
            chip.textContent = code;
        }

        container.appendChild(chip);
    });
}

function updateFavoriteModeButton() {
    const button = document.getElementById('favoriteModeButton');
    if (!button) return;

    if (favoriteFilterMode === 'only') {
        button.textContent = 'Favoriten: Nur einbeziehen';
    } else if (favoriteFilterMode === 'exclude') {
        button.textContent = 'Favoriten: Ausschließen';
    } else {
        button.textContent = 'Favoriten: Alle';
    }
}

function cycleFavoriteFilterMode() {
    if (favoriteFilterMode === 'all') {
        favoriteFilterMode = 'only';
    } else if (favoriteFilterMode === 'only') {
        favoriteFilterMode = 'exclude';
    } else {
        favoriteFilterMode = 'all';
    }

    updateFavoriteModeButton();
    updateActiveFilterCount();
    saveFilterState();
    filterStandorte();
}

function updateActiveFilterCount() {
    const badge = document.getElementById('activeFilterCount');
    if (!badge) return;

    const count = includedAreaCodes.size + excludedAreaCodes.size + (favoriteFilterMode === 'all' ? 0 : 1);
    badge.textContent = String(count);
    if (count > 0) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function resetAllFilters() {
    includedAreaCodes.clear();
    excludedAreaCodes.clear();
    favoriteFilterMode = 'all';

    renderAreaChips();
    updateFavoriteModeButton();
    updateActiveFilterCount();
    saveFilterState();
    filterStandorte();
}

function toggleFilterMenu() {
    const panel = document.getElementById('filterMenuPanel');
    const btn = document.getElementById('filterMenuButton');
    if (!panel || !btn) return;
    const isHidden = panel.classList.contains('hidden');
    if (isHidden) {
        // Position using fixed so overflow:hidden parents don't clip
        const rect = btn.getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.top = (rect.bottom + 4) + 'px';
        // Align right edge of panel to right edge of button
        const panelWidth = 480;
        let left = rect.right - panelWidth;
        if (left < 8) left = 8; // don't go off-screen left
        panel.style.left = left + 'px';
        panel.style.width = Math.min(panelWidth, window.innerWidth - 16) + 'px';
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

function closeFilterMenu() {
    const panel = document.getElementById('filterMenuPanel');
    if (!panel) return;
    panel.classList.add('hidden');
}

function initFilterMenu() {
    renderAreaChips();
    updateFavoriteModeButton();
    updateActiveFilterCount();
    updateSortButtonLabel();

    document.addEventListener('click', (event) => {
        const panel = document.getElementById('filterMenuPanel');
        const wrapper = document.getElementById('filterMenuWrapper');
        if (!panel || !wrapper) return;
        if (!panel.classList.contains('hidden') && !wrapper.contains(event.target)) {
            panel.classList.add('hidden');
        }
    });

    document.addEventListener('click', (event) => {
        const panel = document.getElementById('sortMenuPanel');
        const wrapper = document.getElementById('sortMenuWrapper');
        if (!panel || !wrapper) return;
        if (!panel.classList.contains('hidden') && !wrapper.contains(event.target)) {
            panel.classList.add('hidden');
        }
    });
}

function getFilteredStandorte() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.toLowerCase() : '';

    const seen = new Set();
    const filtered = standorte.filter(s => {
        const key = String(s.nummer);
        if (seen.has(key)) return false;
        seen.add(key);

        const matchesSearch = key.toLowerCase().includes(query) ||
            String(s.name).toLowerCase().includes(query);

        const areaCode = getStandortAreaCode(s.nummer);
        const matchesIncludedAreas = includedAreaCodes.size === 0 || (areaCode && includedAreaCodes.has(areaCode));
        const matchesExcludedAreas = !(areaCode && excludedAreaCodes.has(areaCode));

        const isFav = isFavorite(s.nummer);
        const matchesFavorite = favoriteFilterMode === 'all' ||
            (favoriteFilterMode === 'only' && isFav) ||
            (favoriteFilterMode === 'exclude' && !isFav);

        return matchesSearch && matchesIncludedAreas && matchesExcludedAreas && matchesFavorite;
    });

    return applySorting(filtered);
}

// ==========================================
// Sort Menu
// ==========================================

const SORT_OPTIONS = [
    { field: 'default',  dir: 'asc',  label: 'Standard' },
    { field: 'distance', dir: 'asc',  label: '↑ Distanz (nah → fern)' },
    { field: 'distance', dir: 'desc', label: '↓ Distanz (fern → nah)' },
    { field: 'numeric',  dir: 'asc',  label: '↑ Numerisch (0 → 9)' },
    { field: 'numeric',  dir: 'desc', label: '↓ Numerisch (9 → 0)' },
    { field: 'alpha',    dir: 'asc',  label: '↑ Alphabetisch (A → Z)' },
    { field: 'alpha',    dir: 'desc', label: '↓ Alphabetisch (Z → A)' },
];

function applySorting(liste) {
    if (!sortField || sortField === 'default') return liste;
    return [...liste].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'distance') {
            const da = (userLat && userLon && a.distance != null) ? a.distance : Infinity;
            const db = (userLat && userLon && b.distance != null) ? b.distance : Infinity;
            cmp = da - db;
        } else if (sortField === 'numeric') {
            cmp = parseFloat(a.nummer) - parseFloat(b.nummer);
        } else if (sortField === 'alpha') {
            cmp = String(a.name).localeCompare(String(b.name), 'de', { sensitivity: 'base' });
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });
}

function toggleSortMenu() {
    const panel = document.getElementById('sortMenuPanel');
    const btn   = document.getElementById('sortMenuButton');
    if (!panel || !btn) return;
    if (panel.classList.contains('hidden')) {
        renderSortOptions();
        const rect = btn.getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.top  = (rect.bottom + 4) + 'px';
        const panelWidth = 230;
        let left = rect.right - panelWidth;
        if (left < 8) left = 8;
        panel.style.left  = left + 'px';
        panel.style.width = panelWidth + 'px';
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

function closeSortMenu() {
    const panel = document.getElementById('sortMenuPanel');
    if (panel) panel.classList.add('hidden');
}

function renderSortOptions() {
    const container = document.getElementById('sortOptionsContainer');
    if (!container) return;
    container.innerHTML = '';
    SORT_OPTIONS.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = sortField === opt.field && sortDir === opt.dir;
        btn.className = 'w-full text-left px-3 py-1.5 text-sm rounded transition-colors ' +
            (isActive
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
                : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800');
        btn.textContent = opt.label;
        btn.onclick = () => setSortOption(opt.field, opt.dir);
        container.appendChild(btn);
    });
}

function setSortOption(field, dir) {
    sortField = field;
    sortDir   = dir;
    localStorage.setItem('sortField', field);
    localStorage.setItem('sortDir',   dir);
    updateSortButtonLabel();
    closeSortMenu();
    filterStandorte();
}

function updateSortButtonLabel() {
    const label = document.getElementById('sortMenuLabel');
    if (!label) return;
    if (!sortField || sortField === 'default') {
        label.textContent = 'Sortieren';
        return;
    }
    const opt = SORT_OPTIONS.find(o => o.field === sortField && o.dir === sortDir);
    if (opt) label.textContent = opt.label;
}
