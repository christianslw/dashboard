import type { ReactNode } from "react";
import { ArrowUpRight, Boxes, ShieldCheck } from "lucide-react";

import { ThemeControls } from "@/components/app/theme-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AppFrameProps = {
  current: "dashboard" | "admin";
  title: string;
  eyebrow: string;
  summary: string;
  children: ReactNode;
};

export function AppFrame({ current, title, eyebrow, summary, children }: AppFrameProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--hero-start)/0.36),transparent_28%),radial-gradient(circle_at_80%_20%,hsl(var(--hero-end)/0.22),transparent_24%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))]" />
      <div className="pointer-events-none absolute inset-0 bg-hero-grid bg-[size:36px_36px] opacity-30" />
      <div className="relative container py-8 sm:py-12">
        <header className="grid gap-8 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6 rounded-[28px] border border-border/70 bg-card/80 p-8 shadow-lift backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <Badge>{eyebrow}</Badge>
              <Badge variant="outline">React + Vite + shadcn foundation</Badge>
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{summary}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a href={current === "dashboard" ? "/admin.html" : "/"}>
                  {current === "dashboard" ? "Admin preview" : "Dashboard preview"}
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={current === "dashboard" ? "/legacy-dashboard.html" : "/legacy-admin.html"}>
                  Legacy snapshot
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="mb-3 inline-flex rounded-full bg-primary/10 p-2 text-primary">
                  <Boxes className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium">Component-first UI</p>
                <p className="mt-1 text-sm text-muted-foreground">Shared primitives now replace ad hoc entry markup.</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="mb-3 inline-flex rounded-full bg-primary/10 p-2 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium">Cloudflare-safe cutover</p>
                <p className="mt-1 text-sm text-muted-foreground">Static output moves to dist while existing /api contracts stay stable.</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="mb-3 inline-flex rounded-full bg-primary/10 p-2 text-primary">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium">Rollback path</p>
                <p className="mt-1 text-sm text-muted-foreground">Legacy dashboard and admin snapshots are copied into the build output.</p>
              </div>
            </div>
          </div>
          <aside className="rounded-[28px] border border-border/70 bg-card/80 p-6 shadow-lift backdrop-blur">
            <ThemeControls />
          </aside>
        </header>
        <main className="mt-8">{children}</main>
      </div>
    </div>
  );
}