CREATE TABLE `prospect_outreach_approvals` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`draft_id` text NOT NULL,
	`draft_revision` integer NOT NULL,
	`profile_revision` integer NOT NULL,
	`sender_revision` integer NOT NULL,
	`approved_by_membership_id` text NOT NULL,
	`approver_updated_at` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`draft_id`) REFERENCES `prospect_outreach_drafts`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`approved_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_outreach_approvals_revision_chk" CHECK(typeof(draft_revision)='integer' AND draft_revision>=1 AND typeof(profile_revision)='integer' AND profile_revision>=1 AND typeof(sender_revision)='integer' AND sender_revision>=1),
	CONSTRAINT "prospect_outreach_approvals_snapshot_chk" CHECK(json_valid(snapshot_json) AND json_type(snapshot_json)='object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_outreach_approvals_version_uq` ON `prospect_outreach_approvals` (`workspace_id`,`draft_id`,`draft_revision`,`profile_revision`,`sender_revision`,`approved_by_membership_id`,`approver_updated_at`);--> statement-breakpoint
CREATE TABLE `prospect_outreach_drafts` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`revision` integer NOT NULL,
	`profile_revision` integer NOT NULL,
	`source_result_id` text,
	`recipient` text,
	`time_zone` text,
	`subject` text,
	`intro` text,
	`follow_up_2` text,
	`follow_up_3` text,
	`updated_by_membership_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`) REFERENCES `bloomops_prospects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`source_result_id`) REFERENCES `prospect_skill_results`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`updated_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_outreach_drafts_revision_chk" CHECK(typeof(revision)='integer' AND revision>=1 AND typeof(profile_revision)='integer' AND profile_revision>=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_outreach_drafts_ws_id_uq` ON `prospect_outreach_drafts` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_outreach_drafts_prospect_uq` ON `prospect_outreach_drafts` (`workspace_id`,`prospect_id`);--> statement-breakpoint
CREATE INDEX `prospect_outreach_drafts_list_idx` ON `prospect_outreach_drafts` (`workspace_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `prospect_senders` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`revision` integer NOT NULL,
	`updated_by_membership_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`updated_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_senders_provider_chk" CHECK(provider='google_workspace'),
	CONSTRAINT "prospect_senders_revision_chk" CHECK(typeof(revision)='integer' AND revision>=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_skill_results_ws_id_uq` ON `prospect_skill_results` (`workspace_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER prospect_outreach_approvals_no_update BEFORE UPDATE ON prospect_outreach_approvals BEGIN SELECT RAISE(ABORT,'Outreach approvals are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_outreach_approvals_no_delete BEFORE DELETE ON prospect_outreach_approvals BEGIN SELECT RAISE(ABORT,'Outreach approvals are immutable'); END;
