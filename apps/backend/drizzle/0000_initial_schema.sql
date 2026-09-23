CREATE TYPE "public"."entry_kind" AS ENUM('post', 'page');--> statement-breakpoint
CREATE TYPE "public"."home_block_type" AS ENUM('hero', 'featured_entry', 'project_grid', 'post_grid', 'topic_bar');--> statement-breakpoint
CREATE TYPE "public"."image_format" AS ENUM('avif', 'webp', 'jpeg', 'png');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'de');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video', 'document', 'model');--> statement-breakpoint
CREATE TYPE "public"."navigation_placement" AS ENUM('main', 'footer');--> statement-breakpoint
CREATE TYPE "public"."publication_state" AS ENUM('public', 'draft', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."reading_width" AS ENUM('narrow', 'normal', 'wide', 'full');--> statement-breakpoint
CREATE TYPE "public"."token_scope" AS ENUM('content:read', 'content:write', 'content:publish', 'media:write');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'editor');--> statement-breakpoint
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
	"featured_media_id" uuid,
	CONSTRAINT "entry_translations_one_per_language" UNIQUE("entry_id","language")
);
--> statement-breakpoint
CREATE TABLE "media_references" (
	"translation_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	CONSTRAINT "media_references_translation_id_media_id_pk" PRIMARY KEY("translation_id","media_id")
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
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"mime_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum" text NOT NULL,
	"width" integer,
	"height" integer,
	"focal_x" real DEFAULT 0.5 NOT NULL,
	"focal_y" real DEFAULT 0.5 NOT NULL,
	"placeholder" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_slug_unique" UNIQUE("slug"),
	CONSTRAINT "media_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_checksum_unique" UNIQUE("checksum"),
	CONSTRAINT "media_image_has_dimensions" CHECK ("media"."kind" <> 'image' or ("media"."width" is not null and "media"."height" is not null)),
	CONSTRAINT "media_focal_point_within_bounds" CHECK ("media"."focal_x" between 0 and 1 and "media"."focal_y" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "media_translations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"media_id" uuid NOT NULL,
	"language" "language" NOT NULL,
	"alt_text" text,
	"caption" text,
	CONSTRAINT "media_translations_one_per_language" UNIQUE("media_id","language"),
	CONSTRAINT "media_translations_says_something" CHECK (num_nonnulls("media_translations"."alt_text", "media_translations"."caption") > 0)
);
--> statement-breakpoint
CREATE TABLE "media_variants" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"media_id" uuid NOT NULL,
	"format" "image_format" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_variants_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_variants_one_per_format_and_width" UNIQUE("media_id","format","width")
);
--> statement-breakpoint
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
CREATE TABLE "access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" "token_scope"[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "access_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "access_tokens_name_per_user" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"actor_user_id" uuid,
	"actor_token_id" uuid,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid,
	"detail" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_media_id" uuid,
	"interface_language" "language" DEFAULT 'en' NOT NULL,
	"role" "user_role" DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
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
ALTER TABLE "entry_topics" ADD CONSTRAINT "entry_topics_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_topics" ADD CONSTRAINT "entry_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_translations" ADD CONSTRAINT "entry_translations_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_translations" ADD CONSTRAINT "entry_translations_featured_media_id_media_id_fk" FOREIGN KEY ("featured_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_references" ADD CONSTRAINT "media_references_translation_id_entry_translations_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."entry_translations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_references" ADD CONSTRAINT "media_references_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paths" ADD CONSTRAINT "paths_translation_id_entry_translations_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."entry_translations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_translations" ADD CONSTRAINT "topic_translations_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_translations" ADD CONSTRAINT "media_translations_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_item_translations" ADD CONSTRAINT "navigation_item_translations_item_id_navigation_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."navigation_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_navigation_id_navigations_id_fk" FOREIGN KEY ("navigation_id") REFERENCES "public"."navigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."navigation_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_translations" ADD CONSTRAINT "navigation_translations_navigation_id_navigations_id_fk" FOREIGN KEY ("navigation_id") REFERENCES "public"."navigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_token_id_access_tokens_id_fk" FOREIGN KEY ("actor_token_id") REFERENCES "public"."access_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_media_id_media_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entry_topics_by_topic" ON "entry_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "entry_translations_by_state" ON "entry_translations" USING btree ("state","language");--> statement-breakpoint
CREATE INDEX "media_references_by_media" ON "media_references" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paths_one_current_per_translation" ON "paths" USING btree ("translation_id") WHERE "paths"."is_current";--> statement-breakpoint
CREATE INDEX "media_by_kind" ON "media" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "media_variants_by_media" ON "media_variants" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "navigation_items_by_navigation" ON "navigation_items" USING btree ("navigation_id","sort_order");--> statement-breakpoint
CREATE INDEX "navigation_items_by_parent" ON "navigation_items" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "navigations_by_placement" ON "navigations" USING btree ("placement","sort_order");--> statement-breakpoint
CREATE INDEX "access_tokens_by_user" ON "access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_by_subject" ON "audit_log" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "audit_log_by_time" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "sessions_by_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "home_blocks_in_order" ON "home_blocks" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "social_accounts_in_order" ON "social_accounts" USING btree ("sort_order");