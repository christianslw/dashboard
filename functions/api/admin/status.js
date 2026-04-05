/**
 * GET /api/admin/status
 * Lightweight endpoint used by the admin panel to verify the token.
 * Returns 200 + basic stats when authenticated, 401 when not.
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

    // Return lightweight stats
    const [standorteIndex, overlayList] = await Promise.all([
        env.STANDORTE_KV.get('standorte:_index', { type: 'json' }).catch(() => null),
        env.OVERLAYS_KV.list({ prefix: 'overlay:' }).catch(() => ({ keys: [] })),
    ]);

    return Response.json({
        ok: true,
        standorteCount: Array.isArray(standorteIndex) ? standorteIndex.length : 0,
        overlaysCount:  overlayList.keys?.length ?? 0,
    });
}
