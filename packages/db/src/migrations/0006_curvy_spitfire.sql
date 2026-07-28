CREATE TYPE "public"."quote_source" AS ENUM('staff', 'storefront');--> statement-breakpoint
ALTER TYPE "public"."quote_status" ADD VALUE 'requested' BEFORE 'sent';--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "source" "quote_source" DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;