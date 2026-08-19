/**
 * Phase 3B.1 — Finance system-account mappings API (Input VAT, extensible).
 *
 * GET  → VAT mapping preflight + current configuration (diagnostic only, gated by
 *        finance.accounts.view). Never mutates, never auto-maps.
 * POST → set/change the configured Input VAT account, atomically and validated,
 *        gated by the dedicated finance.account_mapping.update permission (never
 *        granted to ordinary Supplier Invoice creators).
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import { db } from "@/server/db/index";
import {
  setInputVatAccount,
  inputVatPreflight,
  getInputVatMapping,
  setGrniAccount,
  grniPreflight,
  getGrniMapping,
} from "@/server/db/account-mapping";

async function GET(_event: { request: Request }, _ctx: Ctx) {
  const [vatPf, vatMap, grniPf, grniMap] = await Promise.all([
    inputVatPreflight(db),
    getInputVatMapping(db),
    grniPreflight(db),
    getGrniMapping(db),
  ]);
  return Response.json({
    inputVat: { preflight: vatPf, mapping: vatMap ?? null },
    grni: { preflight: grniPf, mapping: grniMap ?? null },
  });
}

const setSchema = z.object({
  purpose: z.enum(["input_vat", "grni"]),
  accountId: z.string().min(1, "الحساب مطلوب"),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    if (!(await hasPermission(ctx.user.role, P.accountMappingUpdate)))
      return err("لا تملك صلاحية تهيئة ربط الحسابات النظامية", 403, "FORBIDDEN");
    const b = await parseBody(event.request, setSchema);
    const item =
      b.purpose === "grni"
        ? await setGrniAccount(ctx, b.accountId)
        : await setInputVatAccount(ctx, b.accountId);
    return Response.json({ item });
  });
}

export const Route = createFileRoute("/api/finance/account-mappings")({
  server: {
    handlers: {
      GET: authHandler(P.accountsView, GET),
      POST: authHandler(P.accountsView, POST), // mutation permission checked inside
    },
  },
});
