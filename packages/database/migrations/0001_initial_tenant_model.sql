CREATE TABLE "request_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"ai_run_id" uuid NOT NULL,
	"schema_version" varchar(50) NOT NULL,
	"intent" varchar(50) NOT NULL,
	"confidence_basis_points" integer NOT NULL,
	"proposed_route" varchar(50) NOT NULL,
	"effective_route" varchar(50) NOT NULL,
	"requires_review" boolean NOT NULL,
	"customer" jsonb NOT NULL,
	"service_request" jsonb NOT NULL,
	"urgency_indicators" jsonb NOT NULL,
	"missing_information" jsonb NOT NULL,
	"evidence_references" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_assessments_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "request_assessments_tenant_ai_run_key" UNIQUE("tenant_id","ai_run_id"),
	CONSTRAINT "request_assessments_schema_version_check" CHECK ("request_assessments"."schema_version" = 'request-assessment-v1'),
	CONSTRAINT "request_assessments_confidence_basis_points_check" CHECK ("request_assessments"."confidence_basis_points" BETWEEN 0 AND 10000),
	CONSTRAINT "request_assessments_intent_check" CHECK ("request_assessments"."intent" IN ('new_service_request', 'support_request', 'billing_request', 'complaint', 'cancellation_request', 'general_inquiry', 'unrelated', 'unknown')),
	CONSTRAINT "request_assessments_proposed_route_check" CHECK ("request_assessments"."proposed_route" IN ('sales', 'support', 'billing', 'operations', 'manual_review', 'reject_unrelated')),
	CONSTRAINT "request_assessments_effective_route_check" CHECK ("request_assessments"."effective_route" IN ('sales', 'support', 'billing', 'operations', 'manual_review', 'reject_unrelated')),
	CONSTRAINT "request_assessments_customer_object_check" CHECK (jsonb_typeof("request_assessments"."customer") = 'object'),
	CONSTRAINT "request_assessments_service_request_object_check" CHECK (jsonb_typeof("request_assessments"."service_request") = 'object'),
	CONSTRAINT "request_assessments_urgency_array_check" CHECK (jsonb_typeof("request_assessments"."urgency_indicators") = 'array'),
	CONSTRAINT "request_assessments_missing_information_array_check" CHECK (jsonb_typeof("request_assessments"."missing_information") = 'array'),
	CONSTRAINT "request_assessments_evidence_references_array_check" CHECK (jsonb_typeof("request_assessments"."evidence_references") = 'array'),
	CONSTRAINT "request_assessments_json_size_check" CHECK (octet_length("request_assessments"."customer"::text) + octet_length("request_assessments"."service_request"::text) + octet_length("request_assessments"."urgency_indicators"::text) + octet_length("request_assessments"."missing_information"::text) + octet_length("request_assessments"."evidence_references"::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "ai_runs" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "ai_runs" SET "status" = 'running' WHERE "status" = 'queued';--> statement-breakpoint
ALTER TABLE "ai_runs" ALTER COLUMN "status" SET DEFAULT 'running'::text;--> statement-breakpoint
DROP TYPE "public"."ai_run_status";--> statement-breakpoint
CREATE TYPE "public"."ai_run_status" AS ENUM('running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
ALTER TABLE "ai_runs" ALTER COLUMN "status" SET DEFAULT 'running'::"public"."ai_run_status";--> statement-breakpoint
ALTER TABLE "ai_runs" ALTER COLUMN "status" SET DATA TYPE "public"."ai_run_status" USING "status"::"public"."ai_run_status";--> statement-breakpoint
ALTER TABLE "request_assessments" ADD CONSTRAINT "request_assessments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "request_assessments" ADD CONSTRAINT "request_assessments_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id","request_id") REFERENCES "public"."requests"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "request_assessments" ADD CONSTRAINT "request_assessments_tenant_id_ai_run_id_fkey" FOREIGN KEY ("tenant_id","ai_run_id") REFERENCES "public"."ai_runs"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "request_assessments_tenant_request_created_at_idx" ON "request_assessments" USING btree ("tenant_id","request_id","created_at");
