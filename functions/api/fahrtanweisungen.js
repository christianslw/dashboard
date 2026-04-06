/**
 * GET /api/fahrtanweisungen
 *
 * Returns all Fahrtanweisungen as { [nummer]: { text, updatedAt } }.
 * Reads standort records from STANDORTE_KV and returns only those
 * that have a fahrtanweisung field set.
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
        // Cache at Cloudflare edge for 30 s; serve stale for up to 2 min while revalidating.
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' }
    });
}
