ALTER TABLE "customers" ADD COLUMN "nps_score" smallint;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "nps_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flow_executions" ADD COLUMN "variant_id" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "support_ticket_id" text;
