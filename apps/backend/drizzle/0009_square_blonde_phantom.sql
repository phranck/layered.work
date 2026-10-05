CREATE TYPE "public"."form_submission_status" AS ENUM('unread', 'read', 'spam');--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "source_hash" text;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "status" "form_submission_status" DEFAULT 'unread' NOT NULL;