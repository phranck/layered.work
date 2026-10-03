CREATE TABLE "gone_paths" (
	"path" text PRIMARY KEY NOT NULL,
	"gone_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_translations" ADD COLUMN "trashed_at" timestamp with time zone;