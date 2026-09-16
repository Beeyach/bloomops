CREATE TABLE `finance_records` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`service_engagement_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`currency_digits` integer NOT NULL,
	`status` text NOT NULL,
	`due_date` text,
	`paid_date` text,
	`renewal_date` text,
	`provider` text NOT NULL,
	`reference` text NOT NULL,
	`notes` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`request_id` text NOT NULL,
	`creation_hash` text NOT NULL,
	`creator_user_id` text NOT NULL,
	`creator_membership_id` text NOT NULL,
	`updater_membership_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`service_engagement_id`) REFERENCES `service_engagements`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`creator_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`updater_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "finance_records_amount_chk" CHECK(amount_minor >= 0 AND amount_minor <= 1000000000000 AND typeof(amount_minor)='integer' AND currency_digits BETWEEN 0 AND 4),
	CONSTRAINT "finance_records_state_chk" CHECK((kind='invoice' AND status IN ('draft','sent','paid','overdue','void')) OR (kind='payment' AND status IN ('pending','completed','failed','refunded'))),
	CONSTRAINT "finance_records_revision_chk" CHECK(revision >= 1 AND archived IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_records_ws_id_uq` ON `finance_records` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_records_creation_uq` ON `finance_records` (`workspace_id`,`creator_user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `finance_records_list_idx` ON `finance_records` (`workspace_id`,`archived`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `finance_records_client_idx` ON `finance_records` (`workspace_id`,`client_id`,`service_engagement_id`);