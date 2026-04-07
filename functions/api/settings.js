/**
 * GET /api/settings?userId=<uid>  — fetch user settings
 * PUT /api/settings  { userId, settings }  — save user settings
 * Per-user UUID auth (localStorage) — privacy only, not security.
 */

const ALLOWED_KEYS = new Set([
    'appearance',
    'colorTheme',
    'sortField',
    'sortDir',
    'tagebuchMode',
    'navMode',
    'favoriteStations',
    'stationFilterState',
]);

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function onRequestGet({ env, request }) {
    const url    = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!userId || userId.length < 8) {
        return Response.json({ error: 'userId required' }, { status: 400 });
    }

    const data = await env.SETTINGS_KV.get(`settings:${userId}`, { type: 'json' });

    return Response.json(
        { settings: data?.settings ?? null, savedAt: data?.savedAt ?? null },
        { headers: { 'Cache-Control': 'no-store' } }
    );
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function onRequestPut({ env, request }) {
    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { userId, settings } = body;

    if (!userId || userId.length < 8) {
        return Response.json({ error: 'userId required' }, { status: 400 });
    }

    if (!settings || typeof settings !== 'object') {
        return Response.json({ error: '`settings` object required' }, { status: 400 });
    }

    // Strip unknown keys
    const sanitized = {};
    for (const key of ALLOWED_KEYS) {
        if (settings[key] !== undefined) sanitized[key] = settings[key];
    }

    const record = {
        settings:  sanitized,
        savedAt:   new Date().toISOString(),
    };

    // Store with 1-year TTL — stale data evicted automatically
    await env.SETTINGS_KV.put(
        `settings:${userId}`,
        JSON.stringify(record),
        { expirationTtl: 60 * 60 * 24 * 365 }
    );

    return Response.json({ ok: true, savedAt: record.savedAt });
}
