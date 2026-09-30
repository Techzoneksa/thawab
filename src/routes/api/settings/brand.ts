/**
 * Public branding: the association's display name ONLY (shown on the login
 * page and app chrome instead of a product name). Resolved per tenant from the
 * request host, so each association sees its own name. Never fails the page:
 * returns an empty name if the profile is not set yet.
 */
import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/index";
import { orgSettings } from "@/server/db/schema";
import { safeHandler } from "@/server/db/api-utils";

async function GET() {
  try {
    const row = (
      await db.select({ name: orgSettings.name }).from(orgSettings).where(eq(orgSettings.id, "org")).limit(1)
    )[0];
    return Response.json({ name: row?.name?.trim() || "" });
  } catch {
    return Response.json({ name: "" });
  }
}

export const Route = createFileRoute("/api/settings/brand")({
  server: { handlers: { GET: safeHandler(GET) } },
});
