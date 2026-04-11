// ─── Utility Functions ────────────────────────────────────────────────────────────────

function calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function calcDriveTimeFallback(distanceKm) {
    const timeInMinutes = Math.round((distanceKm * 1.3 / 65) * 60);
    return timeInMinutes < 60
        ? `~${timeInMinutes} Min`
        : `~${Math.floor(timeInMinutes / 60)}h ${timeInMinutes % 60}m`;
}

function hexToRgba(hexColor, alpha) {
    if (typeof hexColor !== 'string') return `rgba(234,179,8,${alpha})`;
    let hex = hexColor.trim().replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length !== 6) return `rgba(234,179,8,${alpha})`;

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function extendBoundsWithOverlayFeatures(bounds, payload) {
    if (!bounds || !payload || !Array.isArray(payload.features)) return;

    payload.features.forEach(feature => {
        const geometry = feature?.geometry;
        const coordinates = geometry?.coordinates;
        if (!geometry || !coordinates) return;

        if (geometry.type === 'Point') {
            const lat = coordinates[1];
            const lng = coordinates[0];
            bounds.extend([lat, lng]);

            if (feature?.properties?.overlayType === 'kreis') {
                const radius = feature.properties.radius || 100;
                const rLat = radius / 111320;
                const rLng = radius / (40075 * Math.cos(lat * Math.PI / 180));
                bounds.extend([lat + rLat, lng + rLng]);
                bounds.extend([lat - rLat, lng - rLng]);
            }
            return;
        }

        if (geometry.type === 'LineString') {
            coordinates.forEach(c => bounds.extend([c[1], c[0]]));
            return;
        }

        if (geometry.type === 'Polygon' && coordinates[0]) {
            coordinates[0].forEach(c => bounds.extend([c[1], c[0]]));
        }
    });
}

// ─── Toast notification ───────────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
    let el = document.getElementById('_toast');
    if (!el) {
        el = document.createElement('div');
        el.id = '_toast';
        el.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] pointer-events-none px-4 py-2 rounded-full bg-slate-800 dark:bg-zinc-700 text-white text-sm font-medium shadow-lg opacity-0 transition-opacity duration-200 whitespace-nowrap';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, duration);
}
