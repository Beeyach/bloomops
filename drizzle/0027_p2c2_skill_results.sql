CREATE TABLE `prospect_skill_results` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`result_hash` text NOT NULL,
	`created_by_membership_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`skill_version` text NOT NULL,
	`source_revision` integer NOT NULL,
	`applied_revision` integer NOT NULL,
	`full_report` text NOT NULL,
	`document_json` text NOT NULL,
	`accepted_fields_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`) REFERENCES `bloomops_prospects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`created_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_skill_results_revision_chk" CHECK(typeof(source_revision)='integer' AND source_revision>=1 AND typeof(applied_revision)='integer' AND applied_revision>source_revision),
	CONSTRAINT "prospect_skill_results_hash_chk" CHECK(length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*' AND length(result_hash)=64 AND result_hash NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "prospect_skill_results_json_chk" CHECK(json_valid(document_json) AND json_type(document_json)='object' AND json_valid(accepted_fields_json) AND json_type(accepted_fields_json)='object'),
	CONSTRAINT "prospect_skill_results_report_chk" CHECK(length(trim(full_report)) BETWEEN 1 AND 12000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_skill_results_request_uq` ON `prospect_skill_results` (`workspace_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_skill_results_result_uq` ON `prospect_skill_results` (`workspace_id`,`prospect_id`,`result_hash`);--> statement-breakpoint
CREATE INDEX `prospect_skill_results_list_idx` ON `prospect_skill_results` (`workspace_id`,`prospect_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER prospect_skill_results_no_update BEFORE UPDATE ON prospect_skill_results BEGIN SELECT RAISE(ABORT, 'skill results are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_skill_results_no_delete BEFORE DELETE ON prospect_skill_results BEGIN SELECT RAISE(ABORT, 'skill results are immutable'); END;
