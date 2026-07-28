import { cn } from "@/lib/utils";
import { statusInfo } from "@/lib/meora";
import type { StatusKey } from "@/lib/types";

export function StatusBadge({ status, className }: { status: StatusKey; className?: string }) {
  const info = statusInfo(status);
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold",
        info.className,
        className,
      )}
    >
      {info.label}
    </span>
  );
}

export function Pill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "optimal" | "suboptimal" | "outofrange";
}) {
  const toneClass =
    tone === "optimal"
      ? "text-optimal"
      : tone === "suboptimal"
        ? "text-suboptimal"
        : tone === "outofrange"
          ? "text-outofrange"
          : "text-ink";
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-card)]">
      <div className={cn("text-2xl font-extrabold tabular-nums", toneClass)}>{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
