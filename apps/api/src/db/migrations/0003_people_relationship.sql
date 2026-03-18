ALTER TABLE "people" ADD COLUMN "role" text;
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "relationship" text;
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "priorities" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "context" text;
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "channel_handles" jsonb DEFAULT '{}'::jsonb;
