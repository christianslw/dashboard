// ─── Changelog Modal ─────────────────────────────────────────────────────────
//
// Fetches /api/changelog (Cloudflare Pages Function that reads CHANGELOG.md
// from the private GitHub repo). Shows a modal when a new version is detected.
//
// localStorage keys:
//   seenChangelogVersion  — last version string the user has seen
//   hideChangelog         — "true" to suppress auto-show for all future versions

(function () {
    'use strict';

    const SEEN_KEY = 'seenChangelogVersion';
    const HIDE_KEY = 'hideChangelog';

    // ─── Minimal Markdown → HTML renderer ────────────────────────────────────
    // Supports: h2, h3, h4, unordered lists, bold, inline code, links, hr
    function _mdToHtml(md) {
        const lines = md.split('\n');
        const html  = [];
        let inList  = false;

        const escape = s =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const inline = raw => escape(raw)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code class="cl-code">$1</code>')
            .replace(
                /\[([^\]]+)\]\(([^)]+)\)/g,
                '<a href="$2" target="_blank" rel="noopener" class="cl-a">$1</a>'
            );

        const closeList = () => {
            if (inList) { html.push('</ul>'); inList = false; }
        };

        for (const raw of lines) {
            const t = raw.trim();

            if (/^#### /.test(t)) {
                closeList();
                html.push(`<h4 class="cl-h4">${inline(t.slice(5).trim())}</h4>`);
            } else if (/^### /.test(t)) {
                closeList();
                html.push(`<h3 class="cl-h3">${inline(t.slice(4).trim())}</h3>`);
            } else if (/^## /.test(t)) {
                closeList();
                html.push(`<h2 class="cl-h2">${inline(t.slice(3).trim())}</h2>`);
            } else if (/^(-{3,}|\*{3,})$/.test(t)) {
                closeList();
                html.push('<hr class="cl-hr">');
            } else if (/^[-*+] /.test(t)) {
                if (!inList) { html.push('<ul class="cl-ul">'); inList = true; }
                html.push(`<li class="cl-li">${inline(t.slice(2).trim())}</li>`);
            } else if (t === '') {
                closeList();
            } else {
                closeList();
                html.push(`<p class="cl-p">${inline(t)}</p>`);
            }
        }
        closeList();
        return html.join('\n');
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    let _cachedData = null;  // { markdown, version } once fetched

    function _render(markdown, version) {
        const body = document.getElementById('changelogBody');
        if (!body) return;
        body.innerHTML = _mdToHtml(markdown);

        const modal = document.getElementById('changelogModal');
        if (modal) modal.dataset.loaded = 'true';

        // Sync the "hide future" checkbox to stored preference
        const cb = document.getElementById('changelogHideFuture');
        if (cb) cb.checked = localStorage.getItem(HIDE_KEY) === 'true';

        if (version) localStorage.setItem(SEEN_KEY, version);
        _cachedData = { markdown, version };
    }

    function _open() {
        const modal = document.getElementById('changelogModal');
        if (modal) modal.classList.remove('hidden');
    }

    // ─── Public API (exposed on window) ──────────────────────────────────────

    async function initChangelog() {
        let data = null;
        try {
            const res = await fetch('/api/changelog');
            if (res.ok) data = await res.json();
        } catch {
            return; // non-critical — silently skip
        }

        if (!data?.markdown) return;

        // Update the footer version badge regardless of hide setting
        if (data.version) {
            const badge = document.getElementById('appVersionBadge');
            if (badge) badge.textContent = `Standort DB ${data.version}`;
        }

        // Auto-show only if not hidden and version is newer than last seen
        const hideAll = localStorage.getItem(HIDE_KEY) === 'true';
        const seen    = localStorage.getItem(SEEN_KEY);
        if (!hideAll && seen !== data.version) {
            _render(data.markdown, data.version);
            _open();
        } else if (data.version) {
            // Pre-render in the background so manual open is instant
            _render(data.markdown, data.version);
            // Don't open — version already seen or user opted out
            // (but we still marked it as "seen" in _render — only update if new)
            if (hideAll && seen !== data.version) {
                // Don't mark as seen when user has opted out — respect their choice
                // but keep the badge updated (already done above)
                // Re-set to previous seen value to not consume the "new" state
                if (seen) localStorage.setItem(SEEN_KEY, seen);
                else localStorage.removeItem(SEEN_KEY);
            }
        }
    }

    function openChangelogModal() {
        const modal = document.getElementById('changelogModal');
        if (!modal) return;

        // If already rendered, just open
        if (modal.dataset.loaded === 'true') {
            // Re-sync the checkbox
            const cb = document.getElementById('changelogHideFuture');
            if (cb) cb.checked = localStorage.getItem(HIDE_KEY) === 'true';
            _open();
            return;
        }

        // Fetch and render on demand
        fetch('/api/changelog')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data?.markdown) return;
                if (data.version) {
                    const badge = document.getElementById('appVersionBadge');
                    if (badge) badge.textContent = `Standort DB ${data.version}`;
                    localStorage.setItem(SEEN_KEY, data.version);
                }
                _render(data.markdown, data.version);
                _open();
            })
            .catch(() => {});
    }

    function closeChangelogModal() {
        const modal = document.getElementById('changelogModal');
        if (modal) modal.classList.add('hidden');
    }

    function onChangelogHideFutureChange(checked) {
        localStorage.setItem(HIDE_KEY, checked ? 'true' : 'false');
    }

    // Expose on window for inline onclick handlers
    window.initChangelog            = initChangelog;
    window.openChangelogModal       = openChangelogModal;
    window.closeChangelogModal      = closeChangelogModal;
    window.onChangelogHideFutureChange = onChangelogHideFutureChange;
})();
