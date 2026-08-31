-- Account-setup / password-reset one-time tokens (emailed invitation links).
-- Only the SHA-256 hash of the token is stored; the raw token lives only in the
-- link sent by email. Single-use (used_at) and time-bounded (expires_at).
-- Additive, forward-only, idempotent.
CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "token_hash" text NOT NULL,
  "purpose" text NOT NULL,
  "expires_at" text NOT NULL,
  "used_at" text,
  "created_at" text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_tokens_token_hash_idx" ON "auth_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_tokens_user_idx" ON "auth_tokens" ("user_id");
