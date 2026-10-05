CREATE TABLE "media_deletions" (
	"media_id" uuid PRIMARY KEY NOT NULL,
	"pending_keys" text[] NOT NULL,
	"removed_objects" integer DEFAULT 0 NOT NULL,
	"error_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
