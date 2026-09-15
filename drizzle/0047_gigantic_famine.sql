CREATE TABLE `client_report_drafts` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`service_engagement_id` text NOT NULL,
	`template_id` text NOT NULL,
	`template_version` integer NOT NULL,
	`title` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`timezone` text NOT NULL,
	`channel` text NOT NULL,
	`account_label` text NOT NULL,
	`scope_label` text NOT NULL,
	`commentary` text NOT NULL,
	`creator_membership_id` text NOT NULL,
	`creator_user_id` text NOT NULL,
	`updater_membership_id` text NOT NULL,
	`updater_user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`creation_hash` text NOT NULL,
	`mutation_id` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updater_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`service_engagement_id`) REFERENCES `service_engagements`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`creator_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`updater_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "client_report_template_ck" CHECK(template_version=1 AND template_id IN ('ghl_campaign','social')),
	CONSTRAINT "client_report_revision_ck" CHECK(typeof(revision)='integer' AND revision>=1),
	CONSTRAINT "client_report_period_ck" CHECK(period_start<=period_end)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_report_ws_id_uq` ON `client_report_drafts` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `client_report_request_uq` ON `client_report_drafts` (`workspace_id`,`creator_user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `client_report_list_idx` ON `client_report_drafts` (`workspace_id`,`client_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `client_report_metrics` (
	`workspace_id` text NOT NULL,
	`report_id` text NOT NULL,
	`metric_key` text NOT NULL,
	`state` text NOT NULL,
	`value` integer,
	`source_note` text NOT NULL,
	`collected_at` text,
	PRIMARY KEY(`workspace_id`, `report_id`, `metric_key`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`report_id`) REFERENCES `client_report_drafts`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "client_report_metric_value_ck" CHECK((state='value' AND value IS NOT NULL AND typeof(value)='integer' AND value BETWEEN 0 AND 1000000000) OR (state IN ('missing','unavailable','not_tracked') AND value IS NULL))
);

--> statement-breakpoint
CREATE TRIGGER client_report_identity_immutable BEFORE UPDATE ON client_report_drafts
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.client_id IS NOT OLD.client_id OR NEW.service_engagement_id IS NOT OLD.service_engagement_id OR NEW.template_id IS NOT OLD.template_id OR NEW.template_version IS NOT OLD.template_version OR NEW.creator_membership_id IS NOT OLD.creator_membership_id OR NEW.creator_user_id IS NOT OLD.creator_user_id OR NEW.request_id IS NOT OLD.request_id OR NEW.creation_hash IS NOT OLD.creation_hash OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT,'Report identity is immutable'); END;
