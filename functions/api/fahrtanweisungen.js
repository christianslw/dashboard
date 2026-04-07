/**
 * GET /api/fahrtanweisungen — all Fahrtanweisungen as { [nummer]: { text, updatedAt } }.
 * Reads from STANDORTE_KV; returns only entries with a fahrtanweisung field.
 */

export async function onRequestGet({ env }) {
    const rawIndex = await env.STANDORTE_KV.get('standorte:_index', { type: 'json' });
    const index = Array.isArray(rawIndex) ? rawIndex : [];

    if (index.length === 0) {
        return Response.json({}, { headers: { 'Cache-Control': 'no-store' } });
    }

    const entries = await Promise.all(
        index.map(async (nummer) => {
            const record = await env.STANDORTE_KV.get(`standort:${nummer}`, { type: 'json' });
            if (!record?.fahrtanweisung) return null;
            return [nummer, { text: record.fahrtanweisung, updatedAt: record.fahrtanweisungUpdatedAt ?? null }];
        })
    );

    const result = Object.fromEntries(entries.filter(Boolean));
    return Response.json(result, {
        // Cache 30s at edge, stale-while-revalidate 2 min
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' }
    });
}
