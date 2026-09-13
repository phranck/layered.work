CREATE TYPE "public"."home_block_type" AS ENUM('hero', 'featured_entry', 'project_grid', 'post_grid', 'topic_bar');--> statement-breakpoint
CREATE TYPE "public"."navigation_placement" AS ENUM('main', 'footer');--> statement-breakpoint
CREATE TABLE "navigation_item_translations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"item_id" uuid NOT NULL,
	"language" "language" NOT NULL,
	"label" text NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	CONSTRAINT "navigation_item_translations_one_per_language" UNIQUE("item_id","language")
);
--> statement-breakpoint
CREATE TABLE "navigation_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"navigation_id" uuid NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"entry_id" uuid,
	"topic_id" uuid,
	"href" text,
	CONSTRAINT "navigation_items_at_most_one_target" CHECK (num_nonnulls("navigation_items"."entry_id", "navigation_items"."topic_id", "navigation_items"."href") <= 1),
	CONSTRAINT "navigation_items_not_its_own_parent" CHECK ("navigation_items"."id" <> "navigation_items"."parent_id")
);
--> statement-breakpoint
CREATE TABLE "navigation_translations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"navigation_id" uuid NOT NULL,
	"language" "language" NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "navigation_translations_one_per_language" UNIQUE("navigation_id","language")
);
--> statement-breakpoint
CREATE TABLE "navigations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"placement" "navigation_placement" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_blocks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"type" "home_block_type" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"href" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_accounts_href_unique" UNIQUE("href")
);
--> statement-breakpoint
ALTER TABLE "navigation_item_translations" ADD CONSTRAINT "navigation_item_translations_item_id_navigation_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."navigation_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_navigation_id_navigations_id_fk" FOREIGN KEY ("navigation_id") REFERENCES "public"."navigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."navigation_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_translations" ADD CONSTRAINT "navigation_translations_navigation_id_navigations_id_fk" FOREIGN KEY ("navigation_id") REFERENCES "public"."navigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "navigation_items_by_navigation" ON "navigation_items" USING btree ("navigation_id","sort_order");--> statement-breakpoint
CREATE INDEX "navigation_items_by_parent" ON "navigation_items" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "navigations_by_placement" ON "navigations" USING btree ("placement","sort_order");--> statement-breakpoint
CREATE INDEX "home_blocks_in_order" ON "home_blocks" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "social_accounts_in_order" ON "social_accounts" USING btree ("sort_order");