// ─── Leaflet Map & Clustering ────────────────────────────────────────────────────────────

let osmLayer;
const RADAR_MAX_NATIVE_ZOOM = 10;
const RAINVIEWER_COLOR_SCHEME = 8;
const ACTIVE_OVERLAYS_STORAGE_KEY = 'activeOverlayLayers';
const RAINVIEWER_LAYER_NAME = 'Regenradar';
let isRichtfunkLayerActive = false;
let markerPlainGroup = null;

const STATION_PREFIX_COLORS = {
    1: '#8b5cf6',
    2: '#10b981',
    3: '#f59e0b',
    4: '#ef4444',
    5: '#ec4899',
    6: '#06b6d4',
    8: '#6366f1',
    9: '#eab308'
};

function getStationPrefixColor(nummer) {
    const prefix = Math.floor(Number(nummer) / 1000);
    return STATION_PREFIX_COLORS[prefix] || '#3b82f6';
}

function mixHexColors(colorA, colorB) {
    function parse(hex) {
        const clean = String(hex || '').replace('#', '');
        const full = clean.length === 3
            ? clean.split('').map(ch => ch + ch).join('')
            : clean.padEnd(6, '0').slice(0, 6);
        return {
            r: parseInt(full.slice(0, 2), 16),
            g: parseInt(full.slice(2, 4), 16),
            b: parseInt(full.slice(4, 6), 16)
        };
    }

    function toHex(value) {
        return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
    }

    const a = parse(colorA);
    const b = parse(colorB);
    return `#${toHex((a.r + b.r) / 2)}${toHex((a.g + b.g) / 2)}${toHex((a.b + b.b) / 2)}`;
}

