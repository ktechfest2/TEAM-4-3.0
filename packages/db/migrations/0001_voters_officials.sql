ALTER TABLE "system_settings" ALTER COLUMN "verdict_min_answers" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "system_settings" ALTER COLUMN "fact_valid_hours" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "kind" text DEFAULT 'voter' NOT NULL;
--> statement-breakpoint
UPDATE "system_settings" SET "verdict_min_answers" = 1, "fact_valid_hours" = 1;