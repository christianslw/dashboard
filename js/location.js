// ==========================================
// Start Location Logic
// ==========================================

let gpsWatchId = null;

function stopGPSWatch() {
    if (gpsWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
}

function resumeGPSWatch() {
    if (!navigator.geolocation || gpsWatchId !== null) return;
    gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            userLat = pos.coords.latitude;
            userLon = pos.coords.longitude;
            localStorage.setItem('userCoords', JSON.stringify({
                lat: userLat, lon: userLon, name: 'Aktueller Standort', gps: true
            }));
            filterStandorte();
        },
        () => { stopGPSWatch(); },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
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
    const query = document.getElementById('cityInput').value;
    if (!query) return;
    const resBox = document.getElementById('citySearchResults');
    resBox.innerHTML = '<p class="text-sm text-slate-500">Sucht...</p>';
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=3&language=de`);
        const data = await res.json();
        if (!data.results || data.results.length === 0) {
            resBox.innerHTML = '<p class="text-sm text-red-500">Nichts gefunden.</p>';
            return;
        }
        resBox.innerHTML = '';
        data.results.forEach(r => {
            const btn = document.createElement('button');
            btn.className = "text-left w-full p-2 text-sm border border-slate-200 dark:border-zinc-700 rounded hover:bg-slate-50 dark:hover:bg-zinc-800";
            btn.innerText = `${r.name} (${r.admin1 || ''})`;
            btn.onclick = () => saveLocation(r.latitude, r.longitude, r.name);
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
    document.getElementById('citySearchResults').innerHTML = '<p class="text-sm text-slate-500">GPS-Tracking wird aktiviert...</p>';
    stopGPSWatch();
    gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            const name = 'Aktueller Standort';
            userLat = lat;
            userLon = lon;
            localStorage.setItem('userCoords', JSON.stringify({ lat, lon, name, gps: true }));
            const label = document.getElementById('userLocLabel');
            if (label) label.innerText = name;
            closeLocationModal();
            filterStandorte();
        },
        () => {
            document.getElementById('citySearchResults').innerHTML = '<p class="text-sm text-red-500">GPS-Zugriff verweigert oder Fehler.</p>';
            stopGPSWatch();
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
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
