// ─── External Service URLs ────────────────────────────────────────────────────
// Swap any of these to a self-hosted or paid alternative without hunting the
// codebase. See THIRD_PARTY_LICENSES.md for licensing notes on each service.

const OSRM_BASE_URL                 = 'https://router.project-osrm.org';
const NOMINATIM_BASE_URL            = 'https://nominatim.openstreetmap.org';
const WINDY_EMBED_URL               = 'https://embed.windy.com/embed.html';
const OPEN_METEO_BASE_URL           = 'https://api.open-meteo.com/v1/forecast';
const BRIGHTSKY_BASE_URL            = 'https://api.brightsky.dev';
const RAINVIEWER_API_URL            = 'https://api.rainviewer.com/public/weather-maps.json';
const RAINVIEWER_TILE_HOST_FALLBACK = 'https://tilecache.rainviewer.com';
const BLITZORTUNG_TILE_URL          = 'https://map.blitzortung.org/L/{z}/{x}/{y}.png';
const DWD_WMS_URL                   = 'https://maps.dwd.de/geoserver/dwd/wms';
const ESRI_IMAGERY_URL              = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_TRANSPORT_URL            = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';
const ESRI_BOUNDARIES_URL           = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const OSM_TILE_URL                  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const CARTODB_TILE_BASE_URL         = 'https://{s}.basemaps.cartocdn.com';
const OPENTOPOMAP_TILE_URL          = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';

// ─── Global State & Configuration ────────────────────────────────────────────

let standorte = typeof standorteDaten !== 'undefined' ? standorteDaten : [
    {nummer: "8100", name: "Aalen", lat: 48.860833, lon: 10.1375, link: "https://suedwestrundfunk.sharepoint.com/.../8100_2013xxxx_Tagebuch.xlsx"},
    {nummer: "8317", name: "Westheim", lat: 49.041111, lon: 9.744444, link: "https://.../8317_00000000_Tagebuch.xlsx"}
];

let userLat = null, userLon = null, currentStandort = null;
let selectedListItemId = null;
let currentRouteLayer = null;
let leafletMap = null;
let markerClusterGroup = null;
let favoriteStationNumbers = new Set();
let includedAreaCodes = new Set();
let excludedAreaCodes = new Set();
let favoriteFilterMode = 'all';
let sortField = localStorage.getItem('sortField') || 'default'; // 'default' | 'distance' | 'numeric' | 'alpha'
let sortDir = localStorage.getItem('sortDir') || 'asc';         // 'asc' | 'desc'
let radarOverlayGroup = null;
let radarFrames = [];
let radarLayerCache = {};
let radarCurrentFrameIndex = 0;
let radarIsPlaying = false;
let radarPlayTimer = null;
let radarHost = RAINVIEWER_TILE_HOST_FALLBACK;
const warningsCache = {}, routeCache = {};

// Backend sync is handled by js/sync.js  (window.__cfSync)

// ─── Theme & Appearance ──────────────────────────────────────────────────────

const customThemes = [
    { id: 'standard', label: 'Standard', file: '' },
    { id: 'dracula', label: 'Dracula', file: 'themes/dracula.css' },
    { id: 'dracula-laser', label: 'Dracula Laser', file: 'themes/dracula-laser.css' },
    { id: 'kirschbluete', label: 'Kirschblüte', file: 'themes/kirschbluete.css' },
    { id: 'swr-ms', label: 'SWR MS', file: 'themes/swr-ms.css' },
    { id: 'carbon', label: 'Carbon', file: 'themes/carbon.css' }
];

let currentAppearance = localStorage.getItem('appearance') || 'system';
let currentColorTheme = localStorage.getItem('colorTheme') || 'standard';

/* Lazy-loads js/theme-effects.js on first use (kirschbluete only) then fires callback */
function _ensureThemeEffects(callback) {
    if (typeof ThemeEffects !== 'undefined') { callback(); return; }
    const existing = document.getElementById('theme-effects-script');
    if (existing) { existing.addEventListener('load', callback, { once: true }); return; }
    const s = document.createElement('script');
    s.id  = 'theme-effects-script';
    s.src = 'js/theme-effects.js';
    s.addEventListener('load', callback, { once: true });
    document.head.appendChild(s);
}

function changeAppearance(mode) {
    currentAppearance = mode;
    localStorage.setItem('appearance', mode);
    applyThemeAndAppearance();
}

function changeColorTheme(themeId) {
    currentColorTheme = themeId;
    localStorage.setItem('colorTheme', themeId);
    applyThemeAndAppearance();
}

