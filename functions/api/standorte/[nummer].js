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

    // Preserve existing fahrtanweisung (not admin-managed via this endpoint)
    const existing = await env.STANDORTE_KV.get(`standort:${nummer}`, { type: 'json' });

    // Determine previous richtfunkverbindungen for diff
    const prevRf = Array.isArray(existing?.richtfunkverbindungen) ? existing.richtfunkverbindungen.map(String) : [];
    const newRf  = Array.isArray(body.richtfunkverbindungen)      ? body.richtfunkverbindungen.map(String).filter(n => n && n !== String(body.nummer)) : [];

    const record = {
        nummer:    String(body.nummer),
        name:      body.name   ?? '',
        lat:       Number(body.lat),
        lon:       Number(body.lon),
        link:      body.link   ?? '',
        // New metadata fields
        ...(body.standortkuerzel  ? { standortkuerzel:  String(body.standortkuerzel)  } : {}),
        ...(body.pvStandortpate   ? { pvStandortpate:   String(body.pvStandortpate)   } : {}),
        ...(body.pvVertretung     ? { pvVertretung:     String(body.pvVertretung)     } : {}),
        ...(body.ifsStandortpate  ? { ifsStandortpate:  String(body.ifsStandortpate)  } : {}),
        ...(body.betreiber        ? { betreiber:        String(body.betreiber)        } : {}),
        ...(body.dfmgId           ? { dfmgId:           String(body.dfmgId)           } : {}),
        ...(newRf.length          ? { richtfunkverbindungen: newRf }                    : {}),
        ...(body.extra            ? { extra: body.extra }                               : {}),
        updatedAt: new Date().toISOString(),
        updatedBy: body.updatedBy ?? 'admin',
    };

    // Preserve fahrtanweisung fields
    if (existing?.fahrtanweisung) {
        record.fahrtanweisung = existing.fahrtanweisung;
        if (existing.fahrtanweisungUpdatedAt) record.fahrtanweisungUpdatedAt = existing.fahrtanweisungUpdatedAt;
        if (existing.fahrtanweisungUpdatedBy) record.fahrtanweisungUpdatedBy = existing.fahrtanweisungUpdatedBy;
        if (existing.fahrtanweisungHistory)   record.fahrtanweisungHistory   = existing.fahrtanweisungHistory;
    }

    await env.STANDORTE_KV.put(`standort:${nummer}`, JSON.stringify(record));
    await rebuildIndex(env);

    // ─── Bidirectional Richtfunkverbindungen sync ─────────────────────────────
    // Stations added in newRf: add `nummer` to their richtfunkverbindungen
    // Stations removed (in prevRf but not newRf): remove `nummer` from theirs
    const thisNummer = String(body.nummer);
    const added   = newRf.filter(n  => !prevRf.includes(n));
    const removed = prevRf.filter(n => !newRf.includes(n));

    for (const linkedNummer of [...added, ...removed]) {
        const linkedRecord = await env.STANDORTE_KV.get(`standort:${linkedNummer}`, { type: 'json' });
        if (!linkedRecord) continue;
        let linkedRf = Array.isArray(linkedRecord.richtfunkverbindungen)
            ? linkedRecord.richtfunkverbindungen.map(String)
            : [];
        if (added.includes(linkedNummer) && !linkedRf.includes(thisNummer)) {
            linkedRf.push(thisNummer);
        } else if (removed.includes(linkedNummer)) {
            linkedRf = linkedRf.filter(n => n !== thisNummer);
        }
        linkedRecord.richtfunkverbindungen = linkedRf;
        linkedRecord.updatedAt = new Date().toISOString();
        await env.STANDORTE_KV.put(`standort:${linkedNummer}`, JSON.stringify(linkedRecord));
    }

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
