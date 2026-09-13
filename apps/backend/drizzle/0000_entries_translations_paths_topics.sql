CREATE TYPE "public"."entry_kind" AS ENUM('post', 'page');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'de');--> statement-breakpoint
CREATE TYPE "public"."publication_state" AS ENUM('public', 'draft', 'hidden', 'protected');--> statement-breakpoint
CREATE TYPE "public"."reading_width" AS ENUM('narrow', 'normal', 'wide', 'full');--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "entry_kind" NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"on_home_page" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_topics" (
	"entry_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "entry_topics_entry_id_topic_id_pk" PRIMARY KEY("entry_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "entry_translations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entry_id" uuid NOT NULL,
	"language" "language" NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text DEFAULT '' NOT NULL,
	"state" "publication_state" DEFAULT 'draft' NOT NULL,
	"reading_width" "reading_width" DEFAULT 'normal' NOT NULL,
	"published_at" timestamp with time zone,
	"password_hash" text,
	CONSTRAINT "entry_translations_one_per_language" UNIQUE("entry_id","language"),
	CONSTRAINT "entry_translations_protected_has_password" CHECK (("entry_translations"."state" = 'protected') = ("entry_translations"."password_hash" is not null))
);
--> statement-breakpoint
CREATE TABLE "paths" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"translation_id" uuid NOT NULL,
	"path" text NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paths_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "topic_translations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"topic_id" uuid NOT NULL,
	"language" "language" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "topic_translations_one_per_language" UNIQUE("topic_id","language"),
	CONSTRAINT "topic_translations_slug_per_language" UNIQUE("language","slug")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_topics" ADD CONSTRAINT "entry_topics_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_topics" ADD CONSTRAINT "entry_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_translations" ADD CONSTRAINT "entry_translations_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paths" ADD CONSTRAINT "paths_translation_id_entry_translations_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."entry_translations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_translations" ADD CONSTRAINT "topic_translations_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entry_topics_by_topic" ON "entry_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "entry_translations_by_state" ON "entry_translations" USING btree ("state","language");--> statement-breakpoint
CREATE UNIQUE INDEX "paths_one_current_per_translation" ON "paths" USING btree ("translation_id") WHERE "paths"."is_current";