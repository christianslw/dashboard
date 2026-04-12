// ─── Changelog Modal ─────────────────────────────────────────────────────────
//
// In production: fetches /api/changelog (Cloudflare Pages Function that reads
// CHANGELOG.md from the private GitHub repo via GITHUB_TOKEN secret).
// Fallback for local dev / unconfigured secrets: fetches /CHANGELOG.md directly.
//
// localStorage keys:
//   seenChangelogVersion  — last version string the user has seen
//   hideChangelog         — "true" to suppress auto-show for all future versions

(function () {
    'use strict';

    const SEEN_KEY = 'seenChangelogVersion';
    const HIDE_KEY = 'hideChangelog';

    // ─── Minimal Markdown → HTML renderer ────────────────────────────────────
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

    // ─── Data fetcher — API first, raw file fallback ──────────────────────────
    async function _fetchChangelog() {
        // 1. Try the Cloudflare Pages Function (production)
        try {
            const res = await fetch('/api/changelog');
            if (res.ok) {
                const data = await res.json();
                if (data?.markdown) return data;
            }
        } catch { /* fall through */ }

        // 2. Fallback: fetch the raw CHANGELOG.md file directly (local dev)
        try {
            const res = await fetch('/CHANGELOG.md');
            if (res.ok) {
                const markdown = await res.text();
                const versionMatch = markdown.match(/^##\s+\[?(v?[\d]+\.[\d]+(?:\.[\d]+)?)\]?/m);
                return { markdown, version: versionMatch ? versionMatch[1] : null };
            }
        } catch { /* fall through */ }

        return null;
    }

    // ─── Render helpers ───────────────────────────────────────────────────────
    function _render(markdown, version) {
        const body = document.getElementById('changelogBody');
        if (!body) return;
        body.innerHTML = _mdToHtml(markdown);

        const modal = document.getElementById('changelogModal');
        if (modal) modal.dataset.loaded = 'true';

        const cb = document.getElementById('changelogHideFuture');
        if (cb) cb.checked = localStorage.getItem(HIDE_KEY) === 'true';
    }

    function _showLoading() {
        const body = document.getElementById('changelogBody');
        if (body) body.innerHTML = '<p class="cl-p text-center py-4 text-slate-400 dark:text-zinc-500"><i class="mdi mdi-loading mdi-spin mr-1"></i> Laden…</p>';
    }

    function _showError() {
        const body = document.getElementById('changelogBody');
        if (body) body.innerHTML = '<p class="cl-p text-center py-4 text-slate-400 dark:text-zinc-500">Changelog konnte nicht geladen werden.</p>';
    }

    function _updateVersionBadge(version) {
        if (!version) return;
        const badge = document.getElementById('appVersionBadge');
        if (badge) badge.textContent = `Standort DB ${version}`;
    }

    function _openModal() {
        const modal = document.getElementById('changelogModal');
        if (modal) modal.classList.remove('hidden');
    }

    // ─── Auto-init on page load ───────────────────────────────────────────────
    async function initChangelog() {
        const data = await _fetchChangelog();

        if (data?.version) _updateVersionBadge(data.version);
        if (!data?.markdown) return;

        const hideAll = localStorage.getItem(HIDE_KEY) === 'true';
        const seen    = localStorage.getItem(SEEN_KEY);
        const isNew   = data.version ? seen !== data.version : !seen;

        // Always pre-render so manual open via button is instant
        _render(data.markdown, data.version);

        if (!hideAll && isNew) {
            // Mark as seen only when we actually show it
            if (data.version) localStorage.setItem(SEEN_KEY, data.version);
            _openModal();
        }
    }

    // ─── Manual open (footer button) ─────────────────────────────────────────
    function openChangelogModal() {
        const modal = document.getElementById('changelogModal');
        if (!modal) return;

        // Already rendered — just open
        if (modal.dataset.loaded === 'true') {
            const cb = document.getElementById('changelogHideFuture');
            if (cb) cb.checked = localStorage.getItem(HIDE_KEY) === 'true';
            _openModal();
            return;
        }

        // Show modal immediately with a spinner, then load
        _showLoading();
        _openModal();

        _fetchChangelog().then(data => {
            if (!data?.markdown) { _showError(); return; }
            if (data.version) {
                _updateVersionBadge(data.version);
                localStorage.setItem(SEEN_KEY, data.version);
            }
            _render(data.markdown, data.version);
        }).catch(() => _showError());
    }

    function closeChangelogModal() {
        const modal = document.getElementById('changelogModal');
        if (modal) modal.classList.add('hidden');
    }

    function onChangelogHideFutureChange(checked) {
        localStorage.setItem(HIDE_KEY, checked ? 'true' : 'false');
    }

    window.initChangelog               = initChangelog;
    window.openChangelogModal          = openChangelogModal;
    window.closeChangelogModal         = closeChangelogModal;
    window.onChangelogHideFutureChange = onChangelogHideFutureChange;
})();

