CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"gateway_agent_id" text,
	"require_approval_for_done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "project_task_deps" (
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	CONSTRAINT "project_task_deps_project_id_task_id_depends_on_task_id_unique" UNIQUE("project_id","task_id","depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"execution_mode" text DEFAULT 'sequential' NOT NULL,
	CONSTRAINT "project_tasks_project_id_task_id_unique" UNIQUE("project_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"progress_pct" smallint DEFAULT 0 NOT NULL,
	"target_date" timestamp with time zone,
	"orchestrator_agent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"task_id" uuid,
	"agent_id" text NOT NULL,
	"action_type" text NOT NULL,
	"payload" jsonb,
	"confidence" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	CONSTRAINT "task_dependencies_task_id_depends_on_task_id_unique" UNIQUE("task_id","depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'inbox' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"assigned_agent_id" text,
	"due_at" timestamp with time zone,
	"in_progress_at" timestamp with time zone,
	"auto_created" boolean DEFAULT false NOT NULL,
	"auto_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_watermarks" (
	"agent_id" text NOT NULL,
	"session_id" text NOT NULL,
	"byte_offset" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_watermarks_agent_id_session_id_unique" UNIQUE("agent_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "token_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"session_id" text NOT NULL,
	"task_id" uuid,
	"project_id" uuid,
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" text DEFAULT '0' NOT NULL,
	"turn_timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_flow_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_agent_id" text NOT NULL,
	"to_agent_id" text NOT NULL,
	"message_type" text NOT NULL,
	"session_id" text,
	"task_id" uuid,
	"token_cost" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"raw_log_line" text
);
--> statement-breakpoint
CREATE TABLE "agent_skills" (
	"agent_id" text NOT NULL,
	"skill_id" text NOT NULL,
	CONSTRAINT "agent_skills_agent_id_skill_id_unique" UNIQUE("agent_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "skill_snapshots" (
	"skill_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"skill_type" text DEFAULT 'skill' NOT NULL,
	"is_installed" text DEFAULT 'true' NOT NULL,
	"config_json" jsonb,
	"required_env" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_events" ADD CONSTRAINT "token_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_events" ADD CONSTRAINT "token_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_flow_edges" ADD CONSTRAINT "agent_flow_edges_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_skill_id_skill_snapshots_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill_snapshots"("skill_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_tasks_position" ON "project_tasks" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "idx_token_events_agent_turn" ON "token_events" USING btree ("agent_id","turn_timestamp");--> statement-breakpoint
CREATE INDEX "idx_token_events_session" ON "token_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_token_events_project" ON "token_events" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_flow_from_agent" ON "agent_flow_edges" USING btree ("from_agent_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_flow_to_agent" ON "agent_flow_edges" USING btree ("to_agent_id","occurred_at");