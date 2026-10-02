CREATE TABLE "entry_previews" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"translation_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text NOT NULL,
	"reading_width" "reading_width" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_previews" ADD CONSTRAINT "entry_previews_translation_id_entry_translations_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."entry_translations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_previews" ADD CONSTRAINT "entry_previews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entry_previews_by_expiry" ON "entry_previews" USING btree ("expires_at");