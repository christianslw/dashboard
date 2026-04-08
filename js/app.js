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
let radarHost = 'https://tilecache.rainviewer.com';
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