/**
 * GET /api/standorte
 * Returns all standort records from KV.
 * If the KV store is empty the response is an empty array — the frontend
 * falls back to the bundled standorte.js in that case.
 * No auth required.
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
            headers: { 'Cache-Control': 'no-store' }
        });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
