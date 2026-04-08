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
