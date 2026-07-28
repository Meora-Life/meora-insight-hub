import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { gateSessionConfig, passwordMatches, type GateSession } from "./gate.server";

export const isUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<GateSession>(gateSessionConfig);
  return { unlocked: session.data.unlocked === true };
});

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => ({ password: String(data.password ?? "") }))
  .handler(async ({ data }) => {
    if (!passwordMatches(data.password)) {
      return { ok: false as const };
    }
    const session = await useSession<GateSession>(gateSessionConfig);
    await session.update({ unlocked: true });
    return { ok: true as const };
  });
