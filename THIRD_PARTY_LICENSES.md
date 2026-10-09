# Third-Party Services & Licenses

> Last reviewed: April 2026  
> ⚠️ = requires action before commercial / internal business use

---

## ⚠️ Critical Issues (must be resolved)

### OSRM — Public Routing API
- **URL:** `https://router.project-osrm.org`
- **Where used:** [js/dashboard.js](js/dashboard.js) — `fetchRealRouteTimeDashboard()`
- **How used:** Called when a location card is opened and the user has a GPS position set. Fetches a driving route between the user and the selected Standort. Returns GeoJSON geometry (drawn as a blue polyline on the map) plus duration and distance. Falls back to a straight-line estimate on error.
- **License / ToS:** The public demo server explicitly bans commercial and production use.
- **Risk:** Every time a user opens a location detail, one API call is made to this server.

### Nominatim — Address Geocoding
- **URL:** `https://nominatim.openstreetmap.org`
- **Where used:** [js/location.js](js/location.js) — `searchLocation()`
- **How used:** When the user types a place name or partial postcode in the location search box (and it doesn't match a Standort number), a geocoding query is sent to Nominatim. Up to 5 results are shown as selectable buttons that save the user's home position.
- **License / ToS:** OSM usage policy explicitly forbids use in commercial products; max 1 request/second and no bulk use.
- **Risk:** Any use of the location search field triggers this API.

### Esri Tile Servers — Satellite & Hybrid Map Layers
- **URL:** `https://server.arcgisonline.com/ArcGIS/rest/services/...`
- **Where used:** [js/map.js](js/map.js) — `initLeafletMap()`
- **How used:** Three Esri tile services are used as map base layers selectable by the user:
  - `World_Imagery` → "Satellitenbild" layer
  - `World_Imagery` + `World_Transportation` + `World_Boundaries_and_Places` → "Hybrid (Satellit+Straßen)" layer group
- **License / ToS:** Esri's public tile servers require an ArcGIS Online subscription for any commercial or internal business application. Unauthenticated use is restricted to development/testing.
- **Risk:** Tiles are fetched whenever a user switches to the satellite or hybrid base layer.

### OpenStreetMap Tile Servers — Base Map
- **URL:** `https://{s}.tile.openstreetmap.org`
- **Where used:** [js/map.js](js/map.js) — `initLeafletMap()` and `getThemeAwareOsmUrl()`; also [js/dashboard.js](js/dashboard.js) — `setupMobileMap()` (mini-map inside the location modal)
- **How used:** Used as the "OpenStreetMap" base layer option on the main map and as the tile source for the small embedded map in the location detail panel.
- **License / ToS:** OSM tile servers are explicitly for light, non-commercial, non-production use. Do not embed in a business tool without a compliant tile provider.
- **Risk:** Default or fallback map layer — used on every page load for most users.

### Windy Embed — Wind Map iFrame
- **URL:** `https://embed.windy.com/embed.html`
- **Where used:** [js/dashboard.js](js/dashboard.js) — `openDashboard()`
- **How used:** An `<iframe>` is injected with coordinates `?lat=…&lon=…&zoom=11&overlay=wind` when the user opens a location's detail panel. Shows a live wind animation centred on the selected Standort.
- **License / ToS:** The free Windy embed is for personal and non-commercial sites only. Commercial or intranet use requires a Windy API Pro license.
- **Risk:** Loaded on every location card open.

### Open-Meteo — Weather & Forecast API
- **URL:** `https://api.open-meteo.com/v1/forecast`
- **Where used:** [js/weather.js](js/weather.js) — `fetchWeather()`
- **How used:** Two separate calls are made per location open: one for current weather conditions (`current_weather=true`) and one for an hourly forecast with wind speed, precipitation probability and weather codes. Results are displayed in the weather widget inside the location detail panel.
- **License / ToS:** Free tier explicitly states "non-commercial use only". Commercial use requires a paid subscription.
- **Risk:** Two API calls on every location detail open.

---

## ⚠️ Verify / Monitor

### RainViewer — Radar Tiles & Nowcast
- **URLs:** `https://api.rainviewer.com/public/weather-maps.json` and `https://tilecache.rainviewer.com`
- **Where used:** [js/map.js](js/map.js) — `loadRadarFrames()` and `getRadarTileLayer()`
- **How used:** On enabling the "Regenradar" overlay, the app fetches a JSON manifest from the RainViewer API listing available past radar frames and nowcast frames. For each frame, tiles are loaded from `tilecache.rainviewer.com`. A timeline scrubber lets users step through past and predicted rain.
- **License / ToS:** Free tier has rate/volume limits. High-traffic use requires a paid plan. The free tier may also prohibit commercial products.
- **Risk:** Each radar frame shown loads a full tile set; scrubbing the timeline makes repeated requests.

### Blitzortung — Lightning Tiles
- **URL:** `https://map.blitzortung.org/L/{z}/{x}/{y}.png`
- **Where used:** [js/map.js](js/map.js) — `initLeafletMap()` — `lightningLayer`
- **How used:** A Leaflet tile overlay named "Blitzortung ⚡" that shows real-time lightning strike positions as tiles. Loaded on demand when the user enables the overlay.
- **License / ToS:** Blitzortung is a community/volunteer project. No formal commercial licensing exists; server availability is not guaranteed.
- **Risk:** Undocumented commercial ToS; could be withdrawn without notice.

### OpenTopoMap — Topographic Map Layer
- **URL:** `https://{s}.tile.opentopomap.org`
- **Where used:** [js/map.js](js/map.js) — `initLeafletMap()` — `openTopoMapLayer`
- **How used:** Selectable base layer "OpenTopoMap" showing terrain contours and elevation. Loaded when the user switches to it.
- **License / ToS:** Data is CC-BY-SA; the tile server is run by volunteers with no commercial use guarantee.
- **Risk:** CC-BY-SA share-alike clause could have implications; server is informal infrastructure.

---

## ✅ No Issues

### Leaflet 1.9.4
- **Where used:** [index.html](index.html) (CDN), used throughout [js/map.js](js/map.js), [js/overlays.js](js/overlays.js), [js/dashboard.js](js/dashboard.js)
- **How used:** Core interactive map library. Renders the main map, handles markers, popups, layer control, zoom controls, and GeoJSON route drawing.
- **License:** BSD-2-Clause ✅

### Leaflet.markercluster 1.4.1
- **Where used:** [index.html](index.html) (CDN), used in [js/map.js](js/map.js)
- **How used:** Groups nearby Standort markers into cluster icons at lower zoom levels to avoid marker overlap.
- **License:** MIT ✅

### Leaflet.draw 1.0.4
- **Where used:** [index.html](index.html) (CDN), used in [js/overlays.js](js/overlays.js)
- **How used:** Provides the drawing toolbar for creating and editing overlay shapes (polygons, polylines, circles) on the map.
- **License:** MIT ✅

### Tailwind CSS (CDN)
- **Where used:** [index.html](index.html), [admin.html](admin.html)
- **How used:** Utility-first CSS framework providing all layout, spacing, color, and responsive styles across the entire UI.
- **License:** MIT ✅
- **Note:** Loaded from `cdn.tailwindcss.com` at runtime — should be bundled for production.

### Material Design Icons (local copy)
- **Where used:** [res/mdi/css/materialdesignicons.min.css](res/mdi/css/materialdesignicons.min.css) + fonts, referenced everywhere
- **How used:** Icon font used for all UI icons (buttons, badges, map controls, weather indicators, etc.).
- **License:** Apache 2.0 ✅ — already self-hosted locally.

### Bright Sky — DWD Weather Alerts
- **URL:** `https://api.brightsky.dev/alerts`
- **Where used:** [js/weather.js](js/weather.js) — `fetchDWD()`
- **How used:** Fetches active DWD weather warnings for the coordinates of a selected Standort. Results are shown as colored alert badges in the location detail panel.
- **License:** MIT open-source project wrapping freely available DWD public data. ✅

### DWD WMS — Warning Zone Overlay
- **URL:** `https://maps.dwd.de/geoserver/dwd/wms`
- **Where used:** [js/map.js](js/map.js) — `initLeafletMap()` — `dwdWarningsLayer`
- **How used:** A WMS tile overlay named "DWD Warnzonen" that colours affected municipalities on the map according to active weather warnings. Loaded on demand.
- **License:** German government open data (GeoNutzV) ✅

### Google Maps / Apple Maps Navigation Links
- **Where used:** [js/app.js](js/app.js) — `getNavLink()`; [js/list.js](js/list.js) — directions button
- **How used:** "Navigate" buttons open `https://www.google.com/maps/dir/?api=1&destination=…` (Android/desktop) or `https://maps.apple.com/?daddr=…` (iOS) in a new tab. This is a plain URL redirect — no API key, no SDK, no embedded content.
- **License:** URL redirect only, no ToS implications ✅

### Cloudflare Pages + Workers KV
- **Where used:** [wrangler.toml](wrangler.toml); [functions/api/](functions/api/) (all backend functions)
- **How used:** Hosts the entire app as a static site on Cloudflare Pages. Serverless Functions (Pages Functions) handle all backend API endpoints (`/api/standorte`, `/api/overlays`, `/api/settings`, `/api/fahrtanweisungen`). Three KV namespaces store persistent data: `STANDORTE_KV`, `OVERLAYS_KV`, `SETTINGS_KV`.
- **License:** Paid service ✅ — verify the project is on a plan that covers the expected request volume.

---

## Suggested Alternatives & Self-Hosting

### OSRM (Routing)

**Problem:** Public demo server, no commercial use.

**Option A — Self-host OSRM**
1. Download OSM data for Germany: `wget https://download.geofabrik.de/europe/germany-latest.osm.pbf`
2. Run OSRM via Docker:
   ```sh
   docker run -t -v $(pwd):/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/germany-latest.osm.pbf
   docker run -t -v $(pwd):/data osrm/osrm-backend osrm-partition /data/germany-latest.osrm
   docker run -t -v $(pwd):/data osrm/osrm-backend osrm-customize /data/germany-latest.osrm
   docker run -p 5000:5000 -v $(pwd):/data osrm/osrm-backend osrm-routed --algorithm mld /data/germany-latest.osrm
   ```
3. Change the URL in [js/dashboard.js](js/dashboard.js) from `https://router.project-osrm.org/...` to `http://your-server:5000/...`

**Option B — GraphHopper Cloud** (paid, easy drop-in) — same REST API shape, very similar URL structure.

**Option C — HERE Routing API** — enterprise-grade, free tier available.

---

### Nominatim (Geocoding)

**Problem:** Public server, no commercial use, rate-limited.

**Option A — Self-host Photon** (recommended for Germany-only use)
- Photon is an open-source geocoder backed by OSM data, specifically designed for fast autocomplete.
- Docker: `docker run -p 2322:2322 krahejn/photon:latest`
- Change the fetch URL in [js/location.js](js/location.js) to `http://your-server:2322/api?q=…&lang=de&limit=5`.
- Photon returns a GeoJSON `FeatureCollection`; the response parsing in `searchLocation()` will need minor adjustment.

**Option B — Geoapify** (paid, hosted) — no self-hosting, generous free tier may cover low-volume internal use; check their commercial ToS.

**Option C — Komoot Photon** (public instance, `photon.komoot.io`) — same caveats as Nominatim regarding commercial use, but a quick drop-in for testing.

---

### OpenStreetMap Tiles (Base Map)

**Problem:** OSM tile servers not for production/commercial use.

**Option A — Self-host with OpenMapTiles + TileServer GL**
- Memory/storage heavy but fully self-contained.
- Requires a Germany/Europe tile extract from [openmaptiles.org](https://openmaptiles.org) (free download).
- Serve with: `docker run -p 8080:80 -v ./tiles:/data maptiler/tileserver-gl`
- Replace tile URLs in [js/map.js](js/map.js) and [js/dashboard.js](js/dashboard.js).

**Option B — Stadia Maps** — OSM-based tiles, explicit commercial use allowed, free tier for low traffic, simple API key, drop-in URL replacement.

**Option C — MapTiler Cloud** — similar to Stadia, also serves raster tiles compatible with all existing Leaflet code.

---

---

### Esri Satellite / Hybrid Tiles

**Problem:** Requires ArcGIS subscription for commercial use.

**Option A — MapTiler Satellite** — commercial license, Leaflet-compatible raster tiles, similar quality.

**Option B — Mapbox Satellite** — well-known, pay-as-you-go pricing.

**Option C — Subscribe to ArcGIS Online** — if Esri integration is preferred; provides authenticated tile access with the same URLs already in the code.

---

### Windy Embed (Wind Map iFrame)

**Problem:** Non-commercial embed only.

**Option A — Buy Windy API Pro** — $0–$X/month depending on usage; swap the iframe `src` to use the authenticated API endpoint. Minimal code changes.

**Option B — Use Open-Meteo wind data + Leaflet Wind Barb or Leaflet-Velocity plugin** — render a wind layer directly on the existing Leaflet map using Open-Meteo's wind grid data (U/V components). Fully free and self-contained, but requires implementing a wind layer renderer.

**Option C — Remove the wind iFrame entirely** — the DWD warnings and Open-Meteo data already cover the weather use case; the Windy embed is supplementary.

---

### Open-Meteo (Weather)

**Problem:** Free tier is non-commercial.

**Option A — Subscribe to Open-Meteo commercial plan** — cheapest path; same API, same code, just add a paid API key. ~€5–30/month depending on call volume.

**Option B — DWD MOSMIX API** — German weather service open data, free for commercial use. Requires parsing a different (XML/KMZ) format. More complex integration but zero cost and same source data.

**Option C — Bright Sky extended** — Bright Sky (already used for alerts, MIT-licensed) also exposes DWD current observations and forecasts; could replace Open-Meteo entirely while staying on the same free, open stack.

---

### RainViewer (Radar)

**Problem:** Free tier limits; potential commercial restriction.

**Option A — DWD WMS Radar** (`maps.dwd.de`) — DWD already exposes radar composite images as a WMS layer (same server already used for warning zones). Free, government open data, no volume limits. No timeline scrubber out of the box, but a static "current radar" overlay is trivial to add alongside the existing `dwdWarningsLayer`.

**Option B — Upgrade to RainViewer paid plan** — easiest path, minimal code change.

---

### Blitzortung (Lightning)

**Problem:** No formal license, volunteer infrastructure.

**Option A — Remove the overlay** — lightning data is already partially indicated by DWD warnings. A dedicated lightning overlay is a nice-to-have, not critical.

**Option B — Subscribe to a commercial lightning data provider** (e.g. Vaisala, DTN/MeteoGroup) — enterprise-level, likely overkill.

**Option C — Keep Blitzortung but add a graceful fallback** — hide the layer toggle if tiles fail to load, to avoid a broken UI if the server goes down.

---

### OpenTopoMap

**Problem:** CC-BY-SA clause; hobbyist tile server.

**Option A — Remove the layer** — topographic detail is rarely needed for the Standort use case; the Esri satellite/hybrid layers already cover terrain visualization.

**Option B — MapTiler Outdoor** — equivalent topographic style, commercially licensed raster tiles.

---

### CDN-Loaded Libraries (Leaflet, Tailwind, etc.)

**Problem:** Runtime CDN dependency; potential privacy/availability risk.

**Recommendation:** Bundle all JS/CSS libraries into the project. Since there is no build step currently:
1. Download Leaflet, markercluster, leaflet-draw CSS/JS and place them under `res/`.
2. Run Tailwind CLI to generate a static CSS file: `npx tailwindcss -i ./styles.css -o ./res/tailwind.css --minify`, then replace the CDN `<script>` with a `<link>` to the generated file.
3. Update `sw.js` cache lists and `_headers` accordingly.

---

## Notes

- **OSM data** (ODbL) is freely usable commercially; only the **OSM-owned tile rendering servers** have the stricter policy.
- Google Maps and Apple Maps links (`google.com/maps/dir`, `maps.apple.com/?daddr`) are plain URL redirects opened in a new tab — no SDK, no embedded iframe, no API key required.
