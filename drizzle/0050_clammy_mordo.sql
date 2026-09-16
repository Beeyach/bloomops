ALTER TABLE `client_report_drafts` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `client_report_drafts` ADD `publication_floor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `client_report_drafts` ADD `archive_request_id` text;--> statement-breakpoint
ALTER TABLE `client_report_drafts` ADD `archive_intent_hash` text;