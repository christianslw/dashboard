/**
 * /api/fahrtanweisungen/:nummer
 *
 * Fahrtanweisung is stored as a field on the standort record in STANDORTE_KV.
 * No separate KV namespace is required.
 *
 * GET    — returns { text, updatedAt } for the standort (no auth)
 * PUT    — patches fahrtanweisung onto the standort record (no auth — team tool)
 * DELETE — removes fahrtanweisung from the standort record (no auth)
 */

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function onRequestGet({ params, env }) {
    const { nummer } = params;
    const record = await env.STANDORTE_KV.get(`standort:${nummer}`, { type: 'json' });
    if (!record) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(
        { text: record.fahrtanweisung ?? null, updatedAt: record.fahrtanweisungUpdatedAt ?? null },
        { headers: { 'Cache-Control': 'no-store' } }
    );
}

// ─── PUT ─────────────────────────────────────────────────────────────────────

export async function onRequestPut({ params, env, request }) {
    const { nummer } = params;

    const record = await env.STANDORTE_KV.get(`standort:${nummer}`, { type: 'json' });
    if (!record) return Response.json({ error: 'Not found' }, { status: 404 });

    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const now = body.updatedAt ?? new Date().toISOString();
    const history = record.fahrtanweisungHistory ?? [];

    // Archive previous value before overwriting (max 10 entries)
    if (record.fahrtanweisung) {
        history.unshift({
            text:    record.fahrtanweisung,
            savedAt: record.fahrtanweisungUpdatedAt ?? now,
            savedBy: record.fahrtanweisungUpdatedBy ?? 'user',
        });
        if (history.length > 10) history.length = 10;
    }

    record.fahrtanweisung          = typeof body.text === 'string' ? body.text : '';
    record.fahrtanweisungUpdatedAt = now;
    record.fahrtanweisungUpdatedBy = 'user';
    record.fahrtanweisungHistory   = history;

    await env.STANDORTE_KV.put(`standort:${nummer}`, JSON.stringify(record));
    return Response.json({ ok: true, updatedAt: now });
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function onRequestDelete({ params, env }) {
    const { nummer } = params;

    const record = await env.STANDORTE_KV.get(`standort:${nummer}`, { type: 'json' });
    if (!record) return Response.json({ error: 'Not found' }, { status: 404 });

    const { fahrtanweisung, fahrtanweisungUpdatedAt, ...rest } = record;
    await env.STANDORTE_KV.put(`standort:${nummer}`, JSON.stringify(rest));
    return Response.json({ ok: true });
}
