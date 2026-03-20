CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"board_id" uuid,
	"template" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'operator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"secret" text,
	"events" jsonb NOT NULL,
	"board_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "person_threads" ALTER COLUMN "last_message_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "person_threads" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='skill_snapshots' AND column_name='is_installed' AND data_type='text') THEN ALTER TABLE "skill_snapshots" ALTER COLUMN "is_installed" DROP DEFAULT; ALTER TABLE "skill_snapshots" ALTER COLUMN "is_installed" SET DATA TYPE boolean USING is_installed::boolean; ALTER TABLE "skill_snapshots" ALTER COLUMN "is_installed" SET DEFAULT true; END IF; END $$;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "role" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "relationship" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "priorities" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "context" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "channel_handles" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "workspace_path" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "outcome" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_users_id_fk') THEN ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_templates_board_id_boards_id_fk') THEN ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE set null ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhooks_board_id_boards_id_fk') THEN ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_expires_at" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_project_id_projects_id_fk') THEN ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_task_id_tasks_id_fk') THEN ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;