/** Return an rgba() string for a hex color. Uses global hexToRgba if available. */
function mapHexToRgba(hex, alpha) {
    if (typeof hexToRgba === 'function') return hexToRgba(hex, alpha);
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    h = h.padEnd(6, '0').slice(0, 6);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

/** Find a Richtfunk partner for a station and return a mixed hex color. */
function getRichtfunkPartnerMixedColor(nummer) {
    const selfColor = getStationPrefixColor(nummer);
    if (!Array.isArray(standorte) || standorte.length === 0) return selfColor;
    const s = standorte.find(st => String(st.nummer) === String(nummer));
    if (s && Array.isArray(s.richtfunk) && s.richtfunk.length) {
        const targetId = s.richtfunk.find(tid => {
            const t = standorte.find(st => String(st.nummer) === String(tid));
            return t && t.lat && t.lon;
        });
        if (targetId) return mixHexColors(selfColor, getStationPrefixColor(targetId));
    }
    // Fallback: find any other station that links to this one
    const other = standorte.find(st => Array.isArray(st.richtfunk) && st.richtfunk.some(t => String(t) === String(nummer)));
    if (other) return mixHexColors(selfColor, getStationPrefixColor(other.nummer));
    return selfColor;
}

function loadActiveOverlayLayerNames() {
    try {
        const raw = localStorage.getItem(ACTIVE_OVERLAYS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveActiveOverlayLayerNames(overlayLayers) {
    if (!leafletMap || !overlayLayers) return;
    const activeNames = Object.keys(overlayLayers).filter(name => leafletMap.hasLayer(overlayLayers[name]));
    localStorage.setItem(ACTIVE_OVERLAYS_STORAGE_KEY, JSON.stringify(activeNames));
}

function restoreActiveOverlayLayers(overlayLayers) {
    const names = loadActiveOverlayLayerNames();
    names.forEach(name => {
        let normalizedName = name === 'Regenradar + Vorhersage' ? RAINVIEWER_LAYER_NAME : name;
        if (Object.prototype.hasOwnProperty.call(LEGACY_OVERLAY_NAMES, normalizedName)) {
            normalizedName = LEGACY_OVERLAY_NAMES[normalizedName];
        }
        if (!normalizedName) return;
        const layer = overlayLayers[normalizedName];
        if (!layer || leafletMap.hasLayer(layer)) return;
        layer.addTo(leafletMap);
        if (normalizedName === RAINVIEWER_LAYER_NAME) {
            loadRadarFrames();
            showRadarTimeline();
        }
        if (normalizedName === 'Richtfunkstrecken') {
            drawRichtfunkLines(layer);
        }
    });
    saveActiveOverlayLayerNames(overlayLayers);
}

function getThemeAwareOsmUrl() {
    return OSM_TILE_URL;
}

// ─── Geodaten-Overlays: ein Menüpunkt je Datentyp, Landesdienst je Kartenausschnitt ───
// BW und RLP teilen sich die Menüpunkte; welche WMS-Kacheln geladen werden,
// entscheidet der aktuelle Kartenausschnitt (siehe _refreshSmartGeoOverlays).
const GEODATA_OVERLAYS = {
    'Flurstücke (ALKIS)': { label: 'Flurstücke (ALKIS)' },
    'Schummerung':        { label: 'Schummerung' },
    'Luftbild (DOP20)':   { label: 'Luftbild (DOP20)' }
};

const OVERLAY_CATEGORY = {
    'DWD Warnzonen':       'Wetter & Infrastruktur',
    'Regenradar':          'Wetter & Infrastruktur',
    'Richtfunkstrecken':   'Wetter & Infrastruktur',
    'Flurstücke (ALKIS)':  'Kataster & Grenzen',
    'Schummerung':         'Gelände & Luftbild',
    'Luftbild (DOP20)':    'Gelände & Luftbild'
};

// Alte, getrennte BW/RLP-Menüpunkte aus localStorage auf die neuen Keys ziehen.
const LEGACY_OVERLAY_NAMES = {
    'Flurstücke BW (ALKIS)': 'Flurstücke (ALKIS)',
    'Flurstücke RLP (ALKIS)': 'Flurstücke (ALKIS)',
    'Schummerung BW': 'Schummerung',
    'Schummerung RLP': 'Schummerung',
    'Luftbild BW (DOP20)': 'Luftbild (DOP20)',
    'Luftbild RLP (DOP20)': 'Luftbild (DOP20)',
    'DOP-Aktualität BW': null
};

// Abfragbare Quellen für den Karten-Klick. BW-Flurstücke laufen über den
// Open-Data-WFS (Punkt-BBOX, count=1), RLP über WMS GetFeatureInfo.
// Versionen explizit: BW-WMS 1.3.0 (crs=/i/j), RLP-WMS 1.1.1 (srs=/x/y).
const GEODATA_INFO_SOURCES = [
    {
        state: 'rlp', overlay: 'Flurstücke (ALKIS)', title: 'Flurstück', icon: 'mdi-vector-square',
        wmsUrl: RLP_ALKIS_WMS, queryLayers: 'Flurstueck',
        version: '1.1.1', infoFormat: 'text/html',
        parse: _parseFlurstueckHtml
    },
    {
        state: 'bw', overlay: 'Flurstücke (ALKIS)', title: 'Flurstück', icon: 'mdi-vector-square', wfs: true,
        wfsUrl: LGL_BW_ALKIS_WFS, typeName: 'nora:v_al_flurstueck',
        parse: _parseBwFlurstueckJson
    },
    {
        state: 'rlp', overlay: 'Luftbild (DOP20)', title: 'Luftbild Rheinland-Pfalz', icon: 'mdi-image-outline',
        wmsUrl: RLP_DOP_WMS, queryLayers: 'rp_dop20_info',
        version: '1.1.1', infoFormat: 'text/plain',
        parse: _parsePlainInfo,
        keys: ['titel', 'erstellung', 'aktualisierung']
    },
    {
        state: 'bw', overlay: 'Luftbild (DOP20)', title: 'Luftbild Baden-Württemberg', icon: 'mdi-image-outline',
        wmsUrl: LGL_BW_DOP_AKTUALITAET_WMS, queryLayers: 'verm:v_dop_20_bildflugkacheln',
        version: '1.3.0', infoFormat: 'text/plain',
        parse: _parsePlainInfo,
        keys: ['befliegungsdatum']
    }
];

// Anzeigename für GetFeatureInfo-Felder (text/plain-Antworten)
const GEODATA_INFO_FIELD_LABELS = {
    befliegungsdatum: 'Befliegungsdatum',
    bearbeitungsjahr: 'Bearbeitungsjahr',
    kamera: 'Kamera',
    flughoehe: 'Flughöhe',
    farbtiefe: 'Farbtiefe',
    titel: 'Kachel',
    erstellung: 'Erstellung',
    aktualisierung: 'Aktualisierung'
};

// GetFeatureInfo exakt am Klickpunkt: Viewport-BBOX, Viewport-Größe und
// Klickpixel aus Leaflet — keine geratene 101×101-Box, kein Achsentausch.
async function _fetchWmsFeatureInfo(source, latlng) {
    const is13 = source.version === '1.3.0';
    const bounds = leafletMap.getBounds();
    const sw = leafletMap.options.crs.project(bounds.getSouthWest());
    const ne = leafletMap.options.crs.project(bounds.getNorthEast());
    const size = leafletMap.getSize();
    const point = leafletMap.latLngToContainerPoint(latlng);
    const params = new URLSearchParams({
        service: 'WMS',
        request: 'GetFeatureInfo',
        version: source.version,
        layers: source.queryLayers,
        query_layers: source.queryLayers,
        styles: '',
        format: 'image/png',
        transparent: 'true',
        bbox: sw.x + ',' + sw.y + ',' + ne.x + ',' + ne.y,
        width: String(size.x),
        height: String(size.y),
        feature_count: '1',
        buffer: '1',
        info_format: source.infoFormat
    });
    if (is13) {
        params.set('crs', 'EPSG:3857');
        params.set('i', String(Math.round(point.x)));
        params.set('j', String(Math.round(point.y)));
    } else {
        params.set('srs', 'EPSG:3857');
        params.set('x', String(Math.round(point.x)));
        params.set('y', String(Math.round(point.y)));
    }
    try {
        const res = await fetch(source.wmsUrl + params.toString());
        return { source: source, text: await res.text() };
    } catch (err) {
        return { source: source, text: '' };
    }
}

function _escapeGeodataHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// Zeilen als kompakte Faktenliste (Label links, Wert rechts). Nummer und
// Kennzeichen bekommen einen Kopier-Button.
function _geodataFacts(rows) {
    const items = rows.filter(function (r) { return r[1]; }).map(function (r) {
        const key = r[0];
        const value = _escapeGeodataHtml(r[1]);
        const copyable = key === 'Flurstücksnummer' || key === 'Flurstückskennzeichen';
        const primary = key === 'Flurstücksnummer' ? ' geodata-fact-primary' : '';
        const longValue = key === 'Flurstückskennzeichen' ? ' geodata-fact-long' : '';
        const wideValue = key === 'Nutzung' ? ' geodata-fact-wide' : '';
        const label = key === 'Flurstückskennzeichen' ? 'Kennzeichen' : key;
        const copyBtn = copyable
            ? '<button type="button" class="geodata-copy" data-copy="' + value + '" title="Kopieren" aria-label="' + _escapeGeodataHtml(key) + ' kopieren"><i class="mdi mdi-content-copy"></i></button>'
            : '';
        return '<div class="geodata-fact' + primary + longValue + wideValue + '"><dt>' + _escapeGeodataHtml(label) + '</dt>' +
               '<dd>' + value + copyBtn + '</dd></div>';
    }).join('');
    return items ? '<dl class="geodata-facts">' + items + '</dl>' : '';
}

// LVermGeoRP liefert beim Flurstück ein fertiges HTML-Feature-Formular —
// Tabellenzeilen herausfiltern und in unser Popup-HTML übersetzen.
function _parseFlurstueckHtml(text) {
    if (!text || text.indexOf('tableStyle') === -1) return '';
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const rows = Array.from(doc.querySelectorAll('table.tableStyle tbody tr')).map(function (tr) {
        const k = tr.querySelector('.firstcell');
        const v = tr.querySelector('.whitecell');
        if (!k || !v || tr.querySelectorAll('td').length !== 2) return ['', ''];
        let label = k.textContent.trim();
        const val = v.textContent.trim();
        if (label.indexOf('Gemarkung') === 0) label = 'Gemarkung';
        if (label.indexOf('Amtliche Fläche') === 0) label = 'Fläche m²';
        if (label.indexOf('Tatsächliche Nutzung') === 0) label = 'Nutzung';
        const keep = ['Flurstückskennzeichen', 'Flurstücksnummer', 'Flurnummer', 'Gemarkung', 'Gemeinde', 'Fläche m²', 'Nutzung'];
        if (keep.indexOf(label) === -1) return ['', ''];
        return [label, val === 'n/a' ? '' : val];
    });
    return _geodataFacts(rows);
}

// text/plain-Antworten: "key = value"-Zeilen — MapServer quote't den Wert
// ('25.08.2025'), deegree nicht (2026-05-24). Beides zulassen.
function _parsePlainInfo(text, source) {
    if (!text) return '';
    const wanted = source.keys || [];
    const rows = text.split(/\r?\n/).map(function (line) {
        const m = line.match(/^\s*([\w\-]+)\s*=\s*'?(.*?)'?\s*$/);
        if (!m || wanted.indexOf(m[1]) === -1) return ['', ''];
        let val = m[2];
        if (m[1] === 'befliegungsdatum') {
            const date = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (date) val = date[3] + '.' + date[2] + '.' + date[1];
        }
        const label = GEODATA_INFO_FIELD_LABELS[m[1]] || m[1];
        return [label, (val === 'n/a' || val === 'null') ? '' : val];
    });
    return _geodataFacts(rows);
}

// Punkt-in-Polygon (Ray-Casting) für die exakte Auswahl aus den WFS-Kandidaten.
function _pointInRing(ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}
function _pointInPolygon(polygon, x, y) {
    if (!polygon.length || !_pointInRing(polygon[0], x, y)) return false;
    for (let i = 1; i < polygon.length; i++) {
        if (_pointInRing(polygon[i], x, y)) return false;
    }
    return true;
}
function _featureContainsPoint(feature, x, y) {
    const g = feature && feature.geometry;
    if (!g) return false;
    if (g.type === 'Polygon') return _pointInPolygon(g.coordinates, x, y);
    if (g.type === 'MultiPolygon') {
        return g.coordinates.some(function(polygon) { return _pointInPolygon(polygon, x, y); });
    }
    return false;
}

// BW-Flurstücke: 1-m-Box liefert alle Kandidaten, danach wird clientseitig
// das Polygon ausgewählt, das den Klickpunkt wirklich enthält. count=1 auf
// dem Server war die Ursache für das falsche Nachbarflurstück an Grenzen.
async function _fetchWfsFeatureAt(source, latlng) {
    const p = leafletMap.options.crs.project(latlng);
    const d = 0.5;
    const params = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: source.typeName,
        outputFormat: 'application/json',
        srsName: 'urn:ogc:def:crs:EPSG::3857',
        count: '50',
        bbox: (p.x - d) + ',' + (p.y - d) + ',' + (p.x + d) + ',' + (p.y + d) + ',urn:ogc:def:crs:EPSG::3857'
    });
    try {
        const res = await fetch(source.wfsUrl + params.toString());
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (err) {
            return { source: source, text: '' };
        }
        const match = (data.features || []).find(function(feature) {
            return _featureContainsPoint(feature, p.x, p.y);
        });
        return { source: source, text: match ? JSON.stringify({ features: [match] }) : '' };
    } catch (err) {
        return { source: source, text: '' };
    }
}

// BW-Flurstücke (WFS nora:v_al_flurstueck, GeoJSON): count=1 liefert das
// Flurstück unter dem Cursor — keine Nachbarflurstücke mehr.
function _parseBwFlurstueckJson(text) {
    if (!text) return '';
    let feature;
    try {
        feature = (JSON.parse(text).features || [])[0];
    } catch (err) {
        return '';
    }
    if (!feature) return '';
    const p = feature.properties || {};
    const nummer = p.zaehler + (p.nenner && p.nenner !== 0 ? '/' + p.nenner : '');
    return _geodataFacts([
        ['Gemarkung', p.gemarkung_name],
        ['Gemeinde', p.gemeinde_name],
        ['Flurstücksnummer', nummer],
        ['Flurstückskennzeichen', p.flurstueckskennzeichen],
        ['Fläche m²', p.amtliche_flaeche]
    ]);
}

function _bindGeodataPopupActions(popup) {
    const el = popup.getElement();
    if (!el) return;
    el.querySelectorAll('[data-copy]').forEach(function(btn) {
        btn.addEventListener('click', function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(btn.dataset.copy).catch(function() {});
            }
            const icon = btn.querySelector('.mdi');
            if (!icon) return;
            const previous = icon.className;
            icon.className = 'mdi mdi-check';
            setTimeout(function() { icon.className = previous; }, 1200);
        });
    });
}

