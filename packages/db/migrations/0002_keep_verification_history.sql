ALTER TABLE "verification_request" DROP CONSTRAINT "verification_request_role_id_role_id_fk";
--> statement-breakpoint
ALTER TABLE "verification_request" ALTER COLUMN "role_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE set null ON UPDATE no action;