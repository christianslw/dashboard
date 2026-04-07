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