async function _runGeodataInfoQuery(e, sources) {
    const coords = e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5);
    const header = '<div class="geodata-header"><span class="geodata-kicker">Standortinfo</span>' +
        '<span class="geodata-coords">' + coords + '</span></div>';
    const actions = '<div class="geodata-actions">' +
        '<button type="button" class="geodata-action" data-copy="' + coords + '" title="Koordinaten kopieren">' +
        '<i class="mdi mdi-content-copy"></i><span>Koordinaten</span></button>' +
        '<a class="geodata-action" href="https://www.google.com/maps/search/?api=1&query=' +
        e.latlng.lat + ',' + e.latlng.lng + '" target="_blank" rel="noopener">' +
        '<i class="mdi mdi-google-maps"></i><span>Google Maps</span></a></div>';

    const popup = L.popup({
        maxWidth: 300, minWidth: 250,
        autoPanPaddingTopLeft: L.point(56, 70),
        autoPanPaddingBottomRight: L.point(20, 20),
        className: 'geodata-popup'
    })
        .setLatLng(e.latlng)
        .setContent('<div class="geodata-card">' + header +
            '<div class="geodata-note"><i class="mdi mdi-loading"></i>Objektdaten werden abgefragt…</div></div>')
        .openOn(leafletMap);
    // Nach dem ersten Öffnen nicht mehr automatisch nachpanen: sonst zwingt
    // eine späte Antwort die Karte zurück zum angeklickten Flurstück.
    popup.options.autoPan = false;

    const sections = new Array(sources.length).fill('');
    let pending = sources.length;
    function render() {
        let body = sections.filter(Boolean).join('');
        if (!body) {
            body = pending
                ? '<div class="geodata-note"><i class="mdi mdi-loading"></i>Objektdaten werden abgefragt…</div>'
                : '<div class="geodata-empty"><i class="mdi mdi-map-search-outline"></i>' +
                  '<p>Keine Objekte gefunden</p><span>Weiter zoomen oder innerhalb der Datenabdeckung klicken.</span></div>';
        } else if (pending) {
            body += '<div class="geodata-note"><i class="mdi mdi-loading"></i>Weitere Daten…</div>';
        }
        popup.setContent('<div class="geodata-card">' + header + body + actions + '</div>');
        popup.update();
        _bindGeodataPopupActions(popup);
    }

    sources.forEach(function(s, index) {
        const request = s.wfs ? _fetchWfsFeatureAt(s, e.latlng) : _fetchWmsFeatureInfo(s, e.latlng);
        request.then(function(r) {
            const facts = r.source.parse(r.text, r.source);
            if (facts) {
                sections[index] = '<section class="geodata-section">' +
                    '<div class="geodata-head"><span class="geodata-icon"><i class="mdi ' + (r.source.icon || 'mdi-map-marker-outline') + '"></i></span>' +
                    '<h4>' + _escapeGeodataHtml(r.source.title) + '</h4></div>' +
                    facts + '</section>';
            }
        }).catch(function() {}).then(function() {
            pending--;
            render();
        });
    });
}


