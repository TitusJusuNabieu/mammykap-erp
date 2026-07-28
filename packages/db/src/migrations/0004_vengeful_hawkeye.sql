CREATE TYPE "public"."store_request_status" AS ENUM('pending', 'partially_supplied', 'supplied', 'rejected', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'approve';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'reject';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'access';--> statement-breakpoint
CREATE TABLE "store_request_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"store_request_id" uuid NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"quantity" numeric(12, 3) NOT NULL,
	"requested_unit_price" numeric(18, 4) NOT NULL,
	"requested_line_total" numeric(18, 4) NOT NULL,
	"supplied_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"rejected_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_request_rejection_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"store_request_rejection_id" uuid NOT NULL,
	"store_request_line_id" uuid NOT NULL,
	"quantity_rejected" numeric(12, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_request_rejections" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"store_request_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"rejected_by" uuid NOT NULL,
	"rejected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_request_supplies" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"store_request_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"supplied_by" uuid NOT NULL,
	"supplied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"was_repriced" boolean DEFAULT false NOT NULL,
	"cogs_journal_entry_id" uuid,
	"price_adjustment_journal_entry_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_request_supply_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"store_request_supply_id" uuid NOT NULL,
	"store_request_line_id" uuid NOT NULL,
	"quantity_supplied" numeric(12, 3) NOT NULL,
	"unit_price_charged" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"line_total" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"store_request_number" varchar(50) NOT NULL,
	"sale_id" uuid NOT NULL,
	"status" "store_request_status" DEFAULT 'pending' NOT NULL,
	"expected_collection_date" date NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_closes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"sales_count" integer DEFAULT 0 NOT NULL,
	"sales_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"notes" text,
	"closed_by" uuid NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid,
	"user_id" uuid,
	"method" varchar(10) NOT NULL,
	"path" varchar(500) NOT NULL,
	"status_code" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "expected_collection_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "is_repriced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "repriced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "deposit_grace_period_days" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "store_request_lines" ADD CONSTRAINT "store_request_lines_store_request_id_store_requests_id_fk" FOREIGN KEY ("store_request_id") REFERENCES "public"."store_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_lines" ADD CONSTRAINT "store_request_lines_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_lines" ADD CONSTRAINT "store_request_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_lines" ADD CONSTRAINT "store_request_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_rejection_lines" ADD CONSTRAINT "store_request_rejection_lines_store_request_rejection_id_store_request_rejections_id_fk" FOREIGN KEY ("store_request_rejection_id") REFERENCES "public"."store_request_rejections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_rejection_lines" ADD CONSTRAINT "store_request_rejection_lines_store_request_line_id_store_request_lines_id_fk" FOREIGN KEY ("store_request_line_id") REFERENCES "public"."store_request_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_rejections" ADD CONSTRAINT "store_request_rejections_store_request_id_store_requests_id_fk" FOREIGN KEY ("store_request_id") REFERENCES "public"."store_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_rejections" ADD CONSTRAINT "store_request_rejections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_rejections" ADD CONSTRAINT "store_request_rejections_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_rejections" ADD CONSTRAINT "store_request_rejections_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_supplies" ADD CONSTRAINT "store_request_supplies_store_request_id_store_requests_id_fk" FOREIGN KEY ("store_request_id") REFERENCES "public"."store_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_supplies" ADD CONSTRAINT "store_request_supplies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_supplies" ADD CONSTRAINT "store_request_supplies_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_supplies" ADD CONSTRAINT "store_request_supplies_supplied_by_users_id_fk" FOREIGN KEY ("supplied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_supplies" ADD CONSTRAINT "store_request_supplies_cogs_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("cogs_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_supplies" ADD CONSTRAINT "store_request_supplies_price_adjustment_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("price_adjustment_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_supply_lines" ADD CONSTRAINT "store_request_supply_lines_store_request_supply_id_store_request_supplies_id_fk" FOREIGN KEY ("store_request_supply_id") REFERENCES "public"."store_request_supplies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_request_supply_lines" ADD CONSTRAINT "store_request_supply_lines_store_request_line_id_store_request_lines_id_fk" FOREIGN KEY ("store_request_line_id") REFERENCES "public"."store_request_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_requests" ADD CONSTRAINT "store_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_requests" ADD CONSTRAINT "store_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_requests" ADD CONSTRAINT "store_requests_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_requests" ADD CONSTRAINT "store_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_closes" ADD CONSTRAINT "daily_closes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_closes" ADD CONSTRAINT "daily_closes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_closes" ADD CONSTRAINT "daily_closes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_closes" ADD CONSTRAINT "daily_closes_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "store_requests_org_number_idx" ON "store_requests" USING btree ("organization_id","store_request_number");--> statement-breakpoint
CREATE UNIQUE INDEX "store_requests_sale_idx" ON "store_requests" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "store_requests_status_idx" ON "store_requests" USING btree ("organization_id","branch_id","status");--> statement-breakpoint
CREATE INDEX "store_requests_gate_idx" ON "store_requests" USING btree ("requested_by","status","expected_collection_date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_closes_unique_idx" ON "daily_closes" USING btree ("organization_id","branch_id","user_id","business_date");--> statement-breakpoint
CREATE INDEX "access_logs_org_idx" ON "access_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "access_logs_user_idx" ON "access_logs" USING btree ("user_id","created_at");