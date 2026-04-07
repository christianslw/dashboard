// ─── Cloudflare Backend Sync (sync.js) ────────────────────────────────────────────────────────
// User ID · Settings · Standorte · Overlay version polling

(function () {
    'use strict';

    // ─── CONSTANTS ───────────────────────────────────────────────────────────────

    const USER_ID_KEY            = 'cfSyncUserId';
    const SETTINGS_KEYS          = [
        'appearance', 'colorTheme',
        'sortField', 'sortDir',
        'tagebuchMode', 'navMode',
        'favoriteStations', 'stationFilterState',
    ];
    const SETTINGS_POLL_MS       = 45_000;   // Pull settings from backend every 45 s
    const SETTINGS_DEBOUNCE_MS   = 2_000;    // Wait 2 s after a change before pushing
    const OVERLAY_POLL_MS        = 5_000;    // Poll overlay version every 5 s

    // ─── STATE ───────────────────────────────────────────────────────────────────

    let _userId              = null;
    let _settingsPushTimer   = null;
    let _settingsPollTimer   = null;
    let _overlayPollTimer    = null;
    let _overlayLastVersion  = null;   // null means "first check"
    let _lastSettingsHash    = null;
    let _backendReachable    = false;

    // ─── USER ID ─────────────────────────────────────────────────────────────────

    function _uuid() {
        if (crypto?.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function getUserId() {
        if (_userId) return _userId;
        _userId = localStorage.getItem(USER_ID_KEY);
        if (!_userId) {
            _userId = _uuid();
            localStorage.setItem(USER_ID_KEY, _userId);
        }
        return _userId;
    }

    // ─── SETTINGS ────────────────────────────────────────────────────────────────

    function _collectSettings() {
        const out = {};
        SETTINGS_KEYS.forEach(k => {
            const v = localStorage.getItem(k);
            if (v !== null) out[k] = v;
        });
        return out;
    }

    function _settingsHash() {
        return JSON.stringify(_collectSettings());
    }

    function _applySettings(settings) {
        if (!settings || typeof settings !== 'object') return;
        let changed = false;
        SETTINGS_KEYS.forEach(k => {
            if (settings[k] !== undefined && settings[k] !== localStorage.getItem(k)) {
                localStorage.setItem(k, settings[k]);
                changed = true;
            }
        });
        if (!changed) return;

        // Re-hydrate in-memory state from updated localStorage
        if (typeof loadFavorites === 'function')         loadFavorites();
        if (typeof loadFilterState === 'function')       loadFilterState();
        if (typeof applyThemeAndAppearance === 'function') applyThemeAndAppearance();

        // Re-read scalar settings used by app.js
        if (typeof sortField !== 'undefined') {
            window.sortField = localStorage.getItem('sortField') || 'default';
            window.sortDir   = localStorage.getItem('sortDir')   || 'asc';
        }
        if (typeof tagebuchMode !== 'undefined') {
            window.tagebuchMode = localStorage.getItem('tagebuchMode') || 'web';
            window.navMode      = localStorage.getItem('navMode')      || 'google';
        }

        // Re-render list with new sort/filter state
        if (typeof filterStandorte === 'function') {
            try { filterStandorte(); } catch { /* ignore if not ready */ }
        }
    }

    async function loadSettingsFromBackend() {
        const uid = getUserId();
        try {
            const res = await fetch(`/api/settings?userId=${encodeURIComponent(uid)}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.settings) _applySettings(data.settings);
            _lastSettingsHash = _settingsHash(); // mark as clean after pulling
        } catch { /* backend may not be reachable — local fallback */ }
    }

    async function _pushSettings() {
        const uid = getUserId();
        try {
            await fetch('/api/settings', {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ userId: uid, settings: _collectSettings() }),
            });
        } catch { /* silent */ }
    }

    function _schedulePush() {
        if (_settingsPushTimer) clearTimeout(_settingsPushTimer);
        _settingsPushTimer = setTimeout(_pushSettings, SETTINGS_DEBOUNCE_MS);
    }

    /** Watch localStorage for setting changes and auto-push. */
    function _startSettingsChangeWatcher() {
        _lastSettingsHash = _settingsHash();
        setInterval(() => {
            const current = _settingsHash();
            if (current !== _lastSettingsHash) {
                _lastSettingsHash = current;
                _schedulePush();
            }
        }, 2_000);
    }

    /** Periodically pull settings to sync across devices. */
    function _startSettingsPoll() {
        if (_settingsPollTimer) clearInterval(_settingsPollTimer);
        _settingsPollTimer = setInterval(loadSettingsFromBackend, SETTINGS_POLL_MS);
    }

    // ─── STANDORTE ───────────────────────────────────────────────────────────────

    // Try to load standorte from backend; returns true on success (non-empty data).
    async function loadStandorteFromBackend() {
        try {
            const res = await fetch('/api/standorte');
            if (!res.ok) return false;
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                window.standorte = data;
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    // ─── OVERLAY POLLING ─────────────────────────────────────────────────────────

    async function _checkOverlayVersion() {
        try {
            const res = await fetch('/api/overlays/version');
            if (!res.ok) return;
            const { updatedAt } = await res.json();
            if (!updatedAt) return;

            if (_overlayLastVersion === null) {
                // First check on boot — just record the current version
                _overlayLastVersion = updatedAt;
                return;
            }

            if (updatedAt !== _overlayLastVersion) {
                _overlayLastVersion = updatedAt;
                await _refreshOverlays();
            }
        } catch { /* silent */ }
    }

    async function _refreshOverlays() {
        try {
            const res = await fetch('/api/overlays');
            if (!res.ok) return;
            const remote = await res.json();
            if (remote && typeof remote === 'object') {
                // Delegate to overlays.js which exposes this hook
                if (typeof window.setOverlayStoreFromRemote === 'function') {
                    window.setOverlayStoreFromRemote(remote);
                }
            }
        } catch { /* silent */ }
    }

    function startOverlayPolling() {
        if (_overlayPollTimer) clearInterval(_overlayPollTimer);
        _checkOverlayVersion(); // immediate first check
        _overlayPollTimer = setInterval(_checkOverlayVersion, OVERLAY_POLL_MS);
    }

    // ─── FAHRTANWEISUNGEN ────────────────────────────────────────────────────────

    let _fahrtanweisungenPushTimers = {}; // per-nummer debounce

    // Load all Fahrtanweisungen from backend into localStorage. Called once on boot.
    async function loadFahrtanweisungen() {
        try {
            const res = await fetch('/api/fahrtanweisungen');
            if (!res.ok) return;
            const data = await res.json();
            if (data && typeof data === 'object') {
                Object.entries(data).forEach(([nummer, entry]) => {
                    if (entry?.text) {
                        localStorage.setItem(`wayInstructions_${nummer}`, entry.text);
                    } else {
                        localStorage.removeItem(`wayInstructions_${nummer}`);
                    }
                });
            }
        } catch { /* silent — localStorage fallback remains */ }
    }

    // Push a Fahrtanweisung to backend (debounced 500 ms per nummer).
    function pushFahrtanweisung(nummer, text) {
        const key = String(nummer);
        if (_fahrtanweisungenPushTimers[key]) clearTimeout(_fahrtanweisungenPushTimers[key]);
        _fahrtanweisungenPushTimers[key] = setTimeout(async () => {
            delete _fahrtanweisungenPushTimers[key];
            try {
                await fetch(`/api/fahrtanweisungen/${encodeURIComponent(key)}`, {
                    method:  'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ text, updatedAt: new Date().toISOString() }),
                });
            } catch { /* silent */ }
        }, 500);
    }

    // Delete a Fahrtanweisung from the backend immediately.
    async function deleteFahrtanweisung(nummer) {
        try {
            await fetch(`/api/fahrtanweisungen/${encodeURIComponent(String(nummer))}`, {
                method: 'DELETE',
            });
        } catch { /* silent */ }
    }

    // ─── PROBE ───────────────────────────────────────────────────────────────────

    // Quick reachability check against the CF backend.
    async function probeBackend() {
        try {
            const res = await fetch('/api/overlays/version');
            _backendReachable = res.ok;
        } catch {
            _backendReachable = false;
        }
        return _backendReachable;
    }

    function isBackendReachable() { return _backendReachable; }

    // ─── PUBLIC API ──────────────────────────────────────────────────────────────

    const cfSync = {
        getUserId,
        isBackendReachable,
        probeBackend,

        // Settings
        loadSettingsFromBackend,
        pushSettingsNow: _pushSettings,
        startSettingsSync() {
            _startSettingsChangeWatcher();
            _startSettingsPoll();
        },

        // Standorte
        loadStandorteFromBackend,

        // Overlays
        startOverlayPolling,
        refreshOverlaysNow: _refreshOverlays,

        // Fahrtanweisungen
        loadFahrtanweisungen,
        pushFahrtanweisung,
        deleteFahrtanweisung,
    };

    window.__cfSync = cfSync;

})();
