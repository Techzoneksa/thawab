import { createFileRoute } from "@tanstack/react-router";
import { diagnose, dialect } from "@/server/db/index";

async function __handler_GET() {
  const info = await diagnose();
  return Response.json({ ok: true, info, dialect });
}

export const Route = createFileRoute("/api/diagnose")({
  component: () => null,
  server: {
    handlers: {
      GET: __handler_GET,
    },
  },
});
