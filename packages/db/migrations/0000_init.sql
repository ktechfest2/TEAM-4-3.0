CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('admin', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."answer" AS ENUM('yes', 'no', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."call_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('verifying', 'published');--> statement-breakpoint
CREATE TYPE "public"."checkin_event" AS ENUM('arrived', 'materials_received', 'voting_started', 'delay', 'issue', 'closed');--> statement-breakpoint
CREATE TYPE "public"."claim_category" AS ENUM('violence', 'vote_buying', 'pu_relocated', 'officials_absent', 'materials_missing', 'election_postponed', 'result_tampering', 'other');--> statement-breakpoint
CREATE TYPE "public"."outbound_decision" AS ENUM('dialled', 'skipped_paused', 'skipped_demo_contact', 'skipped_not_allowlisted', 'skipped_cooldown', 'skipped_quiet_hours', 'skipped_no_phone', 'error');--> statement-breakpoint
CREATE TYPE "public"."outbound_purpose" AS ENUM('verify', 'case_alert', 'notice_alert', 'go_now', 'late_official', 'late_supervisor');--> statement-breakpoint
CREATE TYPE "public"."role_kind" AS ENUM('verifier', 'official', 'supervisor');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('confirmed', 'false', 'unverified');--> statement-breakpoint
CREATE TABLE "admin_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"script_en" text NOT NULL,
	"script_pcm" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"aethex_call_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aethex_call_id" text NOT NULL,
	"agent" text,
	"direction" "call_direction",
	"person_id" uuid,
	"purpose" "outbound_purpose",
	"ref_id" uuid,
	"status" text,
	"duration_s" integer,
	"cost_cents" integer,
	"transcript" jsonb,
	"transcript_text" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pu_id" uuid NOT NULL,
	"person_id" uuid,
	"event" "checkin_event" NOT NULL,
	"note" text,
	"eta_minutes" integer,
	"source" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "claim_category" NOT NULL,
	"claim_en" text NOT NULL,
	"ward_id" uuid,
	"pu_id" uuid,
	"status" "case_status" DEFAULT 'verifying' NOT NULL,
	"verdict" "verdict",
	"confidence" double precision,
	"basis" text,
	"deadline_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"overridden_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"category" "claim_category" NOT NULL,
	"claim_en" text NOT NULL,
	"verdict" "verdict" NOT NULL,
	"script_en" text NOT NULL,
	"script_pcm" text NOT NULL,
	"ward_id" uuid,
	"pu_id" uuid,
	"valid_until" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pu_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"new_pu_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"purpose" "outbound_purpose" NOT NULL,
	"ref_id" uuid,
	"decision" "outbound_decision" NOT NULL,
	"aethex_call_id" text,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"phone_hash" text NOT NULL,
	"phone_enc" text NOT NULL,
	"phone_last4" text NOT NULL,
	"language_pref" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"is_team" boolean DEFAULT false NOT NULL,
	"consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "polling_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ward_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"landmark" text,
	"lat" double precision,
	"lng" double precision,
	"status" text DEFAULT 'active' NOT NULL,
	"relocated_to_id" uuid,
	"is_demo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"person_id" uuid,
	"aethex_call_id" text,
	"claim_en" text NOT NULL,
	"raw_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "role_kind" NOT NULL,
	"ward_id" uuid NOT NULL,
	"pu_id" uuid,
	"affiliation" text,
	"reputation" double precision DEFAULT 1 NOT NULL,
	"pin_hash" text,
	"pin_failed" integer DEFAULT 0 NOT NULL,
	"pin_locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"pu_id" uuid NOT NULL,
	"needs" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"go_now_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"outbound_paused" boolean DEFAULT false NOT NULL,
	"election_day" boolean DEFAULT false NOT NULL,
	"opening_deadline" text DEFAULT '07:45' NOT NULL,
	"verdict_min_answers" integer DEFAULT 2 NOT NULL,
	"verdict_threshold" double precision DEFAULT 0.7 NOT NULL,
	"case_deadline_minutes" integer DEFAULT 10 NOT NULL,
	"fact_valid_hours" integer DEFAULT 3 NOT NULL,
	"quiet_start" text DEFAULT '21:00' NOT NULL,
	"quiet_end" text DEFAULT '07:00' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"answer" "answer",
	"detail" text,
	"weight" double precision DEFAULT 1 NOT NULL,
	"affiliation" text,
	"aethex_call_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" text NOT NULL,
	"lga" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call" ADD CONSTRAINT "call_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_pu_id_polling_unit_id_fk" FOREIGN KEY ("pu_id") REFERENCES "public"."polling_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_case" ADD CONSTRAINT "claim_case_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_case" ADD CONSTRAINT "claim_case_pu_id_polling_unit_id_fk" FOREIGN KEY ("pu_id") REFERENCES "public"."polling_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact" ADD CONSTRAINT "fact_case_id_claim_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."claim_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact" ADD CONSTRAINT "fact_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact" ADD CONSTRAINT "fact_pu_id_polling_unit_id_fk" FOREIGN KEY ("pu_id") REFERENCES "public"."polling_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice" ADD CONSTRAINT "notice_pu_id_polling_unit_id_fk" FOREIGN KEY ("pu_id") REFERENCES "public"."polling_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice" ADD CONSTRAINT "notice_new_pu_id_polling_unit_id_fk" FOREIGN KEY ("new_pu_id") REFERENCES "public"."polling_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_attempt" ADD CONSTRAINT "outbound_attempt_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polling_unit" ADD CONSTRAINT "polling_unit_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_case_id_claim_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."claim_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_pu_id_polling_unit_id_fk" FOREIGN KEY ("pu_id") REFERENCES "public"."polling_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_pu_id_polling_unit_id_fk" FOREIGN KEY ("pu_id") REFERENCES "public"."polling_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_case_id_claim_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."claim_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_kind_ref_person_uq" ON "alert" USING btree ("kind","ref_id","person_id");--> statement-breakpoint
CREATE INDEX "alert_call_idx" ON "alert" USING btree ("aethex_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "call_aethex_uq" ON "call" USING btree ("aethex_call_id");--> statement-breakpoint
CREATE INDEX "call_created_idx" ON "call" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "checkin_pu_at_idx" ON "checkin" USING btree ("pu_id","at");--> statement-breakpoint
CREATE INDEX "case_area_idx" ON "claim_case" USING btree ("ward_id","category","status");--> statement-breakpoint
CREATE INDEX "case_claim_trgm_idx" ON "claim_case" USING gin ("claim_en" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "fact_area_idx" ON "fact" USING btree ("ward_id","category");--> statement-breakpoint
CREATE INDEX "fact_claim_trgm_idx" ON "fact" USING gin ("claim_en" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "oa_person_at_idx" ON "outbound_attempt" USING btree ("person_id","at");--> statement-breakpoint
CREATE INDEX "oa_at_idx" ON "outbound_attempt" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "person_phone_hash_uq" ON "person" USING btree ("phone_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "pu_code_uq" ON "polling_unit" USING btree ("code");--> statement-breakpoint
CREATE INDEX "pu_ward_idx" ON "polling_unit" USING btree ("ward_id");--> statement-breakpoint
CREATE INDEX "report_case_idx" ON "report" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "report_person_idx" ON "report" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "role_ward_kind_idx" ON "role" USING btree ("ward_id","kind");--> statement-breakpoint
CREATE INDEX "role_pu_idx" ON "role" USING btree ("pu_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_person_pu_uq" ON "subscription" USING btree ("person_id","pu_id");--> statement-breakpoint
CREATE INDEX "subscription_pu_idx" ON "subscription" USING btree ("pu_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vr_case_person_uq" ON "verification_request" USING btree ("case_id","person_id");--> statement-breakpoint
CREATE INDEX "vr_call_idx" ON "verification_request" USING btree ("aethex_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ward_code_uq" ON "ward" USING btree ("code");