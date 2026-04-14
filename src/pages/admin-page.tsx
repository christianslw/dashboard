import { useState } from "react";
import { KeyRound, ServerCog, ShieldAlert, ShieldCheck } from "lucide-react";

import { AppFrame } from "@/components/app/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAdminStatus, type AdminStatus } from "@/lib/api";

export function AdminPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    setLoading(true);
    setError(null);

    try {
      const nextStatus = await fetchAdminStatus(token);
      setStatus(nextStatus);
    } catch (nextError) {
      setStatus(null);
      setError(nextError instanceof Error ? nextError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppFrame
      current="admin"
      eyebrow="Admin foundation"
      title="Admin is now on the same shared design system."
      summary="This entry point replaces the standalone HTML shell with reusable components and verifies the existing bearer-token flow against the current Cloudflare endpoint."
    >
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <CardTitle>Admin token check</CardTitle>
            </div>
            <CardDescription>Uses the existing /api/admin/status contract. No backend auth changes were made in this foundation slice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="admin-token">Bearer token</label>
              <Input
                id="admin-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="ADMIN_SECRET"
                autoComplete="current-password"
              />
            </div>
            <Button className="w-full" disabled={loading || token.trim().length === 0} onClick={() => void handleVerify()}>
              {loading ? "Checking token..." : "Verify admin access"}
            </Button>
            {error ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldAlert className="h-4 w-4" />
                  Verification failed
                </div>
                <p className="mt-2 text-destructive/90">{error}</p>
              </div>
            ) : null}
            {status ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium text-primary">
                  <ShieldCheck className="h-4 w-4" />
                  Access confirmed
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-background/80 p-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Standorte</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{status.standorteCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/80 p-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Overlays</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{status.overlaysCount}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ServerCog className="h-5 w-5 text-primary" />
              <CardTitle>What changed in this slice</CardTitle>
            </div>
            <CardDescription>The admin UI now shares the same primitives and build pipeline as the dashboard, which removes duplicated HTML shell work before CRUD features are ported.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                <Badge variant="outline">Ready now</Badge>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>Typed admin entry point</li>
                  <li>Shared theme controls</li>
                  <li>Shared cards, buttons, inputs, and layout</li>
                  <li>Live verification against the current admin status endpoint</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                <Badge variant="outline">Still to port</Badge>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>Auth gate persistence and logout flow</li>
                  <li>Standort CRUD tables and dialogs</li>
                  <li>Seed and export actions</li>
                  <li>Status and progress messaging from admin mutations</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </AppFrame>
  );
}