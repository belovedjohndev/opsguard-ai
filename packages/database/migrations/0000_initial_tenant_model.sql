CREATE TYPE "public"."ai_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'operations_manager', 'reviewer', 'operator', 'auditor');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."request_source_type" AS ENUM('form', 'email', 'webhook', 'service_account');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('received', 'assessing', 'needs_information', 'pending_review', 'rejected', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(63) NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_key" UNIQUE("slug"),
	CONSTRAINT "tenants_slug_format_check" CHECK ("tenants"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "tenants_name_not_blank_check" CHECK (btrim("tenants"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email"),
	CONSTRAINT "users_email_normalized_check" CHECK ("users"."email" = lower(btrim("users"."email")) AND position('@' in "users"."email") > 1)
);
--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_memberships_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "tenant_memberships_tenant_id_user_id_key" UNIQUE("tenant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_type" "request_source_type" NOT NULL,
	"source_reference" varchar(255) NOT NULL,
	"created_by_membership_id" uuid,
	"status" "request_status" DEFAULT 'received' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "requests_tenant_id_source_key" UNIQUE("tenant_id","source_type","source_reference"),
	CONSTRAINT "requests_source_reference_not_blank_check" CHECK (btrim("requests"."source_reference") <> '')
);
--> statement-breakpoint
CREATE TABLE "request_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"is_initial" boolean DEFAULT false NOT NULL,
	"previous_status" "request_status",
	"next_status" "request_status" NOT NULL,
	"changed_by_membership_id" uuid,
	"changed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_status_history_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "request_status_history_initial_previous_status_check" CHECK ("request_status_history"."is_initial" = ("request_status_history"."previous_status" IS NULL)),
	CONSTRAINT "request_status_history_status_changed_check" CHECK ("request_status_history"."previous_status" IS NULL OR "request_status_history"."previous_status" <> "request_status_history"."next_status")
);
--> statement-breakpoint
CREATE TABLE "model_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"configuration_key" varchar(100) NOT NULL,
	"provider" varchar(100) NOT NULL,
	"model" varchar(200) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_configurations_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "model_configurations_tenant_configuration_key_key" UNIQUE("tenant_id","configuration_key"),
	CONSTRAINT "model_configurations_configuration_key_format_check" CHECK ("model_configurations"."configuration_key" ~ '^[a-z][a-z0-9_.-]{1,99}$'),
	CONSTRAINT "model_configurations_provider_not_blank_check" CHECK (btrim("model_configurations"."provider") <> ''),
	CONSTRAINT "model_configurations_model_not_blank_check" CHECK (btrim("model_configurations"."model") <> '')
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"prompt_key" varchar(100) NOT NULL,
	"version" integer NOT NULL,
	"content_sha256" varchar(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_versions_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "prompt_versions_tenant_key_version_key" UNIQUE("tenant_id","prompt_key","version"),
	CONSTRAINT "prompt_versions_prompt_key_format_check" CHECK ("prompt_versions"."prompt_key" ~ '^[a-z][a-z0-9_.-]{1,99}$'),
	CONSTRAINT "prompt_versions_version_positive_check" CHECK ("prompt_versions"."version" > 0),
	CONSTRAINT "prompt_versions_content_sha256_format_check" CHECK ("prompt_versions"."content_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"model_configuration_id" uuid NOT NULL,
	"status" "ai_run_status" DEFAULT 'queued' NOT NULL,
	"provider_request_id" varchar(255),
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"error_classification" varchar(100),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp (3) with time zone,
	"completed_at" timestamp (3) with time zone,
	CONSTRAINT "ai_runs_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "ai_runs_input_tokens_nonnegative_check" CHECK ("ai_runs"."input_tokens" IS NULL OR "ai_runs"."input_tokens" >= 0),
	CONSTRAINT "ai_runs_output_tokens_nonnegative_check" CHECK ("ai_runs"."output_tokens" IS NULL OR "ai_runs"."output_tokens" >= 0),
	CONSTRAINT "ai_runs_latency_ms_nonnegative_check" CHECK ("ai_runs"."latency_ms" IS NULL OR "ai_runs"."latency_ms" >= 0),
	CONSTRAINT "ai_runs_timeline_check" CHECK (("ai_runs"."started_at" IS NULL OR "ai_runs"."started_at" >= "ai_runs"."created_at")
        AND ("ai_runs"."completed_at" IS NULL OR
          ("ai_runs"."started_at" IS NOT NULL AND "ai_runs"."completed_at" >= "ai_runs"."started_at")))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_membership_id" uuid,
	"event_type" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_events_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "audit_events_event_type_format_check" CHECK ("audit_events"."event_type" ~ '^[a-z][a-z0-9_.-]{2,99}$'),
	CONSTRAINT "audit_events_entity_type_request_check" CHECK ("audit_events"."entity_type" = 'request'),
	CONSTRAINT "audit_events_metadata_object_check" CHECK (jsonb_typeof("audit_events"."metadata") = 'object'),
	CONSTRAINT "audit_events_metadata_size_check" CHECK (octet_length("audit_events"."metadata"::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id","request_id") REFERENCES "public"."requests"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_tenant_id_changed_by_membership_id_fkey" FOREIGN KEY ("tenant_id","changed_by_membership_id") REFERENCES "public"."tenant_memberships"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_tenant_id_created_by_membership_id_fkey" FOREIGN KEY ("tenant_id","created_by_membership_id") REFERENCES "public"."tenant_memberships"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id","request_id") REFERENCES "public"."requests"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tenant_id_prompt_version_id_fkey" FOREIGN KEY ("tenant_id","prompt_version_id") REFERENCES "public"."prompt_versions"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tenant_id_model_configuration_id_fkey" FOREIGN KEY ("tenant_id","model_configuration_id") REFERENCES "public"."model_configurations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "model_configurations" ADD CONSTRAINT "model_configurations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_actor_membership_id_fkey" FOREIGN KEY ("tenant_id","actor_membership_id") REFERENCES "public"."tenant_memberships"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_entity_id_fkey" FOREIGN KEY ("tenant_id","entity_id") REFERENCES "public"."requests"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "tenant_memberships_user_id_idx" ON "tenant_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tenant_memberships_tenant_id_status_idx" ON "tenant_memberships" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "request_status_history_one_initial_per_request_idx" ON "request_status_history" USING btree ("tenant_id","request_id") WHERE "request_status_history"."is_initial";--> statement-breakpoint
CREATE INDEX "request_status_history_tenant_request_changed_at_idx" ON "request_status_history" USING btree ("tenant_id","request_id","changed_at");--> statement-breakpoint
CREATE INDEX "request_status_history_tenant_actor_idx" ON "request_status_history" USING btree ("tenant_id","changed_by_membership_id");--> statement-breakpoint
CREATE INDEX "requests_tenant_id_status_created_at_idx" ON "requests" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "requests_tenant_id_creator_idx" ON "requests" USING btree ("tenant_id","created_by_membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_runs_tenant_model_provider_request_key" ON "ai_runs" USING btree ("tenant_id","model_configuration_id","provider_request_id") WHERE "ai_runs"."provider_request_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_runs_tenant_request_created_at_idx" ON "ai_runs" USING btree ("tenant_id","request_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_runs_tenant_prompt_version_idx" ON "ai_runs" USING btree ("tenant_id","prompt_version_id");--> statement-breakpoint
CREATE INDEX "ai_runs_tenant_model_configuration_idx" ON "ai_runs" USING btree ("tenant_id","model_configuration_id");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_occurred_at_idx" ON "audit_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_entity_occurred_at_idx" ON "audit_events" USING btree ("tenant_id","entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_actor_idx" ON "audit_events" USING btree ("tenant_id","actor_membership_id");
