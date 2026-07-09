import { createFileRoute } from "@tanstack/react-router";

const startTime = Date.now();

async function __handler_GET() {
  return Response.json({
    status: "ok",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "production",
    db: "deferred",
  });
}

export const Route = createFileRoute("/api/health")({
  component: () => null,
  server: {
    handlers: {
      GET: __handler_GET,
    },
  },
});
