CREATE TABLE `prospect_csv_batches` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`file_hash` text NOT NULL,
	`file_name` text NOT NULL,
	`created_by_membership_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`created_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_csv_batches_hash_chk" CHECK(length(request_hash)=64 AND length(file_hash)=64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_csv_batches_ws_id_uq` ON `prospect_csv_batches` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_csv_batches_request_uq` ON `prospect_csv_batches` (`workspace_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_csv_batches_file_uq` ON `prospect_csv_batches` (`workspace_id`,`file_hash`);--> statement-breakpoint
CREATE TABLE `prospect_csv_rows` (
	`workspace_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`prospect_id` text,
	`status` text NOT NULL,
	`fields_json` text NOT NULL,
	`reason` text,
	PRIMARY KEY(`workspace_id`, `batch_id`, `ordinal`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`batch_id`) REFERENCES `prospect_csv_batches`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`) REFERENCES `bloomops_prospects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_csv_rows_status_chk" CHECK((status='added' AND prospect_id IS NOT NULL) OR (status IN ('skipped','invalid') AND prospect_id IS NULL)),
	CONSTRAINT "prospect_csv_rows_json_chk" CHECK(json_valid(fields_json))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_csv_rows_prospect_uq` ON `prospect_csv_rows` (`workspace_id`,`prospect_id`);--> statement-breakpoint
CREATE INDEX `bloomops_prospects_created_idx` ON `bloomops_prospects` (`workspace_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `bloomops_prospects_email_idx` ON `bloomops_prospects` (`workspace_id`,`public_email`);--> statement-breakpoint
CREATE TRIGGER prospect_csv_batches_immutable_update BEFORE UPDATE ON prospect_csv_batches BEGIN SELECT RAISE(ABORT,'CSV receipt is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_csv_batches_immutable_delete BEFORE DELETE ON prospect_csv_batches BEGIN SELECT RAISE(ABORT,'CSV receipt is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_csv_rows_immutable_update BEFORE UPDATE ON prospect_csv_rows BEGIN SELECT RAISE(ABORT,'CSV row receipt is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_csv_rows_immutable_delete BEFORE DELETE ON prospect_csv_rows BEGIN SELECT RAISE(ABORT,'CSV row receipt is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_contact_facts_immutable_update BEFORE UPDATE ON activity_events WHEN OLD.event_type IN ('PROSPECT_MANUAL_CONTACT','PROSPECT_INTEREST_RECORDED','PROSPECT_REPLY_RESOLVED') BEGIN SELECT RAISE(ABORT,'Contact fact is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_contact_facts_immutable_delete BEFORE DELETE ON activity_events WHEN OLD.event_type IN ('PROSPECT_MANUAL_CONTACT','PROSPECT_INTEREST_RECORDED','PROSPECT_REPLY_RESOLVED') BEGIN SELECT RAISE(ABORT,'Contact fact is immutable'); END;
