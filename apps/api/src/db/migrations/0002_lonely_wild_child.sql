CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid,
	"task_id" uuid,
	"agent_id" text,
	"event_type" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "board_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"content" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"is_chat" boolean DEFAULT false NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_task_custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	CONSTRAINT "board_task_custom_fields_board_id_definition_id_unique" UNIQUE("board_id","definition_id")
);
--> statement-breakpoint
CREATE TABLE "skill_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb,
	"mcp_servers" jsonb DEFAULT '{}'::jsonb,
	"install_status" text DEFAULT 'available' NOT NULL,
	"install_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_packs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text DEFAULT '6e7681' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "task_custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"field_type" text DEFAULT 'text' NOT NULL,
	"ui_visibility" text DEFAULT 'always' NOT NULL,
	"description" text,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_custom_field_definitions_field_key_unique" UNIQUE("field_key")
);
--> statement-breakpoint
CREATE TABLE "task_custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_custom_field_values_task_id_definition_id_unique" UNIQUE("task_id","definition_id")
);
--> statement-breakpoint
CREATE TABLE "task_planning_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb,
	"planning_spec" jsonb,
	"suggested_agents" jsonb,
	"session_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_tags" (
	"task_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "task_tags_task_id_tag_id_unique" UNIQUE("task_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "rubric_scores" jsonb;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "board_group_id" uuid;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "objective" text;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "target_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "goal_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "require_review_before_done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "comment_required_for_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "block_status_changes_with_pending_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "only_lead_can_change_status" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "max_agents" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_memory" ADD CONSTRAINT "board_memory_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_task_custom_fields" ADD CONSTRAINT "board_task_custom_fields_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_task_custom_fields" ADD CONSTRAINT "board_task_custom_fields_definition_id_task_custom_field_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."task_custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_custom_field_values" ADD CONSTRAINT "task_custom_field_values_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_custom_field_values" ADD CONSTRAINT "task_custom_field_values_definition_id_task_custom_field_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."task_custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_planning_sessions" ADD CONSTRAINT "task_planning_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_planning_sessions" ADD CONSTRAINT "task_planning_sessions_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_board_created" ON "activity_events" USING btree ("board_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_activity_task_created" ON "activity_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_activity_event_type_created" ON "activity_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_board_memory_board_created" ON "board_memory" USING btree ("board_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_planning_task_status" ON "task_planning_sessions" USING btree ("task_id","status");--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_board_group_id_board_groups_id_fk" FOREIGN KEY ("board_group_id") REFERENCES "public"."board_groups"("id") ON DELETE set null ON UPDATE no action;