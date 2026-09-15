CREATE TABLE "delete_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"relinked" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "delete_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "delete_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "delete_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "delete_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "delete_batches" ADD CONSTRAINT "delete_batches_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delete_batches_org_id_idx" ON "delete_batches" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "clients_delete_batch_idx" ON "clients" USING btree ("delete_batch_id") WHERE "clients"."delete_batch_id" is not null;--> statement-breakpoint
CREATE INDEX "projects_delete_batch_idx" ON "projects" USING btree ("delete_batch_id") WHERE "projects"."delete_batch_id" is not null;--> statement-breakpoint
CREATE INDEX "tasks_delete_batch_idx" ON "tasks" USING btree ("delete_batch_id") WHERE "tasks"."delete_batch_id" is not null;--> statement-breakpoint
CREATE INDEX "time_entries_delete_batch_idx" ON "time_entries" USING btree ("delete_batch_id") WHERE "time_entries"."delete_batch_id" is not null;