// ─── Filters ───────────────────────────────────────────────────────────────────────

// Normalize a search string: lowercase + expand German umlauts so that
// e.g. "grünsfeld" and "gruensfeld" both match the station name "GRUENSFELD".
function normalizeSearchQuery(str) {
    return String(str).toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

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

function _positionPanel(panel, btn, panelWidth) {
    const rect = btn.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = (rect.bottom + 4) + 'px';
    const w = Math.min(panelWidth, window.innerWidth - 16);
    let left = rect.right - w;
    if (left < 8) left = 8;
    panel.style.left = left + 'px';
    panel.style.width = w + 'px';
}

function _animateClosePanel(panel, callback) {
    if (!panel || panel.classList.contains('hidden')) { callback && callback(); return; }
    // Cancel open animation before closing
    panel.style.animation = 'none';
    // Force reflow so cancel takes effect before transition
    void panel.offsetHeight;
    panel.style.transition = 'opacity 0.13s ease-in, transform 0.13s ease-in';
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(-8px) scale(0.97)';
    const done = () => {
        panel.classList.add('hidden');
        panel.style.animation = '';
        panel.style.transition = '';
        panel.style.opacity = '';
        panel.style.transform = '';
        callback && callback();
    };
    setTimeout(done, 140);
}

function toggleFilterMenu() {
    const panel = document.getElementById('filterMenuPanel');
    const btn = document.getElementById('filterMenuButton');
    if (!panel || !btn) return;
    if (panel.classList.contains('hidden')) {
        _positionPanel(panel, btn, 480);
        panel.classList.remove('hidden');
        // Restart animation (in case it was played before)
        panel.style.animation = 'none';
        void panel.offsetHeight;
        panel.style.animation = '';
    } else {
        _animateClosePanel(panel);
    }
}

function closeFilterMenu() {
    _animateClosePanel(document.getElementById('filterMenuPanel'));
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
            _animateClosePanel(panel);
        }
    });

    document.addEventListener('click', (event) => {
        const panel = document.getElementById('sortMenuPanel');
        const wrapper = document.getElementById('sortMenuWrapper');
        if (!panel || !wrapper) return;
        if (!panel.classList.contains('hidden') && !wrapper.contains(event.target)) {
            _animateClosePanel(panel);
        }
    });
}

function getFilteredStandorte() {
    const searchInput = document.getElementById('searchInput');
    const query = normalizeSearchQuery(searchInput ? searchInput.value : '');

    const seen = new Set();
    const filtered = standorte.filter(s => {
        const key = String(s.nummer);
        if (seen.has(key)) return false;
        seen.add(key);

        const matchesSearch = key.includes(query) ||
            normalizeSearchQuery(s.name).includes(query) ||
            (s.standortkuerzel && normalizeSearchQuery(s.standortkuerzel).includes(query));

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

// ─── Sort Menu ──────────────────────────────────────────────────────────────────────

const SORT_FIELDS = [
    { field: 'default',  label: 'Standard' },
    { field: 'distance', label: 'Distanz' },
    { field: 'numeric',  label: 'Numerisch' },
    { field: 'alpha',    label: 'Alphabetisch' },
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
        _positionPanel(panel, btn, 240);
        panel.classList.remove('hidden');
        // Restart animation (in case it was played before)
        panel.style.animation = 'none';
        void panel.offsetHeight;
        panel.style.animation = '';
    } else {
        _animateClosePanel(panel);
    }
}

function closeSortMenu() {
    _animateClosePanel(document.getElementById('sortMenuPanel'));
}

function renderSortOptions() {
    const container = document.getElementById('sortOptionsContainer');
    if (!container) return;
    container.innerHTML = '';

    // --- Field selection ---
    const fieldLabel = document.createElement('p');
    fieldLabel.className = 'text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-1.5';
    fieldLabel.textContent = 'Sortieren nach';
    container.appendChild(fieldLabel);

    const fieldCol = document.createElement('div');
    fieldCol.className = 'flex flex-col gap-0.5';
    SORT_FIELDS.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = sortField === opt.field;
        btn.className = 'w-full text-left px-3 py-1.5 text-sm rounded transition-colors ' +
            (isActive
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
                : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800');
        btn.textContent = opt.label;
        btn.onclick = () => {
            sortField = opt.field;
            localStorage.setItem('sortField', opt.field);
            updateSortButtonLabel();
            filterStandorte();
            // Close immediately for 'default'; re-render direction row for others
            if (opt.field === 'default') {
                closeSortMenu();
            } else {
                renderSortOptions();
            }
        };
        fieldCol.appendChild(btn);
    });
    container.appendChild(fieldCol);

    // --- Direction selection (only when a non-default field is active) ---
    if (sortField && sortField !== 'default') {
        const sep = document.createElement('div');
        sep.className = 'border-t border-slate-200 dark:border-zinc-700 mt-2 pt-2';

        const dirLabel = document.createElement('p');
        dirLabel.className = 'text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-1.5';
        dirLabel.textContent = 'Reihenfolge';
        sep.appendChild(dirLabel);

        const dirRow = document.createElement('div');
        dirRow.className = 'grid grid-cols-2 gap-1';
        [{ dir: 'asc', label: '↑ Aufsteigend' }, { dir: 'desc', label: '↓ Absteigend' }].forEach(d => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const isActive = sortDir === d.dir;
            btn.className = 'px-2.5 py-1.5 text-xs rounded border transition-colors ' +
                (isActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800');
            btn.textContent = d.label;
            btn.onclick = () => {
                sortDir = d.dir;
                localStorage.setItem('sortDir', d.dir);
                updateSortButtonLabel();
                filterStandorte();
                closeSortMenu();
            };
            dirRow.appendChild(btn);
        });
        sep.appendChild(dirRow);
        container.appendChild(sep);
    }
}

function updateSortButtonLabel() {
    const label = document.getElementById('sortMenuLabel');
    if (!label) return;
    if (!sortField || sortField === 'default') {
        label.textContent = 'Sortieren';
        return;
    }
    const field = SORT_FIELDS.find(f => f.field === sortField);
    const fieldLabel = field ? field.label : sortField;
    const dirArrow = sortDir === 'asc' ? '↑' : '↓';
    label.textContent = `${dirArrow} ${fieldLabel}`;
}