// ─── Custom Kartenebenen Control ─────────────────────────────────────────────
// Replaces the stock Leaflet L.control.layers with a grouped, styled panel:
//   · Karten    → mutually-exclusive radio buttons (base layer selection)
//   · Overlays  → checkboxes (DWD, Regenradar, Richtfunk…)
//   DiPUL injects its section into .leaflet-control-layers-overlays after init.

function _buildCustomLayerControl(map, baseLayers, overlayLayers) {
    const ctrl = L.control({ position: 'topright' });

    ctrl.onAdd = function() {
        const wrap = L.DomUtil.create('div', 'clc-wrap');
        L.DomEvent.disableClickPropagation(wrap);
        L.DomEvent.disableScrollPropagation(wrap);

        // ── Toggle button ────────────────────────────────────────────
        const btn = L.DomUtil.create('button', 'clc-toggle', wrap);
        btn.title = 'Kartenebenen';
        const btnIcon = document.createElement('i');
        btnIcon.className = 'mdi mdi-layers-outline';
        btnIcon.style.cssText = 'font-size:18px;line-height:1;pointer-events:none';
        btn.appendChild(btnIcon);

        // ── Panel ────────────────────────────────────────────────
        const panel = L.DomUtil.create('div', 'clc-panel', wrap);
        panel.style.display = 'none';

        // ── Panel header ─────────────────────────────────────────
        const pHead = document.createElement('div');
        pHead.className = 'clc-panel-head';
        const pTitle = document.createElement('span');
        pTitle.className = 'clc-panel-title';
        pTitle.innerHTML = '<i class="mdi mdi-layers-outline"></i><span>Kartenebenen</span>';
        const pClose = document.createElement('button');
        pClose.type = 'button';
        pClose.className = 'clc-panel-close';
        pClose.title = 'Schließen';
        pClose.setAttribute('aria-label', 'Kartenebenen schließen');
        pClose.innerHTML = '<i class="mdi mdi-close"></i>';
        pClose.addEventListener('click', function () { panel.style.display = 'none'; });
        pHead.appendChild(pTitle);
        pHead.appendChild(pClose);
        panel.appendChild(pHead);

        // ——— Hintergrundkarte ———
        const kHead = document.createElement('div');
        kHead.className = 'clc-section-head';
        kHead.textContent = 'Hintergrundkarte';
        panel.appendChild(kHead);

        const kList = document.createElement('div');
        kList.className = 'clc-list';
        Object.entries(baseLayers).forEach(function([name, layer]) {
            const lbl = document.createElement('label');
            lbl.className = 'clc-row';
            const r = document.createElement('input');
            r.type = 'radio';
            r.name = 'clc-base-layer';
            r.dataset.name = name;
            r.checked = map.hasLayer(layer);
            r.addEventListener('change', function() {
                if (!r.checked) return;
                Object.values(baseLayers).forEach(function(l) { if (map.hasLayer(l)) map.removeLayer(l); });
                layer.addTo(map);
                map.fire('baselayerchange', { name: name, layer: layer });
            });
            const s = document.createElement('span');
            s.textContent = name;
            lbl.appendChild(r);
            lbl.appendChild(s);
            kList.appendChild(lbl);
        });
        panel.appendChild(kList);

        // ——— Divider ———
        const divider = document.createElement('div');
        divider.className = 'clc-divider';
        panel.appendChild(divider);

        // .leaflet-control-layers-overlays: DiPUL injects its section here
        const oList = document.createElement('div');
        oList.className = 'clc-list leaflet-control-layers-overlays';

        const categoryLists = {};
        function _categoryList(category) {
            if (categoryLists[category]) return categoryLists[category];
            const head = document.createElement('div');
            head.className = 'clc-category-head';
            head.textContent = category;
            oList.appendChild(head);
            const list = document.createElement('div');
            list.className = 'clc-category-list';
            oList.appendChild(list);
            categoryLists[category] = list;
            return list;
        }

        const categoryRank = { 'Kataster & Grenzen': 0, 'Gelände & Luftbild': 1, 'Wetter & Infrastruktur': 2 };
        const sortedOverlays = Object.entries(overlayLayers).sort(function(a, b) {
            const ra = categoryRank[OVERLAY_CATEGORY[a[0]]] ?? 3;
            const rb = categoryRank[OVERLAY_CATEGORY[b[0]]] ?? 3;
            return ra - rb;
        });

        sortedOverlays.forEach(function([name, layer]) {
            const meta = GEODATA_OVERLAYS[name];
            const target = _categoryList(OVERLAY_CATEGORY[name] || 'Weitere Ebenen');
            const lbl = document.createElement('label');
            lbl.className = 'clc-row';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.name = name;
            cb.checked = map.hasLayer(layer);
            cb.addEventListener('change', function() {
                if (cb.checked) {
                    layer.addTo(map);
                    map.fire('overlayadd', { name: name, layer: layer });
                } else {
                    map.removeLayer(layer);
                    map.fire('overlayremove', { name: name, layer: layer });
                }
            });
            const s = document.createElement('span');
            s.className = 'clc-row-label';
            s.textContent = meta ? meta.label : name;
            lbl.appendChild(cb);
            lbl.appendChild(s);
            target.appendChild(lbl);
        });

        panel.appendChild(oList);

        // ── Toggle & close-on-outside-click ────────────────────────────
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const opening = panel.style.display === 'none';
            if (opening) {
                // Sync radio/checkbox states with actual map layer state
                Object.entries(baseLayers).forEach(function([name]) {
                    const r = kList.querySelector(`input[data-name="${CSS.escape(name)}"]`);
                    if (r) r.checked = map.hasLayer(baseLayers[name]);
                });
                Object.entries(overlayLayers).forEach(function([name]) {
                    const cb = oList.querySelector(`input[data-name="${CSS.escape(name)}"]`);
                    if (cb) cb.checked = map.hasLayer(overlayLayers[name]);
                });
            }
            panel.style.display = opening ? '' : 'none';
        });
        document.addEventListener('click', function(e) {
            if (!wrap.contains(e.target)) panel.style.display = 'none';
        });

        return wrap;
    };

    ctrl.addTo(map);
    return ctrl;
}

