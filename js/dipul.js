// --- DIPUL WMS Flugzonen -------------------------------------------------------
// Self-contained: manages WMS layers, state, and injects UI into the native
// Leaflet layer-control panel. No external plugins required.
//
// Lazy loading: tiles are NOT fetched until a sub-layer is enabled.
// Attribution: Quelle Geodaten: DFS, BKG 2026 | https://www.dipul.de
// ------------------------------------------------------------------------------

const DIPUL_WMS_URL   = 'https://uas-betrieb.de/geoservices/dipul/wms';
const DIPUL_STATE_KEY = 'dipulState_v2';

const DIPUL_LAYER_DEFS = [
    { id: 'flugbeschraenkungsgebiete', wmsLayer: 'dipul:flugbeschraenkungsgebiete',           label: 'Flugbeschr\u00e4nkungsgebiete', color: '#ef4444', tileClass: 'dipul-tile-fbg'  },
    { id: 'kontrollzonen',             wmsLayer: 'dipul:kontrollzonen',                        label: 'Kontrollzonen (CTR)',            color: '#a855f7', tileClass: 'dipul-tile-kz'   },
    { id: 'temporaere',                wmsLayer: 'dipul:temporaere_betriebseinschraenkungen',  label: 'Temp. Betriebseinschr.',         color: '#eab308', tileClass: 'dipul-tile-tmp'  },
    { id: 'flugplaetze',               wmsLayer: 'dipul:flugplaetze',                          label: 'Flugpl\u00e4tze',               color: '#3b82f6', tileClass: 'dipul-tile-fp'   },
    { id: 'flughaefen',                wmsLayer: 'dipul:flughaefen',                           label: 'Flugh\u00e4fen',                color: '#06b6d4', tileClass: 'dipul-tile-fh'   },
    { id: 'modellflugplaetze',         wmsLayer: 'dipul:modellflugplaetze',                    label: 'Modellflugpl\u00e4tze',         color: '#22c55e', tileClass: 'dipul-tile-mfp'  }
];

// --- State --------------------------------------------------------------------

