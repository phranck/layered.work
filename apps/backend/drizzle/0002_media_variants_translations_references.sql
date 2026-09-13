CREATE TYPE "public"."image_format" AS ENUM('avif', 'webp', 'jpeg', 'png');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video', 'document', 'model');--> statement-breakpoint
CREATE TABLE "media_references" (
	"translation_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	CONSTRAINT "media_references_translation_id_media_id_pk" PRIMARY KEY("translation_id","media_id")
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
ALTER TABLE "entry_translations" ADD COLUMN "featured_media_id" uuid;--> statement-breakpoint
ALTER TABLE "media_references" ADD CONSTRAINT "media_references_translation_id_entry_translations_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."entry_translations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_references" ADD CONSTRAINT "media_references_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_translations" ADD CONSTRAINT "media_translations_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_references_by_media" ON "media_references" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "media_by_kind" ON "media" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "media_variants_by_media" ON "media_variants" USING btree ("media_id");--> statement-breakpoint
ALTER TABLE "entry_translations" ADD CONSTRAINT "entry_translations_featured_media_id_media_id_fk" FOREIGN KEY ("featured_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_media_id_media_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;