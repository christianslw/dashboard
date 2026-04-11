/**
 * /api/standorte/:nummer
 * GET — fetch one standort (no auth) | PUT / DELETE — admin only
 */

function isAdmin(request, env) {
    const auth = (request.headers.get('Authorization') ?? '').trim();
    if (!auth.startsWith('Bearer ')) return false;
    const token = auth.slice(7).trim();
    return token.length > 0 && token === (env.ADMIN_SECRET ?? '');
}

async function rebuildIndex(env) {
    // Rebuild standorte:_index from all standort: keys
    const list = await env.STANDORTE_KV.list({ prefix: 'standort:' });
    const numbers = list.keys.map(k => k.name.slice('standort:'.length));
    await env.STANDORTE_KV.put('standorte:_index', JSON.stringify(numbers));
    return numbers;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function onRequestGet({ params, env }) {
    const { nummer } = params;
    const value = await env.STANDORTE_KV.get(`standort:${nummer}`, { type: 'json' });

    if (!value) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json(value, { headers: { 'Cache-Control': 'no-store' } });
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function onRequestPut({ params, env, request }) {
    if (!isAdmin(request, env)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { nummer } = params;

    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Validate required fields
    if (!body.nummer || body.lat === undefined || body.lon === undefined) {
        return Response.json({ error: 'Missing required fields: nummer, lat, lon' }, { status: 400 });
    }

        // Preserve existing fahrtanweisung (not admin-managed)
    const existing = await env.STANDORTE_KV.get(`standort:${nummer}`, { type: 'json' });

    // Normalise richtfunk to deduplicated array of strings, excluding self
    const newRichtfunk = Array.isArray(body.richtfunk)
        ? [...new Set(body.richtfunk.map(id => String(id)).filter(id => id && id !== String(nummer)))]
        : [];

    const record = {
        nummer: String(body.nummer),
        name:    body.name   ?? '',
        lat:     Number(body.lat),
        lon:     Number(body.lon),
        link:    body.link   ?? '',
        ...(body.extra ? { extra: body.extra } : {}),
        // ── Extended station metadata ─────────────────────────────────────
        richtfunk:          newRichtfunk,
        standortkuerzel:    String(body.standortkuerzel ?? '').trim().slice(0, 3),
        pv_pate:            String(body.pv_pate          ?? '').trim(),
        pv_vertretung:      String(body.pv_vertretung    ?? '').trim(),
        ifs_pate:           String(body.ifs_pate         ?? '').trim(),
        betreiber_standort: String(body.betreiber_standort ?? 'SWR').trim(),
        betreiber_sender:   String(body.betreiber_sender   ?? 'SWR').trim(),
        dfmg_id:            String(body.dfmg_id           ?? '').trim(),
        // ─────────────────────────────────────────────────────────────────
        updatedAt: new Date().toISOString(),
    };

    if (existing?.fahrtanweisung) {
        record.fahrtanweisung = existing.fahrtanweisung;
        if (existing.fahrtanweisungUpdatedAt) record.fahrtanweisungUpdatedAt = existing.fahrtanweisungUpdatedAt;
    }

    await env.STANDORTE_KV.put(`standort:${nummer}`, JSON.stringify(record));
    await rebuildIndex(env);

    // ── Bidirectional Richtfunk sync ──────────────────────────────────────
    // Determine which peers were added or removed compared to the old state.
    const oldRichtfunk = Array.isArray(existing?.richtfunk)
        ? existing.richtfunk.map(String)
        : [];
    const thisNummer = String(nummer);

    const added   = newRichtfunk.filter(id => !oldRichtfunk.includes(id));
    const removed = oldRichtfunk.filter(id => !newRichtfunk.includes(id));

    // Add back-link: thisnummer → peer
    for (const peerId of added) {
        const peer = await env.STANDORTE_KV.get(`standort:${peerId}`, { type: 'json' });
        if (!peer) continue;
        const peerRf = Array.isArray(peer.richtfunk) ? peer.richtfunk.map(String) : [];
        if (!peerRf.includes(thisNummer)) {
            peer.richtfunk = [...peerRf, thisNummer];
            peer.updatedAt = new Date().toISOString();
            await env.STANDORTE_KV.put(`standort:${peerId}`, JSON.stringify(peer));
        }
    }

    // Remove back-link: thisNummer is no longer in peer's richtfunk
    for (const peerId of removed) {
        const peer = await env.STANDORTE_KV.get(`standort:${peerId}`, { type: 'json' });
        if (!peer) continue;
        const peerRf = Array.isArray(peer.richtfunk) ? peer.richtfunk.map(String) : [];
        if (peerRf.includes(thisNummer)) {
            peer.richtfunk = peerRf.filter(id => id !== thisNummer);
            peer.updatedAt = new Date().toISOString();
            await env.STANDORTE_KV.put(`standort:${peerId}`, JSON.stringify(peer));
        }
    }
    // ─────────────────────────────────────────────────────────────────────

    return Response.json({ ok: true, record });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function onRequestDelete({ params, env, request }) {
    if (!isAdmin(request, env)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { nummer } = params;
    await env.STANDORTE_KV.delete(`standort:${nummer}`);
    await rebuildIndex(env);

    return Response.json({ ok: true });
}

// ─── PATCH ──────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/standorte/:nummer — unauthenticated soft-field update (team tool).
 * Only allows editing metadata fields; structural fields (lat, lon, link, nummer)
 * remain protected and require the authenticated PUT.
 * Bidirectional richtfunk sync is applied the same as PUT.
 */
export async function onRequestPatch({ params, env, request }) {
    const { nummer } = params;

    const existing = await env.STANDORTE_KV.get(`standort:${nummer}`, { type: 'json' });
    if (!existing) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Capture old richtfunk before mutating for sync diff
    const oldRichtfunk = Array.isArray(existing.richtfunk) ? existing.richtfunk.map(String) : [];

    // Apply only allowed soft fields
    if ('name'               in body) existing.name               = String(body.name               ?? '').trim();
    if ('standortkuerzel'    in body) existing.standortkuerzel    = String(body.standortkuerzel    ?? '').trim().slice(0, 3);
    if ('pv_pate'            in body) existing.pv_pate            = String(body.pv_pate            ?? '').trim();
    if ('pv_vertretung'      in body) existing.pv_vertretung      = String(body.pv_vertretung      ?? '').trim();
    if ('ifs_pate'           in body) existing.ifs_pate           = String(body.ifs_pate           ?? '').trim();
    if ('betreiber_standort' in body) existing.betreiber_standort = String(body.betreiber_standort ?? 'SWR').trim();
    if ('betreiber_sender'   in body) existing.betreiber_sender   = String(body.betreiber_sender   ?? 'SWR').trim();
    if ('dfmg_id'            in body) existing.dfmg_id            = String(body.dfmg_id            ?? '').trim();
    if ('richtfunk' in body) {
        existing.richtfunk = Array.isArray(body.richtfunk)
            ? [...new Set(body.richtfunk.map(id => String(id)).filter(id => id && id !== String(nummer)))]
            : [];
    }

    const now = new Date().toISOString();
    existing.updatedAt     = now;
    existing.lastUserEditAt = now;

    await env.STANDORTE_KV.put(`standort:${nummer}`, JSON.stringify(existing));

    // ── Bidirectional Richtfunk sync (mirrors PUT logic) ───────────────────────
    if ('richtfunk' in body) {
        const newRichtfunk = existing.richtfunk;
        const thisNummer   = String(nummer);
        const added   = newRichtfunk.filter(id => !oldRichtfunk.includes(id));
        const removed = oldRichtfunk.filter(id => !newRichtfunk.includes(id));

        for (const peerId of added) {
            const peer = await env.STANDORTE_KV.get(`standort:${peerId}`, { type: 'json' });
            if (!peer) continue;
            const peerRf = Array.isArray(peer.richtfunk) ? peer.richtfunk.map(String) : [];
            if (!peerRf.includes(thisNummer)) {
                peer.richtfunk = [...peerRf, thisNummer];
                peer.updatedAt = now;
                await env.STANDORTE_KV.put(`standort:${peerId}`, JSON.stringify(peer));
            }
        }

        for (const peerId of removed) {
            const peer = await env.STANDORTE_KV.get(`standort:${peerId}`, { type: 'json' });
            if (!peer) continue;
            const peerRf = Array.isArray(peer.richtfunk) ? peer.richtfunk.map(String) : [];
            if (peerRf.includes(thisNummer)) {
                peer.richtfunk = peerRf.filter(id => id !== thisNummer);
                peer.updatedAt = now;
                await env.STANDORTE_KV.put(`standort:${peerId}`, JSON.stringify(peer));
            }
        }
    }
    // ───────────────────────────────────────────────────────────────────────────

    return Response.json({ ok: true, record: existing });
}
