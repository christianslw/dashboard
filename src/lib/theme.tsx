import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Appearance = "light" | "dark" | "system";
export type BrandTheme = "carbon" | "dracula" | "dracula-laser" | "kirschbluete" | "swr-ms";

type ThemeContextValue = {
  appearance: Appearance;
  brandTheme: BrandTheme;
  resolvedAppearance: "light" | "dark";
  setAppearance: (appearance: Appearance) => void;
  setBrandTheme: (brandTheme: BrandTheme) => void;
};

const STORAGE_KEYS = {
  appearance: "appearance",
  brandTheme: "colorTheme",
} as const;

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getStoredAppearance(): Appearance {
  const stored = window.localStorage.getItem(STORAGE_KEYS.appearance);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function getStoredBrandTheme(): BrandTheme {
  const stored = window.localStorage.getItem(STORAGE_KEYS.brandTheme);
  return stored === "carbon" || stored === "dracula" || stored === "dracula-laser" || stored === "kirschbluete" || stored === "swr-ms"
    ? stored
    : "carbon";
}

function resolveAppearance(appearance: Appearance) {
  if (appearance === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return appearance;
}

function applyDocumentTheme(appearance: Appearance, brandTheme: BrandTheme) {
  const root = document.documentElement;
  const resolved = resolveAppearance(appearance);

  root.classList.toggle("dark", resolved === "dark");
  root.dataset.brandTheme = brandTheme;
  root.style.colorScheme = resolved;

  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [brandTheme, setBrandTheme] = useState<BrandTheme>("carbon");
  const [resolvedAppearance, setResolvedAppearance] = useState<"light" | "dark">("light");

  useEffect(() => {
    const nextAppearance = getStoredAppearance();
    const nextBrandTheme = getStoredBrandTheme();

    setAppearance(nextAppearance);
    setBrandTheme(nextBrandTheme);
    setResolvedAppearance(applyDocumentTheme(nextAppearance, nextBrandTheme));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.appearance, appearance);
    window.localStorage.setItem(STORAGE_KEYS.brandTheme, brandTheme);

    setResolvedAppearance(applyDocumentTheme(appearance, brandTheme));
  }, [appearance, brandTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if (appearance === "system") {
        setResolvedAppearance(applyDocumentTheme(appearance, brandTheme));
      }
    };

    mediaQuery.addEventListener("change", listener);

    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }, [appearance, brandTheme]);

  const value = useMemo(
    () => ({
      appearance,
      brandTheme,
      resolvedAppearance,
      setAppearance,
      setBrandTheme,
    }),
    [appearance, brandTheme, resolvedAppearance],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreferences() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useThemePreferences must be used within ThemeProvider");
  }

  return context;
}