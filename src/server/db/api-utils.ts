import { ensureInit } from "./index";

export function safeHandler(fn: (event: { request: Request }) => Promise<Response>): (event: { request: Request }) => Promise<Response> {
  return async (event) => {
    try {
      await ensureInit();
      return await fn(event);
    } catch (err) {
      console.error("[api] unhandled error:", err instanceof Error ? err.message : err);
      return Response.json(
        { error: true, message: "حدث خطأ داخلي", code: "INTERNAL_ERROR" },
        { status: 500 },
      );
    }
  };
}
