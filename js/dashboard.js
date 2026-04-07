// ==========================================
// Dashboard & Way Instructions
// ==========================================

let dashMobileMapInstance = null;
let dashMobileTileLayer = null;
let dashMobileMarker = null;
let dashMobileRouteLayer = null;
let dashMobileOverlayGroup = null;

function openDashboard(nummer) {
    const standort = standorte.find(s => String(s.nummer) === String(nummer));
    if (!standort) return;
    currentStandort = standort;

    // Deep link: reflect open site in URL
    history.replaceState(null, '', '?standort=' + encodeURIComponent(standort.nummer));

    if (typeof onOverlayTargetStandortChanged === 'function') {
        onOverlayTargetStandortChanged(standort.nummer);
    }

    focusMapOnStandort(standort.nummer);
    highlightListItem(nummer);

    const modal = document.getElementById("dashboardModal");

    document.getElementById("dashTitleNum").innerText = standort.nummer;
    document.getElementById("dashTitleName").innerText = standort.name;
    updateDashboardFavoriteButton();

    document.getElementById("trafficAlertBox").classList.add("hidden");

    if (standort.distance) {
        document.getElementById("driveTimeValue").innerText = "Prüfe...";
        document.getElementById("driveDistValue").innerText = `${standort.distance.toFixed(1)} km`;
        fetchRealRouteTimeDashboard(userLat, userLon, standort.lat, standort.lon, standort.distance);
    } else {
        document.getElementById("driveTimeValue").innerText = "--";
        document.getElementById("driveDistValue").innerText = "Start fehlt";
    }

    document.getElementById("windyIframe").src = `https://embed.windy.com/embed.html?type=map&location=coordinates&lat=${standort.lat}&lon=${standort.lon}&zoom=11&overlay=wind&marker=true&metricWind=m/s`;

    document.getElementById("btnTagebuch").href = getTagebuchLink(standort);
    const ordnerLink = standort.link.includes("/_standortinfo") ? standort.link.split("/_standortinfo")[0] : standort.link;
    document.getElementById("btnOrdner").href = ordnerLink;

    // Navigation: use Hauptzufahrt waypoint if set in the overlay for this standort
    const hzEntry = getHauptzufahrtEntryPoint(standort.nummer);
    if (hzEntry && navMode !== 'apple') {
        const dest = `${standort.lat},${standort.lon}`;
        const wp   = `${hzEntry.lat},${hzEntry.lon}`;
        document.getElementById("btnRoute").href  = `https://www.google.com/maps/dir/?api=1&destination=${dest}&waypoints=${wp}`;
        document.getElementById("btnRoute").title = 'Navigation via Hauptzufahrt';
    } else {
        document.getElementById("btnRoute").href  = getNavLink(standort.lat, standort.lon);
        document.getElementById("btnRoute").title = '';
    }

    // Update Hauptzufahrt info notice
    const notice = document.getElementById('hauptzufahrtNotice');
    if (notice) {
        if (hzEntry) {
            notice.className = 'col-span-2 text-[11px] px-2 py-1.5 rounded-md flex items-center gap-1.5 justify-center bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50';
            notice.innerHTML = '<i class="mdi mdi-map-check text-sm shrink-0"></i> Hauptzufahrt hinterlegt — Navigation berücksichtigt Zufahrtsweg';
        } else {
            notice.className = 'col-span-2 text-[11px] px-2 py-1.5 rounded-md flex items-center gap-1.5 justify-center bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50';
            notice.innerHTML = '<i class="mdi mdi-map-marker-alert-outline text-sm shrink-0"></i> Keine Hauptzufahrt hinterlegt — Zufahrt vor Ort eigenständig recherchieren';
        }
    }

    fetchWeather(standort.lat, standort.lon);
    updateDWDDetailBox(standort.lat, standort.lon);

    setupMobileMap(standort);

    // Planner button state
    if (typeof updatePlannerButtonForCurrent === 'function') {
        updatePlannerButtonForCurrent();
    }

    modal.classList.remove("hidden");
    modal.classList.add("modal-enter");
    setTimeout(() => modal.classList.add("modal-enter-active"), 10);

    displayWayInstructions();
}

