/**
 * Phase 4A.1 — TEST-ONLY failure injection (failpoints).
 *
 * This exists so reliability tests can prove that an injected failure at a
 * precise transaction boundary rolls the WHOLE accounting transaction back with
 * no partial state. It is double-gated so it can NEVER fire in production:
 *
 *   1. `failpoint()` is a no-op unless `process.env.THAWAB_FAILPOINTS === "1"`.
 *   2. Even then it throws only for a point a test has explicitly ARMED via
 *      `armFailpoint()` — and `armFailpoint`/`clearFailpoints` are called ONLY
 *      from test scripts, never from any request path.
 *
 * There is no user-facing input anywhere in this module: the point name is a
 * hard-coded string literal at each call site, and arming is in-process only.
 * In production the env var is unset, so every `failpoint()` is a single boolean
 * check that returns immediately.
 */
const armed = new Map<string, number>();

/** Arm a named failpoint to throw `times` more times (test code only). */
export function armFailpoint(name: string, times = 1): void {
  armed.set(name, times);
}

/** Disarm everything (test cleanup). */
export function clearFailpoints(): void {
  armed.clear();
}

/**
 * Throw `FAILPOINT:<name>` if this point is enabled AND armed. No-op otherwise.
 * Call at a transaction boundary you want a reliability test to be able to break.
 */
export function failpoint(name: string): void {
  if (process.env.THAWAB_FAILPOINTS !== "1") return;
  const left = armed.get(name);
  if (!left || left <= 0) return;
  armed.set(name, left - 1);
  throw new Error(`FAILPOINT:${name}`);
}
