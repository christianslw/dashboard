// ─── Username / Nickname (username.js) ───────────────────────────────────────
// Stores a human-readable display name in localStorage so edits (overlays,
// Fahrtanweisungen) are attributed to the user by name rather than UUID.

(function () {
    'use strict';

    const STORAGE_KEY = 'userName';

    function get() {
        return localStorage.getItem(STORAGE_KEY) || '';
    }

    function set(name) {
        const trimmed = (name || '').trim();
        if (trimmed) {
            localStorage.setItem(STORAGE_KEY, trimmed);
        }
    }

    /** Returns the stored name, or 'Unbekannt' if none was set. */
    function getDisplayName() {
        return get() || 'Unbekannt';
    }

    /** Open the username modal (used by the "Name ändern" settings button). */
    function openModal() {
        const modal = document.getElementById('usernameModal');
        if (!modal) return;
        const input = document.getElementById('usernameInput');
        if (input) input.value = get();
        modal.classList.remove('hidden');
        setTimeout(() => input && input.focus(), 50);
    }

    function closeModal() {
        const modal = document.getElementById('usernameModal');
        if (modal) modal.classList.add('hidden');
    }

    function saveFromModal() {
        const input = document.getElementById('usernameInput');
        const name  = (input ? input.value : '').trim();
        if (!name) {
            const err = document.getElementById('usernameError');
            if (err) { err.textContent = 'Bitte gib einen Namen ein.'; err.classList.remove('hidden'); }
            return;
        }
        set(name);
        closeModal();
        // Update displayed name in settings badge if present
        const badge = document.getElementById('usernameDisplay');
        if (badge) badge.textContent = name;
    }

    /** Called by init.js after DOM is ready — prompts on first visit. */
    function initPromptIfNeeded() {
        if (!get()) {
            openModal();
        } else {
            const badge = document.getElementById('usernameDisplay');
            if (badge) badge.textContent = get();
        }
    }

    // Allow Enter key in the modal input
    document.addEventListener('keydown', function (e) {
        const modal = document.getElementById('usernameModal');
        if (!modal || modal.classList.contains('hidden')) return;
        if (e.key === 'Enter') saveFromModal();
        if (e.key === 'Escape') {
            // Only allow closing without saving if user already has a name
            if (get()) closeModal();
        }
    });

    // Expose globally
    window.getUserDisplayName      = getDisplayName;
    window.openUsernameModal       = openModal;
    window.closeUsernameModal      = closeModal;
    window.saveUsernameFromModal   = saveFromModal;
    window.initUsernamePrompt      = initPromptIfNeeded;

})();
