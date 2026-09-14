ALTER TABLE `prospect_google_connections` ADD `check_id` text;--> statement-breakpoint
ALTER TABLE `prospect_google_connections` ADD `check_expires_at` text;--> statement-breakpoint
ALTER TABLE `prospect_google_connections` ADD `checked_at` text;--> statement-breakpoint
ALTER TABLE `prospect_google_connections` ADD `check_status` text DEFAULT 'unchecked' NOT NULL;