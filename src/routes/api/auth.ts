import { createFileRoute } from "@tanstack/react-router";
import { login, logout, getCurrentUser } from "@/server/db/auth";

async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { email, password, action } = body;

  if (action === "logout") {
    const token = request.headers.get("x-session-token");
    if (token) await logout(token);
    return Response.json({ success: true });
  }

  if (!email || !password) {
    return Response.json(
      { error: "ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ظˆظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ظ…ط·ظ„ظˆط¨ط§ظ†" },
      { status: 400 },
    );
  }

  const result = await login(email, password);
  if (result.error) {
    return Response.json({ error: result.error }, { status: 401 });
  }

  return Response.json({ user: result.user, token: result.token });
}

async function __handler_GET({ request }: { request: Request }) {
  const token = request.headers.get("x-session-token");
  if (!token) {
    return Response.json({ user: null });
  }

  const user = await getCurrentUser(token);
  return Response.json({ user });
}

export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      POST: __handler_POST,
      GET: __handler_GET,
    },
  },
});
