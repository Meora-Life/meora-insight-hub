import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import logoDark from "@/assets/meora-life-logo.png.asset.json";
import logoLight from "@/assets/meora-life-logo-light.png.asset.json";

export function Logomark({ size = 34, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <img
      src={dark ? logoLight.url : logoDark.url}
      alt="Meora.life"
      style={{ height: size }}
      className="w-auto shrink-0"
    />
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-ink text-ink-foreground">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center">
          <Logomark dark size={28} />
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium">
          <HeaderLink to="/">Home</HeaderLink>
          <HeaderLink to="/results">Results</HeaderLink>
          <HeaderLink to="/dashboard">Dashboard</HeaderLink>
        </nav>
      </div>
    </header>
  );
}

function HeaderLink({ to, children }: { to: "/" | "/results" | "/dashboard"; children: ReactNode }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === "/" }}
      className="rounded-md px-3 py-2 text-ink-foreground/70 transition-colors hover:text-ink-foreground"
      activeProps={{ className: "!text-ink-foreground font-semibold" }}
    >
      {children}
    </Link>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      {children}
      <footer className="mt-20 border-t border-border/70 py-8">
        <div className="mx-auto max-w-7xl px-6 text-xs text-muted-foreground">
          MeorAI — personalised longevity intelligence. Proof-of-concept for the Meora medical
          team. Not a substitute for medical advice.
        </div>
      </footer>
    </div>
  );
}
