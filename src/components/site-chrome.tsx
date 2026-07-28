import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function Logomark({ size = 34, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] font-display leading-none"
      style={{
        width: size,
        height: size,
        backgroundColor: dark ? "var(--cream)" : "var(--ink)",
        color: dark ? "var(--ink)" : "var(--cream)",
        fontSize: size * 0.55,
        fontWeight: 600,
        letterSpacing: "-0.02em",
      }}
    >
      M
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-ink text-ink-foreground">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-3">
          <Logomark dark />
          <span className="text-[1.05rem] font-extrabold tracking-tight">MeorAI</span>
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
