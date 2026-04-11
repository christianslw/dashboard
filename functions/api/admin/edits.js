/**
 * GET /api/admin/edits
 * Returns a unified list of recent edits across standorte and overlays,
 * ordered newest-first.  Requires admin Bearer token.
 */

function isAdmin(request, env) {
    const auth = (request.headers.get('Authorization') ?? '').trim();
    if (!auth.startsWith('Bearer ')) return false;
    const token = auth.slice(7).trim();
    return token.length > 0 && token === (env.ADMIN_SECRET ?? '');
}

export async function onRequestGet({ env, request }) {
    if (!isAdmin(request, env)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const edits = [];

    // ── Standorte ────────────────────────────────────────────────────────────
    const standorteList = await env.STANDORTE_KV.list({ prefix: 'standort:' });
    for (const key of standorteList.keys) {
        const record = await env.STANDORTE_KV.get(key.name, { type: 'json' });
        if (!record) continue;

        if (record.updatedAt) {
            edits.push({
                nummer:    record.nummer ?? key.name.slice('standort:'.length),
                name:      record.name ?? '',
                dataType:  'Standort',
                updatedAt: record.updatedAt,
                updatedBy: record.updatedBy ?? '—',
            });
        }

        // Latest Fahrtanweisung edit (if present)
        if (record.fahrtanweisungUpdatedAt) {
            edits.push({
                nummer:    record.nummer ?? key.name.slice('standort:'.length),
                name:      record.name ?? '',
                dataType:  'Fahrtanweisung',
                updatedAt: record.fahrtanweisungUpdatedAt,
                updatedBy: record.fahrtanweisungUpdatedBy ?? '—',
            });
        }
    }

    // ── Overlays ─────────────────────────────────────────────────────────────
    const overlayList = await env.OVERLAYS_KV.list({ prefix: 'overlay:' });
    for (const key of overlayList.keys) {
        if (key.name === 'overlays:_version') continue;
        const payload = await env.OVERLAYS_KV.get(key.name, { type: 'json' });
        if (!payload?.updatedAt) continue;
        const nummer = key.name.slice('overlay:'.length);
        // Try to resolve name from standorte (may not be loaded here — skip gracefully)
        edits.push({
            nummer,
            name:      '',   // frontend enriches from standorte array
            dataType:  'Overlay',
            updatedAt: payload.updatedAt,
            updatedBy: payload.updatedBy ?? '—',
        });
    }

    // Sort newest first
    edits.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return Response.json(edits, { headers: { 'Cache-Control': 'no-store' } });
}