function applyThemeAndAppearance() {
    const oldLink = document.getElementById('custom-theme-css');
    if (oldLink) oldLink.remove();
    customThemes.forEach(t => document.documentElement.classList.remove(t.id));

    const theme = customThemes.find(t => t.id === currentColorTheme) || customThemes[0];
    if (theme && theme.id !== 'standard') {
        document.documentElement.classList.add(theme.id);
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.id = 'custom-theme-css';
        link.href = theme.file;
        document.head.appendChild(link);
    }

    let isDark = false;
    if (currentAppearance === 'dark') {
        isDark = true;
    } else if (currentAppearance === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        isDark = true;
    }

    if (isDark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    
    updateSettingsUI();
    if (typeof updateLeafletMapTheme === 'function') {
        updateLeafletMapTheme();
    }
    /* Trigger JS-driven theme particle effects — script is lazy-loaded only for kirschbluete */
    const themeId = theme ? theme.id : 'standard';
    if (themeId === 'kirschbluete') {
        _ensureThemeEffects(function () { ThemeEffects.apply('kirschbluete'); });
    } else if (typeof ThemeEffects !== 'undefined') {
        ThemeEffects.destroy();
    }
}

function updateSettingsUI() {
    ['light', 'dark', 'system'].forEach(mode => {
        const btn = document.getElementById(`btn-appearance-${mode}`);
        if(btn) {
            if (mode === currentAppearance) {
                btn.classList.add('bg-blue-100', 'text-blue-700', 'border-blue-500', 'dark:bg-blue-900/50', 'dark:text-blue-300');
                btn.classList.remove('bg-white', 'text-slate-700', 'border-slate-300', 'dark:bg-zinc-900', 'dark:text-zinc-300');
            } else {
                btn.classList.remove('bg-blue-100', 'text-blue-700', 'border-blue-500', 'dark:bg-blue-900/50', 'dark:text-blue-300');
                btn.classList.add('bg-white', 'text-slate-700', 'border-slate-300', 'dark:bg-zinc-900', 'dark:text-zinc-300');
            }
        }
    });

    customThemes.forEach(t => {
        const btn = document.getElementById(`btn-theme-${t.id}`);
        if(btn) {
            if (t.id === currentColorTheme) {
                btn.classList.add('bg-blue-100', 'text-blue-700', 'border-blue-500', 'dark:bg-blue-900/50', 'dark:text-blue-300');
                btn.classList.remove('bg-white', 'text-slate-700', 'border-slate-300', 'dark:bg-zinc-900', 'dark:text-zinc-300');
            } else {
                btn.classList.remove('bg-blue-100', 'text-blue-700', 'border-blue-500', 'dark:bg-blue-900/50', 'dark:text-blue-300');
                btn.classList.add('bg-white', 'text-slate-700', 'border-slate-300', 'dark:bg-zinc-900', 'dark:text-zinc-300');
            }
        }
    });
}

function openSettingsModal() {
    updateSettingsUI();
    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}
// ─── App Settings (Tagebuch & Navigation) ───────────────────────────────────

let tagebuchMode = localStorage.getItem('tagebuchMode') || 'web';   // 'web' | 'excel'
let navMode      = localStorage.getItem('navMode')      || 'google'; // 'google' | 'apple'

function getTagebuchLink(standort) {
    return tagebuchMode === 'excel'
        ? `ms-excel:ofv|u|${standort.link}`
        : `${standort.link}?web=1`;
}

function getNavLink(lat, lon) {
    return navMode === 'apple'
        ? `https://maps.apple.com/?daddr=${lat},${lon}`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

function changeTagebuchMode(mode) {
    tagebuchMode = mode;
    localStorage.setItem('tagebuchMode', mode);
    updateAppSettingsUI();
}

function changeNavMode(mode) {
    navMode = mode;
    localStorage.setItem('navMode', mode);
    updateAppSettingsUI();
}

function updateAppSettingsUI() {
    ['web', 'excel'].forEach(m => {
        const btn = document.getElementById(`btn-tagebuch-${m}`);
        if (!btn) return;
        if (m === tagebuchMode) {
            btn.classList.add('bg-blue-100', 'text-blue-700', 'border-blue-500', 'dark:bg-blue-900/50', 'dark:text-blue-300');
            btn.classList.remove('bg-white', 'text-slate-700', 'border-slate-300', 'dark:bg-zinc-900', 'dark:text-zinc-300');
        } else {
            btn.classList.remove('bg-blue-100', 'text-blue-700', 'border-blue-500', 'dark:bg-blue-900/50', 'dark:text-blue-300');
            btn.classList.add('bg-white', 'text-slate-700', 'border-slate-300', 'dark:bg-zinc-900', 'dark:text-zinc-300');
        }
    });
    ['google', 'apple'].forEach(m => {
        const btn = document.getElementById(`btn-nav-${m}`);
        if (!btn) return;
        if (m === navMode) {
            btn.classList.add('bg-blue-100', 'text-blue-700', 'border-blue-500', 'dark:bg-blue-900/50', 'dark:text-blue-300');
            btn.classList.remove('bg-white', 'text-slate-700', 'border-slate-300', 'dark:bg-zinc-900', 'dark:text-zinc-300');
        } else {
            btn.classList.remove('bg-blue-100', 'text-blue-700', 'border-blue-500', 'dark:bg-blue-900/50', 'dark:text-blue-300');
            btn.classList.add('bg-white', 'text-slate-700', 'border-slate-300', 'dark:bg-zinc-900', 'dark:text-zinc-300');
        }
    });
    // Sync route suggestions toggle (lives in planner.js)
    if (typeof _updateSuggestToggleUI === 'function') _updateSuggestToggleUI();
}

function openAppSettingsModal() {
    updateAppSettingsUI();
    document.getElementById('appSettingsModal').classList.remove('hidden');
}

function closeAppSettingsModal() {
    document.getElementById('appSettingsModal').classList.add('hidden');
}

// ─── Share a standort via maps navigation link ───────────────────────────────
function shareStandort(nummer, event) {
    event.preventDefault();
    event.stopPropagation();
    const s = standorte.find(st => String(st.nummer) === String(nummer));
    if (!s) return;
    const url = getNavLink(s.lat, s.lon);
    const title = `${s.nummer} – ${s.name}`;
    if (navigator.share) {
        navigator.share({ title, url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast('Navigationslink kopiert!');
        }).catch(() => {
            prompt('Link kopieren:', url);
        });
    }
}