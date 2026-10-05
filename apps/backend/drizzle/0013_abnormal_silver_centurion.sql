CREATE TYPE "public"."media_processing_state" AS ENUM('queued', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "media_jobs" (
	"media_id" uuid PRIMARY KEY NOT NULL,
	"state" "media_processing_state" DEFAULT 'queued' NOT NULL,
	"claim_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"object_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"error_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;