// ─── Richtfunkstrecken ─────────────────────────────────────────────────────────────
// Draws dashed polylines between all stations linked via their richtfunk[] arrays.
// Each pair is drawn exactly once (both directions de-duplicated via sorted key).

function drawRichtfunkLines(layerGroup) {
    layerGroup.clearLayers();
    if (!Array.isArray(standorte) || standorte.length === 0) return;
    const seen = new Set();
    standorte.forEach(function(s) {
        if (!s.lat || !s.lon || !Array.isArray(s.richtfunk) || s.richtfunk.length === 0) return;
        s.richtfunk.forEach(function(targetId) {
            const pair = [String(s.nummer), String(targetId)].sort().join('\u2194');
            if (seen.has(pair)) return;
            seen.add(pair);
            const t = standorte.find(function(st) { return String(st.nummer) === String(targetId); });
            if (!t || !t.lat || !t.lon) return;

            const startColor = getStationPrefixColor(s.nummer);
            const endColor = getStationPrefixColor(t.nummer);
            const lineColor = mixHexColors(startColor, endColor);

            L.polyline([[s.lat, s.lon], [t.lat, t.lon]], {
                color: lineColor,
                weight: 4,
                opacity: 0.95,
                dashArray: '6, 6',
                className: 'no-filter richtfunk-line'
            })
            .bindTooltip(
                s.nummer + ' \u2013 ' + s.name + '<br>' + t.nummer + ' \u2013 ' + t.name,
                { sticky: true }
            )
            .addTo(layerGroup);
        });
    });
}

function getRichtfunkLinkedStationNummern() {
    const linked = new Set();
    if (!Array.isArray(standorte) || standorte.length === 0) return linked;
    standorte.forEach(function(s) {
        if (!s || !s.lat || !s.lon || !Array.isArray(s.richtfunk) || s.richtfunk.length === 0) return;
        const sourceNummer = String(s.nummer);
        s.richtfunk.forEach(function(targetId) {
            const target = standorte.find(function(st) { return String(st.nummer) === String(targetId); });
            if (!target || !target.lat || !target.lon) return;
            linked.add(sourceNummer);
            linked.add(String(targetId));
        });
    });
    return linked;
}

