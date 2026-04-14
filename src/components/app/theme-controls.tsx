import { Monitor, MoonStar, SunMedium } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useThemePreferences, type Appearance, type BrandTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const appearances: Array<{ value: Appearance; label: string; icon: typeof SunMedium }> = [
  { value: "light", label: "Hell", icon: SunMedium },
  { value: "dark", label: "Dunkel", icon: MoonStar },
  { value: "system", label: "System", icon: Monitor },
];

const brandThemes: Array<{ value: BrandTheme; label: string; accent: string }> = [
  { value: "carbon", label: "Carbon", accent: "bg-[#0f62fe]" },
  { value: "dracula", label: "Dracula", accent: "bg-[#bd93f9]" },
  { value: "dracula-laser", label: "Laser", accent: "bg-[#ff79c6]" },
  { value: "kirschbluete", label: "Kirsch", accent: "bg-[#e11d48]" },
  { value: "swr-ms", label: "SWR MS", accent: "bg-[#14b8a6]" },
];

export function ThemeControls() {
  const { appearance, brandTheme, resolvedAppearance, setAppearance, setBrandTheme } = useThemePreferences();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline">Theme Engine</Badge>
        <span className="text-xs text-muted-foreground">{brandTheme} · {resolvedAppearance}</span>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Appearance</p>
        <div className="flex flex-wrap gap-2">
          {appearances.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              size="sm"
              variant={appearance === value ? "default" : "outline"}
              onClick={() => setAppearance(value)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Brand</p>
        <div className="flex flex-wrap gap-2">
          {brandThemes.map(({ value, label, accent }) => (
            <button
              key={value}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
                brandTheme === value
                  ? "border-primary bg-primary/12 text-foreground"
                  : "border-border/70 bg-background/70 text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setBrandTheme(value)}
              type="button"
            >
              <span className={cn("h-2.5 w-2.5 rounded-full", accent)} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}