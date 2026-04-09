/**
 * GET /api/config
 * Returns public-safe client configuration values (e.g. tile API keys).
 * Secret values are injected via Cloudflare environment variables / secrets —
 * never committed to the repository.
 *
 * To set the OpenAIP key:
 *   wrangler secret put OPENAIP_API_KEY
 * Or via Cloudflare Dashboard → Pages → <project> → Settings → Environment variables.
 */
export async function onRequestGet({ env }) {
    return Response.json(
        {
            openaipApiKey: env.OPENAIP_API_KEY ?? null,
        },
        {
            headers: {
                // Short cache — key changes are rare, but we don't want them
                // stuck in edge caches for long.
                'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
            },
        }
    );
}