function setupMobileMap(standort) {
    // Initialisierung, falls noch nicht geschehen
    if (!dashMobileMapInstance) {
        dashMobileMapInstance = L.map('dashMobileMap', {
            zoomControl: true,
            attributionControl: false
        });
    }

    // Tile-Layer aktualisieren falls das Theme gewechselt wurde
    // Dark mode appearance is handled via CSS inversion on the osm-tiles class
    if (dashMobileTileLayer) {
        dashMobileMapInstance.removeLayer(dashMobileTileLayer);
    }
    dashMobileTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        className: 'osm-tiles'
    }).addTo(dashMobileMapInstance);

    // Alte Marker & Routen entfernen
    if (dashMobileMarker) {
        dashMobileMapInstance.removeLayer(dashMobileMarker);
    }
    if (dashMobileRouteLayer) {
        dashMobileMapInstance.removeLayer(dashMobileRouteLayer);
        dashMobileRouteLayer = null;
    }

    // Alte Overlays entfernen und neu erstellen
    if (dashMobileOverlayGroup) {
        dashMobileMapInstance.removeLayer(dashMobileOverlayGroup);
    }
    dashMobileOverlayGroup = L.layerGroup().addTo(dashMobileMapInstance);

    // Marker-Farbe basierend auf Standort-Präfix (identisch zu updateMapMarkers)
    const markerColors = {
        1: '#8b5cf6', 2: '#10b981', 3: '#f59e0b', 4: '#ef4444',
        5: '#ec4899', 6: '#06b6d4', 8: '#6366f1', 9: '#eab308'
    };
    const prefix = Math.floor(Number(standort.nummer) / 1000);
    const markerColor = markerColors[prefix] || '#3b82f6';

    const mobileIcon = L.divIcon({
        html: `<div style="width: 16px; height: 16px; background-color: ${markerColor}; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4);"></div>`,
        className: 'custom-mobile-marker',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });

    dashMobileMarker = L.marker([standort.lat, standort.lon], { icon: mobileIcon }).addTo(dashMobileMapInstance);

    // Overlays rendern (Hauptzufahrt, Schranken, etc.)
    if (typeof getOverlayPayloadForStandort === 'function' && typeof createLayerFromFeature === 'function') {
        const payload = getOverlayPayloadForStandort(standort.nummer);
        if (payload && payload.features) {
            payload.features.forEach(feature => {
                const layer = createLayerFromFeature(feature);
                if (layer) dashMobileOverlayGroup.addLayer(layer);
            });
        }
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

    const hasBounds = bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest());

    if (hasBounds) {
        dashMobileMapInstance.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
    } else {
        dashMobileMapInstance.setView([standort.lat, standort.lon], 13);
    }

    // WICHTIG: Behebt Leaflet-Rendering-Fehler in versteckten Modals.
    // Nach invalidateSize die Ansicht erneut setzen, da die Kartengröße
    // beim ersten Aufruf noch unbekannt war (Modal war versteckt).
    setTimeout(() => {
        if (!dashMobileMapInstance) return;
        dashMobileMapInstance.invalidateSize();
        if (hasBounds) {
            dashMobileMapInstance.fitBounds(bounds, { padding: [20, 20], maxZoom: 16, animate: false });
        } else {
            dashMobileMapInstance.setView([standort.lat, standort.lon], 13, { animate: false });
        }
    }, 300);
}

function closeDashboard() {
    if (typeof closeOverlayEditMode === 'function') {
        closeOverlayEditMode();
    }

    // Remove OSRM route polyline
    if (currentRouteLayer && leafletMap) {
        leafletMap.removeLayer(currentRouteLayer);
        currentRouteLayer = null;
    }

    // Clean deep link URL
    history.replaceState(null, '', location.pathname);

    const modal = document.getElementById("dashboardModal");
    modal.classList.remove("modal-enter-active");
    document.getElementById("windyIframe").src = "";
    setTimeout(() => modal.classList.add("hidden"), 200);
}

async function fetchRealRouteTimeDashboard(lat1, lon1, lat2, lon2, fallbackDist) {
    // Remove stale route polyline from a previous site
    if (currentRouteLayer && leafletMap) {
        leafletMap.removeLayer(currentRouteLayer);
        currentRouteLayer = null;
    }
    try {
        const res = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`
        );
        if (!res.ok) throw new Error("API Limit");

        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
            const route         = data.routes[0];
            const durationSec   = route.duration;
            const routeDistMeter = route.distance;

            const mins = Math.round(durationSec / 60);
            document.getElementById("driveTimeValue").innerText = mins < 60 ? `${mins} Min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;

            const avgSpeedKmh = (routeDistMeter / 1000) / (durationSec / 3600);
            if (avgSpeedKmh < 45 && routeDistMeter > 10000) {
                document.getElementById("trafficAlertBox").classList.remove("hidden");
                document.getElementById("trafficAlertText").innerText = "Langsame Routenführung. Möglicherweise Baustellen oder hohes Verkehrsaufkommen.";
            } else if (avgSpeedKmh < 30) {
                document.getElementById("trafficAlertBox").classList.remove("hidden");
                document.getElementById("trafficAlertText").innerText = "Sehr langsame Route. Stadtverkehr oder starker Stau erwartet.";
            }

            // Draw route polyline on main map
            if (leafletMap && route.geometry) {
                currentRouteLayer = L.geoJSON(route.geometry, {
                    style: {
                        color: '#3b82f6',
                        weight: 4,
                        opacity: 0.65,
                        dashArray: '8 4'
                    }
                }).addTo(leafletMap);
            }
        }
    } catch (e) {
        document.getElementById("driveTimeValue").innerText = calcDriveTimeFallback(fallbackDist);
    }
}