function initLeafletMap() {
    leafletMap = L.map('mainMap').setView([48.6, 9.2], 7);

    osmLayer = L.tileLayer(getThemeAwareOsmUrl(), {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        className: 'osm-tiles'
    });

    const openTopoMapLayer = L.tileLayer(OPENTOPOMAP_TILE_URL, {
        attribution: '© OpenTopoMap',
        maxZoom: 17,
        className: 'no-filter'
    });

    const satelliteLayer = L.tileLayer(ESRI_IMAGERY_URL, {
        attribution: '© Esri, DigitalGlobe, Earthstar Geographics',
        maxZoom: 19,
        className: 'no-filter'
    });

    const hybridLayer = L.layerGroup([
        L.tileLayer(ESRI_IMAGERY_URL, {
            attribution: '© Esri',
            maxZoom: 19,
            className: 'no-filter'
        }),
        L.tileLayer(ESRI_TRANSPORT_URL, {
            attribution: '© Esri',
            maxZoom: 19,
            className: 'no-filter'
        }),
        L.tileLayer(ESRI_BOUNDARIES_URL, {
            attribution: '© Esri',
            maxZoom: 19,
            className: 'no-filter'
        })
    ]);

    const baseLayers = {
        'OpenStreetMap': osmLayer,
        'OpenTopoMap': openTopoMapLayer,
        'Satellitenbild': satelliteLayer,
        'Hybrid (Satellit+Straßen)': hybridLayer
    };

    const savedMap = localStorage.getItem('selectedMapLayer');
    
    if (savedMap && baseLayers[savedMap]) {
        baseLayers[savedMap].addTo(leafletMap);
    } else {
        osmLayer.addTo(leafletMap);
    }

    // DWD Warning Zones (WMS)
    const dwdWarningsLayer = L.tileLayer.wms(DWD_WMS_URL, {
        layers: 'dwd:Warnungen_Gemeinden_vereinigt',
        format: 'image/png',
        transparent: true,
        opacity: 0.65,
        attribution: '\u00a9 Deutscher Wetterdienst (DWD)',
        className: 'no-filter dwd-warn-tile',
        zIndex: 150
    });

    // Rain radar overlay group (lazy-populated via loadRadarFrames)
    radarOverlayGroup = L.layerGroup();

    // Richtfunkstrecken: lazy-drawn polylines between linked stations
    const richtfunkLayer = L.layerGroup();

    // ─── Amtliche Geodaten BW & RLP: ein Menüpunkt, Landesdienst nach Ausschnitt ───
    // Beide Länderdienste liegen in einer Smart-Group; _refreshSmartGeoOverlays
    // lädt nur die Dienste, deren Bundesland im aktuellen Kartenausschnitt liegt.
    const geoBounds = {
        bw: L.latLngBounds([47.4, 7.4], [49.8, 10.7]),
        rlp: L.latLngBounds([48.8, 5.9], [51.2, 8.8])
    };
    const bwParcels = L.tileLayer.wms(LGL_BW_ALKIS_WMS, {
        layers: 'nora:ALKIS_Basis_transparent,nora:ALKIS_Basis_Beschriftung_transparent',
        version: '1.3.0', format: 'image/png', transparent: true,
        maxNativeZoom: 20, maxZoom: 22, zIndex: 140,
        attribution: '© LGL BW (dl-de/by-2-0)', className: 'no-filter'
    });
    const rlpParcels = L.tileLayer.wms(RLP_ALKIS_WMS, {
        layers: 'Flurstueck,Lagebezeichnungen', format: 'image/png', transparent: true,
        maxNativeZoom: 20, maxZoom: 22, zIndex: 140,
        attribution: '© GeoBasis-DE / LVermGeoRP (dl-de/by-2-0)', className: 'rlp-alkis-tile'
    });
    const bwShade = L.tileLayer.wms(LGL_BW_SCHUMMERUNG_WMS, {
        layers: 'Schummerung_DGM_025_BW', version: '1.3.0', format: 'image/png',
        transparent: true, opacity: 0.6, maxNativeZoom: 20, maxZoom: 22, zIndex: 120,
        attribution: '© LGL BW (dl-de/by-2-0)', className: 'no-filter'
    });
    const rlpShade = L.tileLayer.wms(RLP_SCHUMMERUNG_WMS, {
        layers: 'rp_shade1m', format: 'image/png',
        transparent: true, opacity: 0.6, maxNativeZoom: 20, maxZoom: 22, zIndex: 120,
        attribution: '© GeoBasis-DE / LVermGeoRP (dl-de/by-2-0)', className: 'no-filter'
    });
    const bwDop = L.tileLayer.wms(LGL_BW_DOP_WMS, {
        layers: 'IMAGES_DOP_20_RGB', version: '1.3.0', format: 'image/jpeg',
        maxNativeZoom: 20, maxZoom: 22, zIndex: 110,
        attribution: '© LGL BW (dl-de/by-2-0)', className: 'no-filter'
    });
    const rlpDop = L.tileLayer.wms(RLP_DOP_WMS, {
        layers: 'rp_dop20', format: 'image/jpeg',
        maxNativeZoom: 20, maxZoom: 22, zIndex: 110,
        attribution: '© GeoBasis-DE / LVermGeoRP (dl-de/by-2-0)', className: 'no-filter'
    });
    function _smartGeoLayer(providers) {
        const group = L.layerGroup();
        group._geoProviders = providers;
        return group;
    }
    const geodataOverlays = {
        'Flurstücke (ALKIS)': _smartGeoLayer({ bw: bwParcels, rlp: rlpParcels }),
        'Schummerung':        _smartGeoLayer({ bw: bwShade, rlp: rlpShade }),
        'Luftbild (DOP20)':   _smartGeoLayer({ bw: bwDop, rlp: rlpDop })
    };
    function _refreshSmartGeoOverlays() {
        const view = leafletMap.getBounds();
        const states = [];
        if (view.intersects(geoBounds.bw)) states.push('bw');
        if (view.intersects(geoBounds.rlp)) states.push('rlp');
        leafletMap._geoStates = states;
        Object.values(geodataOverlays).forEach(function(group) {
            Object.keys(group._geoProviders).forEach(function(state) {
                const layer = group._geoProviders[state];
                const wanted = states.indexOf(state) !== -1;
                if (wanted && !group.hasLayer(layer)) group.addLayer(layer);
                if (!wanted && group.hasLayer(layer)) group.removeLayer(layer);
            });
        });
    }

    const overlayLayers = {
        'DWD Warnzonen':         dwdWarningsLayer,
        [RAINVIEWER_LAYER_NAME]: radarOverlayGroup,
        'Richtfunkstrecken':     richtfunkLayer,
        ...geodataOverlays
    };

    _refreshSmartGeoOverlays();
    restoreActiveOverlayLayers(overlayLayers);
    _buildCustomLayerControl(leafletMap, baseLayers, overlayLayers);

    // Inject MDI icons into zoom buttons; init DiPUL after DOM settles
    requestAnimationFrame(function() {
        [
            { sel: '.leaflet-control-zoom-in',  icon: 'plus'  },
            { sel: '.leaflet-control-zoom-out', icon: 'minus' }
        ].forEach(function(d) {
            const el = document.querySelector(d.sel);
            if (!el) return;
            el.innerHTML = '';
            const i = document.createElement('i');
            i.className = 'mdi mdi-' + d.icon;
            i.style.cssText = 'font-size:18px;line-height:1;pointer-events:none';
            el.appendChild(i);
        });

        // DiPUL Flugzonen: master checkbox + collapsible colored sub-layers
        if (typeof initDipulControl === 'function') {
            initDipulControl(leafletMap);
        }
    });

    leafletMap.on('baselayerchange', function(e) {
        localStorage.setItem('selectedMapLayer', e.name);
    });

    // Overlay state + radar timeline + richtfunk lines
    leafletMap.on('overlayadd', function(e) {
        saveActiveOverlayLayerNames(overlayLayers);
        if (e.name === RAINVIEWER_LAYER_NAME) {
            loadRadarFrames();
            showRadarTimeline();
        }
        if (e.name === 'Richtfunkstrecken') {
            isRichtfunkLayerActive = true;
            drawRichtfunkLines(richtfunkLayer);
            if (typeof getFilteredStandorte === 'function') {
                updateMapMarkers(getFilteredStandorte());
            }
        }
    });
    leafletMap.on('overlayremove', function(e) {
        saveActiveOverlayLayerNames(overlayLayers);
        if (e.name === RAINVIEWER_LAYER_NAME) {
            hideRadarTimeline();
        }
        if (e.name === 'Richtfunkstrecken') {
            isRichtfunkLayerActive = false;
            richtfunkLayer.clearLayers();
            if (typeof getFilteredStandorte === 'function') {
                updateMapMarkers(getFilteredStandorte());
            }
        }
    });

    // Beim Verschieben/Zoomen nur die Dienste des sichtbaren Bundeslands laden.
    leafletMap.on('moveend', _refreshSmartGeoOverlays);

    // Klick-Abfrage aktiver Geodaten-Layer (Flurstück / Luftbild-Datum) via
    // WMS GetFeatureInfo bzw. WFS GetFeature — nicht während Zeichenmodi.
    leafletMap.on('click', function (e) {
        if (typeof overlayEditMode !== 'undefined' && overlayEditMode) return;
        if (typeof snapRouteActive !== 'undefined' && snapRouteActive) return;
        const states = leafletMap._geoStates || [];
        const sources = GEODATA_INFO_SOURCES.filter(function (s) {
            return states.indexOf(s.state) !== -1 && leafletMap.hasLayer(overlayLayers[s.overlay]);
        });
        if (!sources.length) return;
        _runGeodataInfoQuery(e, sources);
    });

}

function updateLeafletMapTheme() {
    // OSM dark mode is handled via CSS inversion on .osm-tiles — no URL swap needed
}

