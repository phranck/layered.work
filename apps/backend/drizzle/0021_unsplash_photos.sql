CREATE TABLE "unsplash_photos" (
	"media_id" uuid PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"image_url" text NOT NULL,
	"photographer_name" text NOT NULL,
	"photographer_url" text NOT NULL,
	CONSTRAINT "unsplash_photos_photo_id_unique" UNIQUE("photo_id")
);
--> statement-breakpoint
ALTER TABLE "unsplash_photos" ADD CONSTRAINT "unsplash_photos_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;