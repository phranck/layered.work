CREATE TABLE "former_topic_slugs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"topic_id" uuid NOT NULL,
	"language" "language" NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "former_topic_slugs_slug_per_language" UNIQUE("language","slug")
);
--> statement-breakpoint
ALTER TABLE "former_topic_slugs" ADD CONSTRAINT "former_topic_slugs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;