function copyCoords() {
    if (!currentStandort) return;
    navigator.clipboard.writeText(`${currentStandort.lat}, ${currentStandort.lon}`);
    const btnText = document.querySelector('button[onclick="copyCoords()"] span');
    const oldText = btnText.innerText;
    btnText.innerText = "Kopiert!";
    setTimeout(() => btnText.innerText = oldText, 2000);
}

// ==========================================
// Way Instructions (Route Notes)
// ==========================================

function getWayInstructions(nummer) {
    const stored = localStorage.getItem(`wayInstructions_${nummer}`);
    return stored ? stored : null;
}

function saveWayInstructionsToStorage(nummer, instructions) {
    if (instructions.trim() === '') {
        localStorage.removeItem(`wayInstructions_${nummer}`);
    } else {
        localStorage.setItem(`wayInstructions_${nummer}`, instructions);
    }
}

function displayWayInstructions() {
    if (!currentStandort) return;
    const instructions = getWayInstructions(currentStandort.nummer);
    const display = document.getElementById('wayInstructionsDisplay');
    if (instructions) {
        display.innerText = instructions;
    } else {
        display.innerText = 'Keine Anweisungen';
    }
}

function editWayInstructions() {
    if (!currentStandort) return;
    document.getElementById('wayModalStationNum').innerText = currentStandort.nummer;
    const storedInstructions = getWayInstructions(currentStandort.nummer) || '';
    document.getElementById('wayInstructionsInput').value = storedInstructions;
    document.getElementById('wayInstructionsModal').classList.remove('hidden');
}

function closeWayInstructionsModal() {
    document.getElementById('wayInstructionsModal').classList.add('hidden');
}

function saveWayInstructions() {
    if (!currentStandort) return;
    const instructions = document.getElementById('wayInstructionsInput').value;
    saveWayInstructionsToStorage(currentStandort.nummer, instructions);
    displayWayInstructions();
    closeWayInstructionsModal();
    // Sync to backend
    if (instructions.trim() === '') {
        window.__cfSync?.deleteFahrtanweisung(currentStandort.nummer);
    } else {
        window.__cfSync?.pushFahrtanweisung(currentStandort.nummer, instructions);
    }
}

function deleteWayInstructions() {
    if (!currentStandort) return;
    if (confirm('Fahrtanweisungen wirklich löschen?')) {
        saveWayInstructionsToStorage(currentStandort.nummer, '');
        displayWayInstructions();
        closeWayInstructionsModal();
        // Sync to backend
        window.__cfSync?.deleteFahrtanweisung(currentStandort.nummer);
    }
}

// ─── HAUPTZUFAHRT helper ──────────────────────────────────────────────────────
// Returns the entry-point coordinate (farthest from the station) of the
// Hauptzufahrt LineString overlay for a standort, or null if none is set.
// The "farthest from station" heuristic works because Hauptzufahrt routes are
// drawn FROM the public road TO the station, so the remote end is the approach
// point a driver should be routed to as an intermediate nav waypoint.

function getHauptzufahrtEntryPoint(nummer) {
    if (typeof getOverlayPayloadForStandort !== 'function') return null;
    const payload = getOverlayPayloadForStandort(nummer);
    if (!payload?.features?.length) return null;

    const hz = payload.features.find(f =>
        f.geometry?.type === 'LineString' &&
        f.properties?.routeType === 'hauptzufahrt'
    );
    if (!hz || !hz.geometry.coordinates?.length) return null;

    const s = standorte.find(st => String(st.nummer) === String(nummer));
    if (!s) {
        // No station data — just use the first coordinate as entry point
        const c = hz.geometry.coordinates[0];
        return { lat: c[1], lon: c[0] };
    }

    // Find the coordinate that is farthest from the station location
    let entry = hz.geometry.coordinates[0];
    let maxDist = 0;
    for (const c of hz.geometry.coordinates) {
        const d = Math.hypot(c[0] - s.lon, c[1] - s.lat);
        if (d > maxDist) { maxDist = d; entry = c; }
    }
    return { lat: entry[1], lon: entry[0] };
}