function updateMapMarkers(liste) {
    if (markerClusterGroup) {
        leafletMap.removeLayer(markerClusterGroup);
    }
    if (markerPlainGroup) {
        leafletMap.removeLayer(markerPlainGroup);
    }

    const colors = STATION_PREFIX_COLORS;

    markerClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 40,
        disableClusteringAtZoom: 12,
        iconCreateFunction: function (cluster) {
            const count = cluster.getChildCount();
            const childMarkers = cluster.getAllChildMarkers();

            const prefixCounts = {};
            childMarkers.forEach(m => {
                const prefix = m.options.prefix;
                prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
            });

            const dominantPrefix = Object.keys(prefixCounts).reduce((a, b) =>
                prefixCounts[a] > prefixCounts[b] ? a : b
            );
            const clusterColor = colors[dominantPrefix] || '#3b82f6';

            return L.divIcon({
                html: `<div style="background-color: ${clusterColor}; color: white; font-weight: bold; font-size: 12px; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${count}</div>`,
                className: 'custom-cluster-icon',
                iconSize: [32, 32]
            });
        }
    });
    markerPlainGroup = L.featureGroup();

    window._markersByNummer = new Map();
    const linkedNummern = isRichtfunkLayerActive ? getRichtfunkLinkedStationNummern() : new Set();

    window.updateStationMarkersInteractivity = function(interactive) {
        if (!window._markersByNummer) return;
        window._markersByNummer.forEach(marker => {
            if (!marker || !marker.options) return;
            marker.options.interactive = Boolean(interactive);
            if (marker._icon) marker._icon.style.pointerEvents = interactive ? '' : 'none';
            if (marker._shadow) marker._shadow.style.pointerEvents = interactive ? '' : 'none';
        });
        if (markerClusterGroup && typeof markerClusterGroup.refreshClusters === 'function') {
            try { markerClusterGroup.refreshClusters(); } catch (err) { /* ignore */ }
        }
    };

    liste.forEach(s => {
        if (!s.lat || !s.lon) return;
        const prefix = Math.floor(s.nummer / 1000);
        const markerColor = colors[prefix] || '#3b82f6';
        const isFav = isFavorite(s.nummer);

        const isMainStation = parseInt(s.nummer) % 1000 === 0;

        // Determine if this station is linked in any Richtfunk pair (when the overlay is active)
        const isLinked = isRichtfunkLayerActive ? linkedNummern.has(String(s.nummer)) : true;
        const sizeMultiplier = (isRichtfunkLayerActive && !isLinked) ? 0.6 : 1;

        const baseMarkerSize = isMainStation ? 24 : 14;
        const markerSize = Math.max(6, Math.round(baseMarkerSize * sizeMultiplier));
        const iconSize = isMainStation ? [Math.max(6, Math.round(24 * sizeMultiplier)), Math.max(6, Math.round(24 * sizeMultiplier))] : [Math.max(6, Math.round(14 * sizeMultiplier)), Math.max(6, Math.round(14 * sizeMultiplier))];
        const anchorOffset = Math.max(3, Math.round((isMainStation ? 12 : 7) * sizeMultiplier));
        const starSize = Math.max(8, Math.round((isMainStation ? 28 : 20) * sizeMultiplier));

        // Compute a colored glow that matches the Richtfunk link color when applicable
        let glowHex = markerColor;
        if (isRichtfunkLayerActive && isLinked) {
            glowHex = getRichtfunkPartnerMixedColor(s.nummer);
        }
        const glowRgba = mapHexToRgba(glowHex, 0.45);
        const ringStyle = `box-shadow: 0 0 8px ${glowRgba}, 0 2px 4px rgba(0,0,0,0.25)`;

        const smallMarker = isFav
            ? L.divIcon({
                html: `<div style="width:${starSize}px;height:${starSize}px;display:flex;align-items:center;justify-content:center;color:${markerColor};font-size:${starSize}px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))"><i class="mdi mdi-star" style="font-size:${starSize}px"></i></div>`,
                className: 'custom-small-marker',
                iconSize: [starSize, starSize],
                iconAnchor: [Math.round(starSize / 2), Math.round(starSize / 2)]
            })
            : L.divIcon({
                html: `<div style="width: ${markerSize}px; height: ${markerSize}px; background-color: ${markerColor}; border-radius: 50%; border: 2px solid white; ${ringStyle} box-sizing: border-box;"></div>`,
                className: 'custom-small-marker',
                iconSize: iconSize,
                iconAnchor: [anchorOffset, anchorOffset]
            });

        const marker = L.marker([s.lat, s.lon], { icon: smallMarker, prefix: prefix, interactive: !window.overlayEditMode });
        marker.bindTooltip(`<b>${s.nummer}</b> ${s.name}${isFav ? ' ★' : ''}`, { direction: 'top', offset: [0, -10] });
        marker.on('click', (e) => {
            if (window.overlayEditMode) return;
            if (e.originalEvent.shiftKey) {
                openTagebuch(s.nummer);
            } else if (e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
                openRouteNavigation(s.nummer);
            } else {
                selectFromList(s.nummer);
            }
        });
        if (isRichtfunkLayerActive) {
            const isLinked = linkedNummern.has(String(s.nummer));
            marker.setOpacity(isLinked ? 1 : 0.5);
            markerPlainGroup.addLayer(marker);
        } else {
            markerClusterGroup.addLayer(marker);
        }
        window._markersByNummer.set(String(s.nummer), marker);
    });

    if (isRichtfunkLayerActive) {
        leafletMap.addLayer(markerPlainGroup);
    } else {
        leafletMap.addLayer(markerClusterGroup);
    }

    if (liste.length > 0) {
        if (liste.length === 1) {
            const s = liste[0];
            let bounds = L.latLngBounds([[s.lat, s.lon]]);

            if (typeof getOverlayPayloadForStandort === 'function') {
                const payload = getOverlayPayloadForStandort(s.nummer);
                if (payload && payload.features) {
                    payload.features.forEach(f => {
                        if (f.geometry && f.geometry.coordinates) {
                            if (f.geometry.type === 'Point') {
                                const lat = f.geometry.coordinates[1];
                                const lng = f.geometry.coordinates[0];
                                bounds.extend([lat, lng]);
                                if (f.properties && f.properties.overlayType === 'kreis') {
                                    const radius = f.properties.radius || 100;
                                    const rLat = radius / 111320;
                                    const rLng = radius / (40075 * Math.cos(lat * Math.PI / 180));
                                    bounds.extend([lat + rLat, lng + rLng]);
                                    bounds.extend([lat - rLat, lng - rLng]);
                                }
                            } else if (f.geometry.type === 'LineString') {
                                f.geometry.coordinates.forEach(c => bounds.extend([c[1], c[0]]));
                            } else if (f.geometry.type === 'Polygon' && f.geometry.coordinates[0]) {
                                f.geometry.coordinates[0].forEach(c => bounds.extend([c[1], c[0]]));
                            }
                        }
                    });
                }
            }

            if (bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
                leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: true });
            } else {
                leafletMap.setView([s.lat, s.lon], 17, { animate: true });
            }
        } else {
            leafletMap.invalidateSize({ animate: false });
            const boundsSource = isRichtfunkLayerActive ? markerPlainGroup : markerClusterGroup;
            leafletMap.fitBounds(boundsSource.getBounds(), { padding: [30, 30], maxZoom: 12, animate: true });
        }
    }

    if (typeof onOverlayListOrMapChanged === 'function') {
        onOverlayListOrMapChanged();
    }
}

