/**
 * /api/overlays/:nummer
 * GET — overlay payload for one standort; GET /api/overlays/version — global version timestamp
 * PUT — save/replace overlay payload (no auth — team tool)
 */

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function onRequestGet({ params, env }) {
    const { nummer } = params;

    // Version probe — cheap polling endpoint
    if (nummer === 'version') {
        const v = await env.OVERLAYS_KV.get('overlays:_version', { type: 'json' });
        return Response.json(v ?? { updatedAt: null }, {
            headers: { 'Cache-Control': 'no-store' }
        });
    }

    const key   = `overlay:${nummer}`;
    const value = await env.OVERLAYS_KV.get(key, { type: 'json' });

    return Response.json(
        value ?? { features: [], updatedAt: null, updatedBy: null },
        { headers: { 'Cache-Control': 'no-store' } }
    );
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function onRequestPut({ params, env, request }) {
    const { nummer } = params;

    if (nummer === 'version') {
        return Response.json({ error: 'Not allowed' }, { status: 405 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const payload = {
        features:  Array.isArray(body.features) ? body.features : [],
        updatedAt: body.updatedAt ?? now,
        updatedBy: body.updatedBy ?? 'gui',
    };

    const key = `overlay:${nummer}`;
    await env.OVERLAYS_KV.put(key, JSON.stringify(payload));

    // Update global version so polling clients know something changed
    await env.OVERLAYS_KV.put(
        'overlays:_version',
        JSON.stringify({ updatedAt: payload.updatedAt, nummer })
    );

    return Response.json({ ok: true, updatedAt: payload.updatedAt });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function onRequestDelete({ params, env }) {
    const { nummer } = params;

    if (nummer === 'version') {
        return Response.json({ error: 'Not allowed' }, { status: 405 });
    }

    await env.OVERLAYS_KV.delete(`overlay:${nummer}`);

    // Bump version so clients re-sync
    await env.OVERLAYS_KV.put(
        'overlays:_version',
        JSON.stringify({ updatedAt: new Date().toISOString(), nummer })
    );

    return Response.json({ ok: true });
}
