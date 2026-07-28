import { createHash, timingSafeEqual } from "node:crypto";

export const gateSessionConfig = {
  get password() {
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error("SESSION_SECRET is not set");
    return secret;
  },
  name: "meorai-gate",
  maxAge: 60 * 60 * 12,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
  },
};

export type GateSession = { unlocked?: boolean };

export function passwordMatches(input: string): boolean {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) throw new Error("SITE_PASSWORD is not set");
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