function focusMapOnStandort(nummer) {
    const standort = standorte.find(s => String(s.nummer) === String(nummer));
    if (!standort || !standort.lat || !standort.lon || !leafletMap) return;

    if (typeof onOverlayTargetStandortChanged === 'function') {
        onOverlayTargetStandortChanged(standort.nummer);
    }

    let bounds = L.latLngBounds([[standort.lat, standort.lon]]);

    // Extend bounds with overlay elements
    if (typeof getOverlayPayloadForStandort === 'function') {
        const payload = getOverlayPayloadForStandort(standort.nummer);
        if (payload && payload.features) {
            payload.features.forEach(f => {
                if (f.geometry && f.geometry.coordinates) {
                    if (f.geometry.type === 'Point') {
                        const lat = f.geometry.coordinates[1];
                        const lng = f.geometry.coordinates[0];
                        bounds.extend([lat, lng]);
                        if (f.properties && f.properties.overlayType === 'kreis') {
                            const radius = f.properties.radius || 100;
                            const rLat = radius / 111320;
                            const rLng = radius / (40075 * Math.cos(lat * Math.PI / 180));
                            bounds.extend([lat + rLat, lng + rLng]);
                            bounds.extend([lat - rLat, lng - rLng]);
                        }
                    } else if (f.geometry.type === 'LineString') {
                        f.geometry.coordinates.forEach(c => bounds.extend([c[1], c[0]]));
                    } else if (f.geometry.type === 'Polygon' && f.geometry.coordinates[0]) {
                        f.geometry.coordinates[0].forEach(c => bounds.extend([c[1], c[0]]));
                    }
                }
            });
        }
    }

    if (bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
        leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: true });
    } else {
        leafletMap.setView([standort.lat, standort.lon], 13, { animate: true });
    }
}
// ─── Rain Radar (RainViewer) ─────────────────────────────────────────────────────────────────

async function loadRadarFrames() {
    radarFrames = [];
    radarLayerCache = {};
    radarCurrentFrameIndex = 0;
    updateRadarTimeline();
    try {
        const res = await fetch(RAINVIEWER_API_URL);
        const data = await res.json();
        radarHost = data.host || RAINVIEWER_TILE_HOST_FALLBACK;
        radarFrames = [...(data.radar?.past || []), ...(data.radar?.nowcast || [])];
        updateRadarTimeline();
        setRadarFrame(radarFrames.length - 1);
    } catch (e) {
        console.error('Regenradar-Daten konnten nicht geladen werden:', e);
    }
}

function getRadarTileLayer(index) {
    if (radarLayerCache[index]) return radarLayerCache[index];
    const frame = radarFrames[index];
    if (!frame) return null;
    const url = `${radarHost}${frame.path}/256/{z}/{x}/{y}/${RAINVIEWER_COLOR_SCHEME}/1_1.png`;
    const layer = L.tileLayer(url, {
        tileSize: 256,
        opacity: 0.72,
        maxNativeZoom: RADAR_MAX_NATIVE_ZOOM,
        maxZoom: 22,
        attribution: '© RainViewer',
        className: 'no-filter',
        zIndex: 200
    });
    radarLayerCache[index] = layer;
    return layer;
}

function setRadarFrame(index) {
    if (!leafletMap || !radarOverlayGroup) return;
    radarCurrentFrameIndex = Math.max(0, Math.min(index, Math.max(0, radarFrames.length - 1)));
    radarOverlayGroup.clearLayers();
    const layer = getRadarTileLayer(radarCurrentFrameIndex);
    if (layer) radarOverlayGroup.addLayer(layer);
    updateRadarTimeLabel();
    const slider = document.getElementById('radarSlider');
    if (slider) slider.value = radarCurrentFrameIndex;
}

function updateRadarTimeline() {
    const slider = document.getElementById('radarSlider');
    if (!slider) return;
    slider.min = 0;
    slider.max = Math.max(0, radarFrames.length - 1);
    slider.value = radarCurrentFrameIndex;
    updateRadarTimeLabel();
}

function updateRadarTimeLabel() {
    const label = document.getElementById('radarTimeLabel');
    if (!label) return;
    const frame = radarFrames[radarCurrentFrameIndex];
    if (!frame) { label.textContent = '--:--'; return; }
    const d = new Date(frame.time * 1000);
    label.textContent = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    label.title = d.toLocaleString('de-DE');
}

function toggleRadarPlay() {
    radarIsPlaying ? stopRadarPlay() : startRadarPlay();
}

function startRadarPlay() {
    if (radarFrames.length === 0) return;
    radarIsPlaying = true;
    const btn = document.getElementById('radarPlayBtn');
    if (btn) btn.innerHTML = '<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    radarPlayTimer = setInterval(() => {
        setRadarFrame((radarCurrentFrameIndex + 1) % radarFrames.length);
    }, 500);
}

function stopRadarPlay() {
    radarIsPlaying = false;
    if (radarPlayTimer) { clearInterval(radarPlayTimer); radarPlayTimer = null; }
    const btn = document.getElementById('radarPlayBtn');
    if (btn) btn.innerHTML = '<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
}

function showRadarTimeline() {
    const el = document.getElementById('radarTimeline');
    if (el) el.classList.remove('hidden');
}

function hideRadarTimeline() {
    stopRadarPlay();
    const el = document.getElementById('radarTimeline');
    if (el) el.classList.add('hidden');
    if (radarOverlayGroup) radarOverlayGroup.clearLayers();
    radarFrames = [];
    radarLayerCache = {};
}

function jumpToLatestRadarFrame() {
    if (!radarFrames || radarFrames.length === 0) return;
    setRadarFrame(radarFrames.length - 1);
}
