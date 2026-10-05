CREATE TABLE "media_attempts" (
	"token" uuid PRIMARY KEY NOT NULL,
	"media_id" uuid NOT NULL,
	"object_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"cleanup_ready" boolean DEFAULT false NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_id" uuid
);
