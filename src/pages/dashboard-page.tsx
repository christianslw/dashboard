import { useEffect, useState } from "react";
import { Compass, Layers3, MapPinned, RefreshCcw, Sparkles } from "lucide-react";

import { AppFrame } from "@/components/app/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchStandorteSummary, type StandorteSummary } from "@/lib/api";

const roadmapItems = [
  "Replace the legacy dashboard shell with a typed component tree.",
  "Port search, filters, and planner into reusable React feature modules.",
  "Isolate Leaflet in a map adapter so UI modernization stops fighting DOM mutations.",
  "Keep Cloudflare APIs and KV stable while the frontend changes around them.",
];

const featureCards = [
  {
    icon: MapPinned,
    title: "Dashboard shell",
    description: "Shared layout, theming, and responsive navigation are now centralized in React instead of duplicated across HTML entry points.",
  },
  {
    icon: Layers3,
    title: "Theme engine",
    description: "Brand themes and appearance preferences are stored under the existing localStorage keys so the migration stays compatible with current user settings.",
  },
  {
    icon: Compass,
    title: "API-first wiring",
    description: "The new shell is already reading live backend health from the existing Cloudflare Functions so later feature ports can reuse the same data layer.",
  },
];

const initialSummary: StandorteSummary = {
  ok: false,
  count: 0,
  latencyMs: 0,
};

export function DashboardPage() {
  const [summary, setSummary] = useState<StandorteSummary>(initialSummary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    void fetchStandorteSummary(controller.signal).then((nextSummary) => {
      setSummary(nextSummary);
      setLoading(false);
    });

    return () => controller.abort();
  }, []);

  return (
    <AppFrame
      current="dashboard"
      eyebrow="Migration build"
      title="The dashboard is now on a shadcn-ready React foundation."
      summary="This first slice establishes the new design system, keeps the Cloudflare backend intact, and gives the migration a modern shell before feature-level ports begin."
    >
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Backend handshake</CardTitle>
                <CardDescription>The new shell is already reading from /api/standorte without changing the existing backend contract.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="mt-2 text-2xl font-semibold">{loading ? "Checking" : summary.ok ? "Online" : "Needs attention"}</p>
              <p className="mt-2 text-sm text-muted-foreground">{summary.error ?? "Cloudflare Function responded successfully."}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Standorte</p>
              <p className="mt-2 text-2xl font-semibold">{loading ? "…" : summary.count}</p>
              <p className="mt-2 text-sm text-muted-foreground">Live count from the current dataset endpoint.</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Latency</p>
              <p className="mt-2 text-2xl font-semibold">{loading ? "…" : `${summary.latencyMs} ms`}</p>
              <p className="mt-2 text-sm text-muted-foreground">Measured from the browser against the existing API route.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>First-wave benefits</CardTitle>
            </div>
            <CardDescription>These are the immediate gains from moving the project onto a proper component system.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {featureCards.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-2xl border border-border/60 bg-background/70 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Migration map</CardTitle>
            <CardDescription>The next feature ports will replace the remaining dashboard flows in structured slices instead of a risky big-bang rewrite.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {roadmapItems.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-2xl border border-border/60 bg-background/60 p-4">
                <Badge className="h-fit min-w-7 justify-center">0{index + 1}</Badge>
                <p className="text-sm leading-6 text-muted-foreground">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Implementation scope in progress</CardTitle>
            <CardDescription>The branch now contains the modern frontend entry points, shadcn-style primitives, theme persistence, and Cloudflare-aware build output.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-background/60 p-5">
                <p className="text-sm font-medium">Now established</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>React + TypeScript + Vite multi-page setup</li>
                  <li>Tailwind tokens aligned with shadcn patterns</li>
                  <li>Theme preferences preserved via existing storage keys</li>
                  <li>Legacy snapshots copied for rollback and comparison</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/60 p-5">
                <p className="text-sm font-medium">Next ports</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>Search, filter, and sort toolbar</li>
                  <li>Result list and favorites state</li>
                  <li>Planner and modal flows</li>
                  <li>Leaflet map adapter with overlay controls</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </AppFrame>
  );
}