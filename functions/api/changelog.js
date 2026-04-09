/**
 * GET /api/changelog
 *
 * Fetches CHANGELOG.md from the private GitHub repository and returns:
 *   { markdown: string, version: string | null, cachedAt: string }
 *
 * Required Cloudflare secrets (set via `wrangler secret put` or the dashboard):
 *   GITHUB_TOKEN  — Fine-grained PAT with "Contents: read" permission
 *   GITHUB_REPO   — e.g. "myorg/my-private-repo"
 *
 * Optional:
 *   GITHUB_BRANCH — branch to read from (default: "main")
 */

export async function onRequestGet({ env }) {
    const token  = env.GITHUB_TOKEN;
    const repo   = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';

    if (!token || !repo) {
        return Response.json(
            { error: 'GITHUB_TOKEN and GITHUB_REPO secrets are not configured.' },
            { status: 503 }
        );
    }

    // Use the "raw" accept header so GitHub returns the file content directly
    const apiUrl = `https://api.github.com/repos/${repo}/contents/CHANGELOG.md?ref=${branch}`;

    let ghRes;
    try {
        ghRes = await fetch(apiUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept:        'application/vnd.github.v3.raw',
                'User-Agent':  'Standort-Dashboard/1.0',
            },
        });
    } catch {
        return Response.json({ error: 'Failed to reach GitHub API.' }, { status: 502 });
    }

    if (!ghRes.ok) {
        const status = ghRes.status === 404 ? 404 : 502;
        return Response.json(
            { error: `GitHub API returned HTTP ${ghRes.status}.` },
            { status }
        );
    }

    const markdown = await ghRes.text();

    // Extract the latest version from headings like:
    //   ## [v1.2.3] - 2026-04-09
    //   ## v1.2.3
    //   ## [1.2.3]
    const versionMatch = markdown.match(/^##\s+\[?(v?[\d]+\.[\d]+(?:\.[\d]+)?)\]?/m);
    const version = versionMatch ? versionMatch[1] : null;

    return Response.json(
        { markdown, version, cachedAt: new Date().toISOString() },
        {
            headers: {
                // Edge-cache for 5 minutes — short enough to reflect quick pushes
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
                'Content-Type': 'application/json',
            },
        }
    );
}
