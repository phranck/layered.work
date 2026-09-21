ALTER TABLE "entry_translations" DROP CONSTRAINT "entry_translations_protected_has_password";--> statement-breakpoint
ALTER TABLE "entry_translations" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "entry_translations" ALTER COLUMN "state" SET DEFAULT 'draft'::text;--> statement-breakpoint
DROP TYPE "public"."publication_state";--> statement-breakpoint
CREATE TYPE "public"."publication_state" AS ENUM('public', 'draft', 'hidden');--> statement-breakpoint
ALTER TABLE "entry_translations" ALTER COLUMN "state" SET DEFAULT 'draft'::"public"."publication_state";--> statement-breakpoint
ALTER TABLE "entry_translations" ALTER COLUMN "state" SET DATA TYPE "public"."publication_state" USING "state"::"public"."publication_state";--> statement-breakpoint
ALTER TABLE "entry_translations" DROP COLUMN "password_hash";