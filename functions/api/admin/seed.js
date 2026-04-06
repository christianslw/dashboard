/**
 * POST /api/admin/seed
 *
 * Bulk-seeds the STANDORTE_KV store from a JSON array of standort objects.
 * Used once (or whenever standorte.js is updated) to migrate the static JS
 * data into the backend so it can be managed through the admin panel.
 *
 * Body: { standorte: [ { nummer, name, lat, lon, link, zufahrt, ... }, ... ] }
 * Auth: Bearer <ADMIN_SECRET>
 *
 * Existing records are OVERWRITTEN. Records not in the payload are deleted
 * only when the optional `replace` flag is set to true.
 */

function isAdmin(request, env) {
    const auth = (request.headers.get('Authorization') ?? '').trim();
    if (!auth.startsWith('Bearer ')) return false;
    const token = auth.slice(7).trim();
    return token.length > 0 && token === (env.ADMIN_SECRET ?? '');
}

export async function onRequestPost({ env, request }) {
    if (!isAdmin(request, env)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const records = body.standorte;
    if (!Array.isArray(records) || records.length === 0) {
        return Response.json({ error: '`standorte` array required' }, { status: 400 });
    }

    const replace = body.replace === true; // if true, purge entries absent from payload

    // ── Purge absent entries when replace mode is active ──────────────────────
    if (replace) {
        const existingList = await env.STANDORTE_KV.list({ prefix: 'standort:' });
        const incomingKeys = new Set(records.map(r => `standort:${r.nummer}`));
        await Promise.all(
            existingList.keys
                .filter(k => !incomingKeys.has(k.name))
                .map(k => env.STANDORTE_KV.delete(k.name))
        );
    }

    // ── Write all records ─────────────────────────────────────────────────────
    const numbers = [];
    const now = new Date().toISOString();

    // CF KV has no batch put API — chunk into parallel writes to stay within limits
    const CHUNK = 50;
    for (let i = 0; i < records.length; i += CHUNK) {
        await Promise.all(
            records.slice(i, i + CHUNK).map(async r => {
                const nummer = String(r.nummer);
                numbers.push(nummer);
                // Read existing record to preserve user-added fahrtanweisung
                const existing = await env.STANDORTE_KV.get(`standort:${nummer}`, { type: 'json' });
                const record = {
                    nummer,
                    name:    r.name    ?? '',
                    lat:     Number(r.lat),
                    lon:     Number(r.lon),
                    link:    r.link    ?? '',
                    updatedAt: now,
                };
                if (existing?.fahrtanweisung) {
                    record.fahrtanweisung = existing.fahrtanweisung;
                    if (existing.fahrtanweisungUpdatedAt) record.fahrtanweisungUpdatedAt = existing.fahrtanweisungUpdatedAt;
                }
                return env.STANDORTE_KV.put(`standort:${nummer}`, JSON.stringify(record));
            })
        );
    }

    // ── Rebuild index ─────────────────────────────────────────────────────────
    const indexList = await env.STANDORTE_KV.list({ prefix: 'standort:' });
    const allNumbers = indexList.keys.map(k => k.name.slice('standort:'.length));
    await env.STANDORTE_KV.put('standorte:_index', JSON.stringify(allNumbers));

    return Response.json({
        ok: true,
        seeded: records.length,
        total: allNumbers.length,
    });
}
