# Performance Backlog

Steps 1 & 2 are already implemented:
- **Step 1** — Boot fetches parallelised (`js/init.js`): settings, fahrtanweisungen, and standorte now load in a single `Promise.all`, removing ~2 extra round-trips from startup.
- **Step 2** — Cloudflare edge caching added to `GET /api/standorte` and `GET /api/fahrtanweisungen` (`Cache-Control: public, s-maxage=30, stale-while-revalidate=120`). Repeat loads are served from the CDN edge instead of hitting KV every time.

The following steps remain.

---

## Step 3 — Eliminate fahrtanweisungen full-table scan

**Problem:** `GET /api/fahrtanweisungen` reads every standort record to find the
few that have a `fahrtanweisung` field set. With 200 standorte this is 200 KV reads
to return ~10 entries.

**Fix:**
- Add a `fahrtanweisungen:_index` KV key (array of Nummern that have a Fahrtanweisung).
- Update `functions/api/admin/fahrtanweisungen/[nummer].js` PUT handler to add the
  nummer to the index, and DELETE handler to remove it.
- Rewrite `functions/api/fahrtanweisungen.js` to read the index key first, then only
  fetch the matching standort records.
- One-time migration: run a seed script or admin endpoint to populate the index from
  all existing records.

---

## Step 4 — Fix `rebuildIndex` in standorte admin

**File:** `functions/api/standorte/[nummer].js`

**Problem:** Every admin PUT or DELETE calls `rebuildIndex()` which does a full
`STANDORTE_KV.list()` scan to rebuild the standorte index. `list()` also silently
truncates at 1000 keys.

**Fix:** Instead of `list()`, read the existing `standorte:_index` array, add or
remove the relevant nummer, and write it back. No full scan needed.

---

## Step 5 — Targeted overlay refresh on version change

**File:** `js/sync.js` (`_checkOverlayVersion` / `_refreshOverlays`)

**Problem:** When any single standort's overlay changes, `_refreshOverlays()` fetches
the entire `/api/overlays` endpoint — N KV reads server-side.

The `/api/overlays/version` response already includes the changed `nummer`. The client
ignores it and refetches everything.

**Fix:**
- Pass the changed `nummer` from the version response to `_refreshOverlays(nummer)`.
- Fetch only `/api/overlays/{nummer}` and merge the result into the local overlay map.
- Only fall back to a full refresh when `nummer` is absent (first load / bulk change).

---

## Step 6 — Replace Tailwind Play CDN with pre-built CSS

**File:** `index.html` (line 7)

**Problem:** The Tailwind Play CDN runs ~100 KB of JavaScript at runtime to generate
all CSS. This is appropriate for prototyping only.

**Fix:**
1. Install Tailwind CLI: `npm install -D tailwindcss`
2. Create `tailwind.config.js` with `content: ["./**/*.{html,js}"]`
3. Run `npx tailwindcss -i styles.css -o dist/tailwind.css --minify`
4. Replace the Play CDN `<script>` tag with `<link rel="stylesheet" href="dist/tailwind.css">`
5. Add the build step to a `package.json` script or Wrangler pre-deploy hook.

---

## Step 7 — Add `defer` to local script tags

**File:** `index.html` (lines ~596–609)

**Problem:** All 14 local `<script src="...">` tags block HTML parsing while each
script downloads and executes sequentially.

**Fix:** Add `defer` to every local script tag. Scripts with `defer` download in
parallel and execute in order after the HTML is fully parsed.

Note: ensure no script relies on `document.write()` (none do currently).

---

## Step 8 — Replace settings polling with storage event

**File:** `js/sync.js` (around the `setInterval` for `_settingsHash`)

**Problem:** `JSON.stringify` of all settings is called every 2 seconds via
`setInterval` to detect localStorage changes.

**Fix:** Replace with `window.addEventListener('storage', handler)` which fires
immediately and only when localStorage actually changes. Remove the `setInterval`.

Note: the `storage` event only fires in *other* tabs/windows. For same-tab changes,
dispatch a custom event wherever settings are mutated and listen for that here too.

---

## Step 9 — Add `list_complete` cursor guards to all KV `list()` calls

**Files:**
- `functions/api/standorte.js`
- `functions/api/overlays.js`
- `functions/api/admin/fahrtanweisungen.js`

**Problem:** Cloudflare KV `list()` returns at most 1000 keys per call and sets
`list_complete: false` when more exist. None of the current calls check this flag,
so results are silently truncated if standorte exceed 1000.

**Fix:** After each `list()` call, loop with `list({ prefix, cursor: result.cursor })`
while `!result.list_complete`.
