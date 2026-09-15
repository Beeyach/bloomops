CREATE TABLE `client_report_publications` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`report_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`kind` text NOT NULL,
	`draft_revision` integer NOT NULL,
	`snapshot_json` text,
	`snapshot_hash` text,
	`actor_membership_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`intent_hash` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`report_id`) REFERENCES `client_report_drafts`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`actor_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "client_report_publication_sequence_ck" CHECK(typeof(sequence)='integer' AND sequence>=1 AND typeof(draft_revision)='integer' AND draft_revision>=1),
	CONSTRAINT "client_report_publication_kind_ck" CHECK((kind='publish' AND snapshot_json IS NOT NULL AND snapshot_hash IS NOT NULL AND json_valid(snapshot_json)) OR (kind='withdraw' AND snapshot_json IS NULL AND snapshot_hash IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_report_publication_ws_id_uq` ON `client_report_publications` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `client_report_publication_sequence_uq` ON `client_report_publications` (`workspace_id`,`report_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `client_report_publication_request_uq` ON `client_report_publications` (`workspace_id`,`actor_user_id`,`request_id`);--> statement-breakpoint
ALTER TABLE `client_report_drafts` ADD `client_summary` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `client_report_drafts` ADD `work_completed` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `client_report_drafts` ADD `limitations` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `client_report_drafts` ADD `next_actions` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER client_report_publications_no_update BEFORE UPDATE ON client_report_publications BEGIN SELECT RAISE(ABORT,'published report history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER client_report_publications_no_delete BEFORE DELETE ON client_report_publications BEGIN SELECT RAISE(ABORT,'published report history is immutable'); END;
