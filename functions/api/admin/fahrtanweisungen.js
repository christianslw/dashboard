/**
 * GET /api/admin/fahrtanweisungen — all standorte with a fahrtanweisung, with full history.
 * Admin auth required. KV namespace: STANDORTE_KV
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

    const list = await env.STANDORTE_KV.list({ prefix: 'standort:' });

    const results = await Promise.all(
        list.keys.map(async ({ name }) => {
            const record = await env.STANDORTE_KV.get(name, { type: 'json' });
            if (!record?.fahrtanweisung) return null;
            return {
                nummer:                  record.nummer ?? name.replace('standort:', ''),
                name:                    record.name ?? '',
                fahrtanweisung:          record.fahrtanweisung,
                fahrtanweisungUpdatedAt: record.fahrtanweisungUpdatedAt ?? null,
                fahrtanweisungUpdatedBy: record.fahrtanweisungUpdatedBy ?? null,
                fahrtanweisungHistory:   record.fahrtanweisungHistory   ?? [],
            };
        })
    );

    return Response.json(
        results.filter(Boolean).sort((a, b) => String(a.nummer).localeCompare(String(b.nummer))),
        { headers: { 'Cache-Control': 'no-store' } }
    );
}
