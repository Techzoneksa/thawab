import { createFileRoute } from "@tanstack/react-router";
import { diagnose } from "@/server/db/index";
import { authHandler, type Ctx } from "@/server/db/api-utils";

// Admin-only. Never returns DATABASE_URL, filesystem paths, or any secret.
async function GET(_event: { request: Request }, _ctx: Ctx) {
  const info = await diagnose();
  return Response.json({ ok: true, info });
}

export const Route = createFileRoute("/api/diagnose")({
  component: () => null,
  server: {
    handlers: {
      GET: authHandler("settings.view", GET),
    },
  },
});
