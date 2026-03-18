ALTER TABLE "tasks" ADD COLUMN "outcome" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp with time zone;
