CREATE TABLE "setting_media_references" (
	"settings_key" text NOT NULL,
	"language" "language" NOT NULL,
	"media_id" uuid NOT NULL,
	CONSTRAINT "setting_media_references_settings_key_language_media_id_pk" PRIMARY KEY("settings_key","language","media_id")
);
--> statement-breakpoint
ALTER TABLE "setting_media_references" ADD CONSTRAINT "setting_media_references_settings_key_settings_key_fk" FOREIGN KEY ("settings_key") REFERENCES "public"."settings"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setting_media_references" ADD CONSTRAINT "setting_media_references_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;