/**
 * /api/admin/fahrtanweisungen/:nummer
 *
 * PUT    — overwrite fahrtanweisung, push current value into history (admin)
 * DELETE — remove fahrtanweisung entirely (admin)
 *
 * Admin auth required. KV namespace: STANDORTE_KV
 */

function isAdmin(request, env) {
    const auth = (request.headers.get('Authorization') ?? '').trim();
    if (!auth.startsWith('Bearer ')) return false;
    const token = auth.slice(7).trim();
    return token.length > 0 && token === (env.ADMIN_SECRET ?? '');
}

// ─── PUT ─────────────────────────────────────────────────────────────────────

export async function onRequestPut({ params, env, request }) {
    if (!isAdmin(request, env)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { nummer } = params;
    let body;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const key = `standort:${nummer}`;
    const record = await env.STANDORTE_KV.get(key, { type: 'json' });
    if (!record) return Response.json({ error: 'Standort not found' }, { status: 404 });

    const now = new Date().toISOString();
    const history = record.fahrtanweisungHistory ?? [];

    // Archive current value before overwriting
    if (record.fahrtanweisung) {
        history.unshift({
            text:    record.fahrtanweisung,
            savedAt: record.fahrtanweisungUpdatedAt ?? now,
            savedBy: record.fahrtanweisungUpdatedBy ?? 'unknown',
        });
        if (history.length > 10) history.length = 10;
    }

    record.fahrtanweisung          = typeof body.text === 'string' ? body.text : '';
    record.fahrtanweisungUpdatedAt = now;
    record.fahrtanweisungUpdatedBy = 'admin';
    record.fahrtanweisungHistory   = history;

    await env.STANDORTE_KV.put(key, JSON.stringify(record));
    return Response.json({ ok: true, updatedAt: now });
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function onRequestDelete({ params, env, request }) {
    if (!isAdmin(request, env)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const key = `standort:${params.nummer}`;
    const record = await env.STANDORTE_KV.get(key, { type: 'json' });
    if (!record) return Response.json({ error: 'Standort not found' }, { status: 404 });

    delete record.fahrtanweisung;
    delete record.fahrtanweisungUpdatedAt;
    delete record.fahrtanweisungUpdatedBy;
    delete record.fahrtanweisungHistory;

    await env.STANDORTE_KV.put(key, JSON.stringify(record));
    return Response.json({ ok: true });
}
