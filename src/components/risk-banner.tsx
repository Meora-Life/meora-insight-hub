import type { RiskFinding } from "@/lib/risk";

export const HIGH_RISK_MESSAGE =
  "HIGH RISK PATIENT — Do not initiate any protocol without specialist review. Refer to treating physician immediately.";

export function HighRiskBanner({ findings }: { findings: RiskFinding[] }) {
  return (
    <div
      role="alert"
      className="w-full border-y-4 border-outofrange bg-outofrange px-6 py-6 text-white"
    >
      <div className="mx-auto max-w-7xl">
        <p className="text-xl font-extrabold uppercase leading-tight tracking-wide md:text-2xl">
          {HIGH_RISK_MESSAGE}
        </p>
        {findings.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm font-medium text-white/90">
            {findings.map((f) => (
              <li key={f.detail}>
                {f.category} — {f.detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
