/**
 * Phase 1B — Journal governance workflow (server-authoritative).
 *
 * Enforces, on the server, the separation of duties that a professional
 * financial system requires:
 *   - the state-transition matrix (illegal transitions rejected),
 *   - the exact permission per action (403 otherwise),
 *   - maker ≠ checker (a creator may not approve their own journal),
 *   - required reasons (return / reject / reverse),
 *   - immutable workflow history (finance_workflow_events) + audit log.
 *
 * Posting and reversal REUSE the certified Phase 1A engine (gl.ts). This module
 * adds no accounting math and never touches GL calculations.
 */
import { and, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import { journalEntries, financeWorkflowEvents } from "./schema";
import { hasPermission } from "./auth";
import { AppError } from "./errors";
import { postDraftEntry, reverseEntry } from "./gl";
import { JournalStatus } from "@/lib/enums";
import {
  findTransition,
  evaluateTransition,
  effectivePermission,
  decisionHttpStatus,
  type JournalAction,
} from "@/lib/finance-permissions";
import type { Ctx } from "./api-utils";

const AUDIT_ACTION: Record<JournalAction, string> = {
  submit: "JOURNAL_SUBMITTED",
  approve: "JOURNAL_APPROVED",
  return: "JOURNAL_RETURNED",
  reject: "JOURNAL_REJECTED",
  post: "JOURNAL_POSTED",
  reverse: "JOURNAL_REVERSED",
  issue: "JOURNAL_ISSUE",
  cancel: "JOURNAL_CANCELLED",
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Append one immutable workflow-history row. */
export async function recordWorkflowEvent(
  tx: Tx,
  e: {
    entityType: string;
    entityId: string;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    userId: string;
    userName: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.insert(financeWorkflowEvents).values({
    id: genId("WFE"),
    entityType: e.entityType,
    entityId: e.entityId,
    action: e.action,
    fromStatus: e.fromStatus ?? null,
    toStatus: e.toStatus ?? null,
    userId: e.userId,
    userName: e.userName,
    reason: e.reason ?? "",
    metadata: JSON.stringify(e.metadata ?? {}),
    createdAt: now(),
  });
}

export interface TransitionResult {
  item: any;
  reversalId?: string;
}

/**
 * Apply a governance action to a journal. Single choke point for every journal
 * state change except initial creation and draft edits.
 */
export async function transitionJournal(
  ctx: Ctx,
  id: string,
  action: JournalAction,
  reason?: string,
): Promise<TransitionResult> {
  const entry = (
    await db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1)
  )[0];
  if (!entry) throw new AppError("القيد غير موجود", 404, "NOT_FOUND");

  // Authorization decision (state matrix → permission → maker≠checker → reason)
  // via the single shared pure function. The permission is resolved once here.
  const t = findTransition(entry.status, action);
  // Source-aware permission: opening-balance journals are approved/posted with
  // the dedicated opening-balance permissions, not the generic journal ones.
  const perm = t ? effectivePermission(entry.sourceType, action, t.permission) : null;
  const granted = perm ? await hasPermission(ctx.user.role, perm) : false;
  const decision = evaluateTransition({
    fromStatus: entry.status,
    action,
    hasPerm: (p) => (perm ? p === perm && granted : false),
    createdBy: entry.createdBy,
    currentUserId: ctx.user.id,
    reason,
    sourceType: entry.sourceType,
  });
  if (!decision.ok || !t)
    throw new AppError(
      decision.message ?? "إجراء غير مسموح",
      decisionHttpStatus(decision.code),
      decision.code ?? "FORBIDDEN",
    );

  const cleanReason = (reason ?? "").trim();
  const ts = now();
  let reversalId: string | undefined;

  await db.transaction(async (tx) => {
    if (action === "post") {
      // Lock + re-check under the row lock to prevent double-post races, then
      // hand off to the CERTIFIED posting engine (period/account/double-entry).
      const locked = (
        await tx
          .select()
          .from(journalEntries)
          .where(eq(journalEntries.id, id))
          .for("update")
          .limit(1)
      )[0];
      if (!locked || locked.status !== JournalStatus.APPROVED)
        throw new AppError("تعذّر الترحيل — تغيّرت حالة القيد", 409, "STATE_CONFLICT");
      await postDraftEntry(tx as any, id, ctx.user.id);
    } else if (action === "reverse") {
      const locked = (
        await tx
          .select()
          .from(journalEntries)
          .where(eq(journalEntries.id, id))
          .for("update")
          .limit(1)
      )[0];
      if (!locked || locked.status !== JournalStatus.POSTED)
        throw new AppError("تعذّر العكس — تغيّرت حالة القيد", 409, "STATE_CONFLICT");
      reversalId = await reverseEntry(tx as any, id, ctx.user.id);
    } else {
      // Atomic guarded transition: only one request can move it off `from`.
      const cols: Record<string, unknown> = { status: t.to, updatedAt: ts };
      if (action === "submit") {
        cols.submittedBy = ctx.user.id;
        cols.submittedAt = ts;
      } else if (action === "approve") {
        cols.approvedBy = ctx.user.id;
        cols.approvedAt = ts;
      }
      const changed = await tx
        .update(journalEntries)
        .set(cols)
        .where(and(eq(journalEntries.id, id), eq(journalEntries.status, t.from)))
        .returning({ id: journalEntries.id });
      if (changed.length === 0)
        throw new AppError("تعذّر تنفيذ الإجراء — تغيّرت حالة القيد", 409, "STATE_CONFLICT");
    }

    await recordWorkflowEvent(tx, {
      entityType: "journal_entry",
      entityId: id,
      action,
      fromStatus: entry.status,
      toStatus: t.to,
      userId: ctx.user.id,
      userName: ctx.user.name,
      reason: cleanReason,
      metadata: reversalId ? { reversalId } : {},
    });
  });

  await addAudit({
    action: AUDIT_ACTION[action],
    entityType: "journal_entry",
    entityId: id,
    description:
      `${AUDIT_ACTION[action]} — ${entry.number} (${entry.status} → ${t.to})` +
      (cleanReason ? ` — ${cleanReason}` : ""),
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });

  const item = (
    await db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1)
  )[0];
  return { item, reversalId };
}

/** Chronological workflow history for one journal (for the detail timeline). */
export async function journalWorkflowHistory(id: string) {
  return db
    .select()
    .from(financeWorkflowEvents)
    .where(
      and(
        eq(financeWorkflowEvents.entityType, "journal_entry"),
        eq(financeWorkflowEvents.entityId, id),
      ),
    )
    .orderBy(financeWorkflowEvents.createdAt);
}
