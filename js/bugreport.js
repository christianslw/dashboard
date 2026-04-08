// ─── Bug Report Tool ─────────────────────────────────────────────────────────

const BugReport = (() => {
    const RECEIVER = 'christian.salwa@swrmediaservices.de';

    // State
    let pickerActive = false;
    let highlightBox  = null;
    let pickedSelector = '';

    // ── Open / Close ─────────────────────────────────────────────────────────

    function open() {
        const modal = document.getElementById('bugReportModal');
        if (!modal) return;
        // Reset form
        document.getElementById('bugDescription').value   = '';
        document.getElementById('bugSelectorInput').value = '';
        document.getElementById('bugTypeCosmetic').classList.add('active');
        document.getElementById('bugTypeFunctional').classList.remove('active');
        document.getElementById('bugTypeCosmetic').setAttribute('aria-pressed', 'true');
        document.getElementById('bugTypeFunctional').setAttribute('aria-pressed', 'false');
        document.getElementById('bugPickerStatus').textContent = '';
        pickedSelector = '';
        modal.classList.remove('hidden');
        requestAnimationFrame(() => document.getElementById('bugDescription').focus());
    }

    function close() {
        stopPicker();
        const modal = document.getElementById('bugReportModal');
        if (modal) modal.classList.add('hidden');
    }

    // ── Bug type toggle ──────────────────────────────────────────────────────

    function selectType(type) {
        const cosBtn = document.getElementById('bugTypeCosmetic');
        const funBtn = document.getElementById('bugTypeFunctional');
        if (type === 'cosmetic') {
            cosBtn.classList.add('active');
            funBtn.classList.remove('active');
            cosBtn.setAttribute('aria-pressed', 'true');
            funBtn.setAttribute('aria-pressed', 'false');
        } else {
            funBtn.classList.add('active');
            cosBtn.classList.remove('active');
            funBtn.setAttribute('aria-pressed', 'true');
            cosBtn.setAttribute('aria-pressed', 'false');
        }
    }

    function getSelectedType() {
        return document.getElementById('bugTypeCosmetic').classList.contains('active')
            ? 'Kosmetisch'
            : 'Funktional';
    }

    // ── CSS Selector picker ──────────────────────────────────────────────────

    function buildSelector(el) {
        if (!el || el === document.body || el === document.documentElement) return '';
        const parts = [];
        let cur = el;
        for (let i = 0; i < 5 && cur && cur !== document.body; i++) {
            let part = cur.tagName.toLowerCase();
            if (cur.id) {
                part += `#${CSS.escape(cur.id)}`;
                parts.unshift(part);
                break; // ID is unique enough
            }
            if (cur.className && typeof cur.className === 'string') {
                const cls = cur.className.trim().split(/\s+/)
                    .filter(c => !/^(hover:|dark:|focus:|active:|group|peer|transition|duration|ease|cursor|pointer|select|overflow|flex|grid|block|inline|hidden|relative|absolute|fixed|sticky|z\-|m[tblrxy]?-|p[tblrxy]?-|w-|h-|min-|max-|text-|bg-|border|rounded|shadow|gap|space|items|justify|self|shrink|grow|truncate|break|whitespace|sr-only|ring|opacity|scale|rotate|translate|inset|top|bottom|left|right|font|leading|tracking|align)/i.test(c))
                    .slice(0, 2);
                if (cls.length) part += '.' + cls.map(c => CSS.escape(c)).join('.');
            }
            // Add :nth-child to disambiguate siblings
            if (cur.parentElement) {
                const siblings = Array.from(cur.parentElement.children).filter(s => s.tagName === cur.tagName);
                if (siblings.length > 1) {
                    const idx = siblings.indexOf(cur) + 1;
                    part += `:nth-of-type(${idx})`;
                }
            }
            parts.unshift(part);
            cur = cur.parentElement;
        }
        return parts.join(' > ');
    }

    function createHighlightBox() {
        const box = document.createElement('div');
        box.id = 'bugPickerHighlight';
        Object.assign(box.style, {
            position: 'fixed', pointerEvents: 'none', zIndex: '999999',
            outline: '2px solid #3b82f6', background: 'rgba(59,130,246,0.08)',
            borderRadius: '3px', transition: 'all 0.05s ease',
            boxShadow: '0 0 0 1px rgba(59,130,246,0.4)'
        });
        document.body.appendChild(box);
        return box;
    }

    function moveHighlight(el) {
        if (!highlightBox || !el) return;
        const r = el.getBoundingClientRect();
        Object.assign(highlightBox.style, {
            top:    `${r.top}px`,
            left:   `${r.left}px`,
            width:  `${r.width}px`,
            height: `${r.height}px`,
            display: 'block'
        });
    }

    function onPickerMouseMove(e) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el.id === 'bugPickerHighlight') return;
        moveHighlight(el);
        const sel = buildSelector(el);
        const status = document.getElementById('bugPickerStatus');
        if (status) status.textContent = sel ? `→ ${sel}` : '';
    }

    function onPickerClick(e) {
        e.preventDefault();
        e.stopPropagation();
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el.id === 'bugPickerHighlight') return;
        pickedSelector = buildSelector(el);
        const input = document.getElementById('bugSelectorInput');
        if (input) input.value = pickedSelector;
        stopPicker();
        // Re-open modal if it was hidden during picking
        const modal = document.getElementById('bugReportModal');
        if (modal) modal.classList.remove('hidden');
        const status = document.getElementById('bugPickerStatus');
        if (status) status.textContent = 'Element ausgewählt ✓';

        // Scroll into input view
        if (input) input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function onPickerKeyDown(e) {
        if (e.key === 'Escape') {
            stopPicker();
            const modal = document.getElementById('bugReportModal');
            if (modal) modal.classList.remove('hidden');
        }
    }

    function startPicker() {
        if (pickerActive) return;
        pickerActive = true;

        // Hide modal so we can click on the actual page
        const modal = document.getElementById('bugReportModal');
        if (modal) modal.classList.add('hidden');

        highlightBox = createHighlightBox();

        // Show overlay hint
        const hint = document.createElement('div');
        hint.id = 'bugPickerHint';
        Object.assign(hint.style, {
            position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
            background: '#1e293b', color: '#f1f5f9', zIndex: '1000000',
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
            pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap'
        });
        hint.innerHTML = '<i style="margin-right:6px">🎯</i> Klicke auf das fehlerhafte Element &nbsp;·&nbsp; <kbd style="background:#334155;padding:2px 5px;border-radius:4px;font-size:11px">Esc</kbd> zum Abbrechen';
        document.body.appendChild(hint);

        document.addEventListener('mousemove', onPickerMouseMove, true);
        document.addEventListener('click',     onPickerClick,     true);
        document.addEventListener('keydown',   onPickerKeyDown,   true);

        document.body.style.cursor = 'crosshair';
    }

    function stopPicker() {
        if (!pickerActive) return;
        pickerActive = false;

        document.removeEventListener('mousemove', onPickerMouseMove, true);
        document.removeEventListener('click',     onPickerClick,     true);
        document.removeEventListener('keydown',   onPickerKeyDown,   true);

        document.body.style.cursor = '';

        if (highlightBox) { highlightBox.remove(); highlightBox = null; }
        const hint = document.getElementById('bugPickerHint');
        if (hint) hint.remove();
    }

    // ── Submit (open mailto) ─────────────────────────────────────────────────

    function submit() {
        const description = document.getElementById('bugDescription').value.trim();
        if (!description) {
            document.getElementById('bugDescription').focus();
            document.getElementById('bugDescription').classList.add('ring-2', 'ring-red-500');
            setTimeout(() => document.getElementById('bugDescription').classList.remove('ring-2', 'ring-red-500'), 1500);
            return;
        }

        const type     = getSelectedType();
        const selector = document.getElementById('bugSelectorInput').value.trim()
                      || pickedSelector
                      || '(nicht angegeben)';

        const url   = window.location.href;
        const ua    = navigator.userAgent;
        const ts    = new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
        const theme = document.documentElement.className || '(keine)';

        const subject = `[Bug] ${type}: ${description.slice(0, 60)}${description.length > 60 ? '…' : ''}`;

        const body = [
            `Fehlerbeschreibung`,
            `──────────────────`,
            description,
            ``,
            `Art des Problems:  ${type}`,
            ``,
            `Betroffenes Element (CSS-Selektor):`,
            selector,
            ``,
            `──────────────────`,
            `Zeitpunkt:   ${ts}`,
            `Seite:       ${url}`,
            `Themes:      ${theme}`,
            `User-Agent:  ${ua}`,
        ].join('\n');

        const mailto = `mailto:${RECEIVER}`
            + `?subject=${encodeURIComponent(subject)}`
            + `&body=${encodeURIComponent(body)}`;

        window.location.href = mailto;
        close();
    }

    // ── Public API ───────────────────────────────────────────────────────────
    return { open, close, selectType, startPicker, submit };
})();
