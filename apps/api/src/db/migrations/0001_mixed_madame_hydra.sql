CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"avatar_url" text,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_projects" (
	"person_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "person_projects_person_id_project_id_pk" PRIMARY KEY("person_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "person_tasks" (
	"person_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	CONSTRAINT "person_tasks_person_id_task_id_pk" PRIMARY KEY("person_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "person_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"channel" text NOT NULL,
	"thread_id" text,
	"summary" text,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_projects" ADD CONSTRAINT "person_projects_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_projects" ADD CONSTRAINT "person_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tasks" ADD CONSTRAINT "person_tasks_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tasks" ADD CONSTRAINT "person_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_threads" ADD CONSTRAINT "person_threads_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "people_source_idx" ON "people" USING btree ("source");--> statement-breakpoint
CREATE INDEX "people_email_idx" ON "people" USING btree ("email");