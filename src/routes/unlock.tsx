import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import meoraLifeLogo from "@/assets/meora-life-logo.png.asset.json";
import { unlockSite } from "@/lib/gate.functions";

export const Route = createFileRoute("/unlock")({
  head: () => ({
    meta: [
      { title: "Enter — MeorAI" },
      { name: "description", content: "Secure access to the MeorAI longevity platform." },
      { property: "og:title", content: "Enter — MeorAI" },
      {
        property: "og:description",
        content: "Secure access to the MeorAI longevity platform.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnlockPage,
});

function UnlockPage() {
  const router = useRouter();
  const unlock = useServerFn(unlockSite);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const result = await unlock({ data: { password } });
      if (result.ok) {
        await router.navigate({ to: "/" });
        return;
      }
      setError(true);
      setShake(true);
      window.setTimeout(() => setShake(false), 500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className={`w-full max-w-sm text-center ${shake ? "animate-shake" : ""}`}>
        <div className="flex justify-center">
          <Logomark size={56} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          powered by MeorAI
        </p>
        <h1 className="mt-2 font-display text-5xl font-semibold tracking-tight text-ink">
          Meor<span className="text-primary">AI</span>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Full Spectrum Personalised Human Health Intelligence and Optimisation
        </p>

        <form onSubmit={onSubmit} className="mt-9 space-y-3">
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            aria-label="Password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-input bg-card px-4 py-3 text-center text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
          <button
            type="submit"
            disabled={busy || password.length === 0}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>

        {error && <p className="mt-4 text-sm font-medium text-outofrange">Incorrect password</p>}
      </div>
    </main>
  );
}
