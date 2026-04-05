/**
 * GET /api/overlays
 * Returns all overlay payloads keyed by standort_nummer.
 * No auth required — readable by all users.
 */
export async function onRequestGet({ env }) {
    try {
        const list = await env.OVERLAYS_KV.list({ prefix: 'overlay:' });
        const result = {};

        await Promise.all(
            list.keys.map(async (k) => {
                const nummer = k.name.slice('overlay:'.length);
                const value = await env.OVERLAYS_KV.get(k.name, { type: 'json' });
                if (value) result[nummer] = value;
            })
        );

        return Response.json(result, {
            headers: { 'Cache-Control': 'no-store' }
        });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
