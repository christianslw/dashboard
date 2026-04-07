// ==========================================
// Start Location Logic
// ==========================================

const GPS_UPDATE_INTERVAL = 5 * 60 * 1000; // every 5 minutes
const GPS_MOVE_THRESHOLD_KM = 0.15;         // only re-filter if moved > 150 m
let gpsIntervalId = null;

function stopGPSWatch() {
    if (gpsIntervalId !== null) {
        clearInterval(gpsIntervalId);
        gpsIntervalId = null;
    }
}

function _doGPSPositionFetch(onSuccess, onError) {
    if (!navigator.geolocation) { if (onError) onError(); return; }
    navigator.geolocation.getCurrentPosition(onSuccess, onError || (() => {}), {
        enableHighAccuracy: false,
        maximumAge: 300000,
        timeout: 15000
    });
}

function _applyNewPosition(lat, lon) {
    const prevLat = userLat, prevLon = userLon;
    userLat = lat;
    userLon = lon;
    localStorage.setItem('userCoords', JSON.stringify({ lat, lon, name: 'Aktueller Standort', gps: true }));
    const label = document.getElementById('userLocLabel');
    if (label) label.innerText = 'Aktueller Standort';
    const movedFar = !prevLat || !prevLon || calcDistance(prevLat, prevLon, lat, lon) > GPS_MOVE_THRESHOLD_KM;
    if (movedFar) {
        filterStandorte();
    } else {
        updateLocationStatus();
    }
}

function resumeGPSWatch() {
    if (!navigator.geolocation || gpsIntervalId !== null) return;
    // immediate first fetch
    _doGPSPositionFetch(
        pos => _applyNewPosition(pos.coords.latitude, pos.coords.longitude),
        stopGPSWatch
    );
    // then every 5 minutes
    gpsIntervalId = setInterval(() => {
        _doGPSPositionFetch(
            pos => _applyNewPosition(pos.coords.latitude, pos.coords.longitude),
            stopGPSWatch
        );
    }, GPS_UPDATE_INTERVAL);
}

function updateLocationStatus(filteredCount = standorte.length) {
    const statusEl = document.getElementById("locationStatus");
    if (!statusEl) return;

    const label = document.getElementById("userLocLabel");
    const startName = label ? label.innerText.trim() : "Standort festlegen";

    if (startName && startName !== "Standort festlegen") {
        statusEl.innerText = `${filteredCount} von ${standorte.length} Standorte | Start: ${startName}`;
    } else {
        statusEl.innerText = `${filteredCount} von ${standorte.length} Standorte | Start: nicht gesetzt`;
    }
}

function loadSavedLocation() {
    const saved = localStorage.getItem('userCoords');
    if (saved) {
        const data = JSON.parse(saved);
        userLat = data.lat;
        userLon = data.lon;
        document.getElementById("userLocLabel").innerText = data.name;
        if (data.gps) {
            resumeGPSWatch();
        }
        filterStandorte();
    } else {
        promptLocation();
        filterStandorte();
    }
}

function promptLocation() {
    document.getElementById('locationModal').classList.remove('hidden');
}

function closeLocationModal() {
    document.getElementById('locationModal').classList.add('hidden');
}

async function searchCity() {
    const query = document.getElementById('cityInput').value.trim();
    if (!query) return;
    const resBox = document.getElementById('citySearchResults');
    resBox.innerHTML = '<p class="text-sm text-slate-500">Sucht...</p>';

    // Station number lookup: purely numeric, max 4 digits
    if (/^\d{1,4}$/.test(query)) {
        const matches = standorte.filter(s => String(s.nummer).startsWith(query));
        if (matches.length > 0) {
            resBox.innerHTML = '';
            matches.slice(0, 6).forEach(s => {
                const label = `Standort ${s.nummer} – ${s.name.replace(/_/g, ' ')}`;
                const btn = document.createElement('button');
                btn.className = "text-left w-full p-2 text-sm border border-slate-200 dark:border-zinc-700 rounded hover:bg-slate-50 dark:hover:bg-zinc-800";
                btn.innerText = label;
                btn.onclick = () => saveLocation(s.lat, s.lon, label);
                resBox.appendChild(btn);
            });
            return;
        }
        // no station found – fall through to Nominatim (e.g. partial PLZ)
    }
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=de&limit=5&format=json&addressdetails=1&accept-language=de`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
        const data = await res.json();
        if (!data || data.length === 0) {
            resBox.innerHTML = '<p class="text-sm text-red-500">Nichts gefunden.</p>';
            return;
        }
        resBox.innerHTML = '';
        data.forEach(r => {
            const a = r.address;
            const city = a.city || a.town || a.village || a.municipality || r.display_name.split(',')[0];
            const state = a.state || '';
            const postcode = a.postcode || '';
            const label = [postcode, city, state].filter(Boolean).join(', ');
            const btn = document.createElement('button');
            btn.className = "text-left w-full p-2 text-sm border border-slate-200 dark:border-zinc-700 rounded hover:bg-slate-50 dark:hover:bg-zinc-800";
            btn.innerText = label;
            btn.onclick = () => saveLocation(parseFloat(r.lat), parseFloat(r.lon), label);
            resBox.appendChild(btn);
        });
    } catch (e) {
        resBox.innerHTML = '<p class="text-sm text-red-500">Netzwerkfehler.</p>';
    }
}

function useAutoGPS() {
    if (!navigator.geolocation) {
        document.getElementById('citySearchResults').innerHTML = '<p class="text-sm text-red-500">GPS nicht verfügbar.</p>';
        return;
    }
    document.getElementById('citySearchResults').innerHTML = '<p class="text-sm text-slate-500">GPS wird ermittelt…</p>';
    stopGPSWatch();
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            _applyNewPosition(pos.coords.latitude, pos.coords.longitude);
            closeLocationModal();
            // start periodic interval after initial fix
            gpsIntervalId = setInterval(() => {
                _doGPSPositionFetch(
                    pos2 => _applyNewPosition(pos2.coords.latitude, pos2.coords.longitude),
                    stopGPSWatch
                );
            }, GPS_UPDATE_INTERVAL);
        },
        () => {
            document.getElementById('citySearchResults').innerHTML = '<p class="text-sm text-red-500">GPS-Zugriff verweigert oder Fehler.</p>';
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
}

function saveLocation(lat, lon, name) {
    stopGPSWatch(); // Stop continuous GPS when a manual city is selected
    userLat = lat;
    userLon = lon;
    localStorage.setItem('userCoords', JSON.stringify({ lat, lon, name, gps: false }));
    document.getElementById("userLocLabel").innerText = name;
    closeLocationModal();
    filterStandorte();
}