function _dipulLoadState() {
    try {
        const raw = localStorage.getItem(DIPUL_STATE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    const sub = {};
    DIPUL_LAYER_DEFS.forEach(function(d) { sub[d.id] = true; });
    return { masterEnabled: false, subActive: sub };
}

function _dipulSaveState(state) {
    try { localStorage.setItem(DIPUL_STATE_KEY, JSON.stringify(state)); } catch (_) {}
}

// --- WMS layer factory --------------------------------------------------------

function _dipulMakeLayer(def) {
    return L.tileLayer.wms(DIPUL_WMS_URL, {
        layers:      def.wmsLayer,
        format:      'image/png',
        transparent: true,
        opacity:            0.8,
        attribution:        '<a href="https://www.dipul.de" target="_blank" rel="noopener">Geodaten: DFS, BKG 2026</a>',
        className:   def.tileClass + ' no-filter',
        zIndex:             200,
        maxZoom:            22,
        // --- Performance options ---
        tileSize:           512,    // half the tile count vs 256
        updateWhenIdle:     true,   // only fetch tiles after pan/zoom ends, not during
        updateWhenZooming:  false,  // skip intermediate zoom steps
        keepBuffer:         4       // keep 4 tiles of buffer so zones stay visible while panning
    });
}

// --- Public init --------------------------------------------------------------

function initDipulControl(map) {
    const state  = _dipulLoadState();
    const layers = {};
    DIPUL_LAYER_DEFS.forEach(function(d) { layers[d.id] = _dipulMakeLayer(d); });

    // Restore active layers onto map
    if (state.masterEnabled) {
        DIPUL_LAYER_DEFS.forEach(function(d) {
            if (state.subActive[d.id]) layers[d.id].addTo(map);
        });
    }

    // --- Build and inject UI --------------------------------------------------

    const overlayList = document.querySelector('.leaflet-control-layers-overlays');
    if (!overlayList) return;

    // Group header
    const groupHeader = document.createElement('div');
    groupHeader.className = 'leaflet-control-layers-group-name';
    groupHeader.style.cssText = 'margin-top:10px;margin-bottom:4px';

    // Master row
    const masterLabel = document.createElement('label');
    masterLabel.className = 'dipul-master-label';

    const masterCb = document.createElement('input');
    masterCb.type    = 'checkbox';
    masterCb.checked = state.masterEnabled;
    masterCb.style.cssText = 'flex-shrink:0; margin-right:0';

    const masterText = document.createElement('span');
    masterText.textContent = 'Flugzonen (DiPUL)';
    masterText.style.cssText = 'flex:1; font-weight:600';

    const chevron = document.createElement('i');
    chevron.className = 'mdi mdi-chevron-' + (state.masterEnabled ? 'up' : 'down');
    chevron.style.cssText = 'font-size:14px; opacity:0.6; flex-shrink:0; pointer-events:none';

    masterLabel.appendChild(masterCb);
    masterLabel.appendChild(masterText);
    masterLabel.appendChild(chevron);

    // Sub-layer container
    const subContainer = document.createElement('div');
    subContainer.className = 'dipul-sublayers';
    subContainer.style.display = state.masterEnabled ? '' : 'none';

    DIPUL_LAYER_DEFS.forEach(function(def) {
        const row = document.createElement('label');
        row.className = 'dipul-sub-label';

        const dot = document.createElement('span');
        dot.className = 'dipul-dot';
        dot.style.cssText = 'flex-shrink:0;width:9px;height:9px;border-radius:50%;background:' + def.color + ';border:1px solid rgba(0,0,0,0.18);display:inline-block';

        const cb = document.createElement('input');
        cb.type    = 'checkbox';
        cb.checked = !!(state.masterEnabled && state.subActive[def.id]);
        cb.dataset.dipulId = def.id;
        cb.style.cssText = 'flex-shrink:0;margin-right:0;accent-color:' + def.color;

        const lbl = document.createElement('span');
        lbl.textContent = def.label;

        row.appendChild(dot);
        row.appendChild(cb);
        row.appendChild(lbl);
        subContainer.appendChild(row);
    });

    overlayList.appendChild(groupHeader);
    overlayList.appendChild(masterLabel);
    overlayList.appendChild(subContainer);

    // --- Sync master indeterminate state --------------------------------------

    function _syncMasterState() {
        const total   = DIPUL_LAYER_DEFS.length;
        const checked = DIPUL_LAYER_DEFS.filter(function(d) {
            return state.masterEnabled && state.subActive[d.id];
        }).length;
        if (!state.masterEnabled) {
            masterCb.checked       = false;
            masterCb.indeterminate = false;
        } else if (checked === 0) {
            masterCb.checked       = false;
            masterCb.indeterminate = false;
            state.masterEnabled    = false;
            subContainer.style.display = 'none';
            chevron.className = 'mdi mdi-chevron-down';
        } else if (checked === total) {
            masterCb.checked       = true;
            masterCb.indeterminate = false;
        } else {
            masterCb.checked       = false;
            masterCb.indeterminate = true;
        }
        chevron.className = 'mdi mdi-chevron-' + (state.masterEnabled ? 'up' : 'down');
        _dipulSaveState(state);
    }

    // --- Master row handler ---------------------------------------------------
    // Clicking anywhere on the master label (including text) toggles all zones.

    masterLabel.addEventListener('click', function(e) {
        e.stopPropagation();
        // If user clicked directly on the checkbox, invert from its NEW checked state
        const enabling = masterCb.checked;
        state.masterEnabled = enabling;

        if (enabling) {
            DIPUL_LAYER_DEFS.forEach(function(d) { state.subActive[d.id] = true; });
        }

        DIPUL_LAYER_DEFS.forEach(function(d) {
            const subCb = subContainer.querySelector('[data-dipul-id="' + d.id + '"]');
            const on = enabling && state.subActive[d.id];
            if (subCb) subCb.checked = on;
            if (on  && !map.hasLayer(layers[d.id])) layers[d.id].addTo(map);
            if (!on &&  map.hasLayer(layers[d.id])) map.removeLayer(layers[d.id]);
        });

        subContainer.style.display = enabling ? '' : 'none';
        masterCb.checked           = enabling;
        masterCb.indeterminate     = false;
        chevron.className          = 'mdi mdi-chevron-' + (enabling ? 'up' : 'down');
        _dipulSaveState(state);
    });

    // Prevent the master checkbox's own change event from double-firing
    masterCb.addEventListener('change', function(e) { e.stopPropagation(); });

    // --- Sub-layer handlers ---------------------------------------------------
    // Native <label> click activates the checkbox. We just react to 'change'.

    subContainer.querySelectorAll('input[data-dipul-id]').forEach(function(cb) {
        cb.addEventListener('change', function(e) {
            e.stopPropagation();
            const id     = e.target.dataset.dipulId;
            const active = e.target.checked;
            state.subActive[id] = active;
            if (active  && !map.hasLayer(layers[id])) layers[id].addTo(map);
            if (!active &&  map.hasLayer(layers[id])) map.removeLayer(layers[id]);
            _syncMasterState();
        });
    });
}