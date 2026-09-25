CREATE TABLE "api_cache" (
	"key" varchar(512) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" varchar(253) NOT NULL,
	"reason" text,
	"source" varchar(16) DEFAULT 'admin' NOT NULL,
	"contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocklist_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"registrable_domain" varchar(253) PRIMARY KEY NOT NULL,
	"first_scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scan_count" integer DEFAULT 0 NOT NULL,
	"latest_scan_id" uuid,
	"cooldown_until" timestamp with time zone,
	"cooldown_reason" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "lookups" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"input" text NOT NULL,
	"host" varchar(253),
	"registrable_domain" varchar(253),
	"scan_id" uuid,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"refused_reason" text,
	"ip" varchar(45),
	"ip_hash" varchar(64),
	"country" varchar(2),
	"user_agent" text,
	"referrer" text,
	"source" varchar(16) DEFAULT 'web' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_technologies" (
	"id" serial PRIMARY KEY NOT NULL,
	"scan_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"category" varchar(80),
	"version" varchar(40),
	"confidence" varchar(8) NOT NULL,
	"implied" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host" varchar(253) NOT NULL,
	"display_host" varchar(253) NOT NULL,
	"registrable_domain" varchar(253) NOT NULL,
	"input_url" text NOT NULL,
	"url" text NOT NULL,
	"final_url" text,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"scanner_version" varchar(32),
	"fingerprints_version" varchar(64),
	"stages" jsonb,
	"gathered" jsonb,
	"report" jsonb,
	"error" text,
	"screenshot_path" text,
	"requester_ip_hash" varchar(64),
	"requester_country" varchar(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"role" varchar(16) NOT NULL,
	"hostname" varchar(128),
	"version" varchar(32),
	"browser" boolean DEFAULT false NOT NULL,
	"current_scan_id" uuid,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"memory_mb" integer,
	"scans_done" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lookups" ADD CONSTRAINT "lookups_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_technologies" ADD CONSTRAINT "scan_technologies_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_cache_expires_idx" ON "api_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "lookups_created_idx" ON "lookups" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lookups_domain_idx" ON "lookups" USING btree ("registrable_domain");--> statement-breakpoint
CREATE INDEX "lookups_ip_hash_idx" ON "lookups" USING btree ("ip_hash");--> statement-breakpoint
CREATE INDEX "scan_tech_scan_idx" ON "scan_technologies" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "scan_tech_slug_idx" ON "scan_technologies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "scan_tech_category_idx" ON "scan_technologies" USING btree ("category");--> statement-breakpoint
CREATE INDEX "scans_host_created_idx" ON "scans" USING btree ("host","created_at");--> statement-breakpoint
CREATE INDEX "scans_url_created_idx" ON "scans" USING btree ("url","created_at");--> statement-breakpoint
CREATE INDEX "scans_domain_idx" ON "scans" USING btree ("registrable_domain");--> statement-breakpoint
CREATE INDEX "scans_created_idx" ON "scans" USING btree ("created_at");