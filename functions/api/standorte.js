/**
 * GET /api/standorte — all standort records from KV.
 * Returns [] if empty (frontend falls back to bundled standorte.js).
 */
export async function onRequestGet({ env }) {
    try {
        const indexRaw = await env.STANDORTE_KV.get('standorte:_index', { type: 'json' });

        if (!Array.isArray(indexRaw) || indexRaw.length === 0) {
            // Store not seeded yet — frontend will fall back to standorte.js
            return Response.json([], {
                headers: { 'Cache-Control': 'no-store' }
            });
        }

        const records = await Promise.all(
            indexRaw.map(nr => env.STANDORTE_KV.get(`standort:${nr}`, { type: 'json' }))
        );

        return Response.json(records.filter(Boolean), {
            // Cache 30s at edge, stale-while-revalidate 2 min; admin mutations bypass with no-store.
            headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' }
        });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
