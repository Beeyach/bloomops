CREATE TABLE `prospect_delivery_identities` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`delivery_id` text NOT NULL,
	`account_email` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`provider_thread_id` text NOT NULL,
	`rfc_message_id` text NOT NULL,
	`verified_by_membership_id` text NOT NULL,
	`connection_revision` integer NOT NULL,
	`sender_revision` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`,`delivery_id`) REFERENCES `prospect_deliveries`(`workspace_id`,`prospect_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`verified_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_delivery_identities_revision_chk" CHECK(typeof(connection_revision)='integer' AND connection_revision>=1 AND typeof(sender_revision)='integer' AND sender_revision>=1),
	CONSTRAINT "prospect_delivery_identities_rfc_chk" CHECK(length(rfc_message_id) BETWEEN 5 AND 903 AND rfc_message_id GLOB '<*@*>' AND instr(rfc_message_id,char(10))=0 AND instr(rfc_message_id,char(13))=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_delivery_identities_delivery_uq` ON `prospect_delivery_identities` (`workspace_id`,`delivery_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_delivery_identities_rfc_uq` ON `prospect_delivery_identities` (`workspace_id`,`account_email`,`rfc_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_delivery_identities_provider_uq` ON `prospect_delivery_identities` (`workspace_id`,`account_email`,`provider_message_id`);
--> statement-breakpoint
CREATE TRIGGER prospect_delivery_identities_receipt BEFORE INSERT ON prospect_delivery_identities
WHEN NOT EXISTS(SELECT 1 FROM prospect_deliveries WHERE workspace_id=NEW.workspace_id AND prospect_id=NEW.prospect_id AND id=NEW.delivery_id AND state='accepted' AND account_email=NEW.account_email AND provider_message_id=NEW.provider_message_id AND provider_thread_id=NEW.provider_thread_id)
BEGIN SELECT RAISE(ABORT,'Verified identity must match the accepted provider receipt'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_delivery_identities_no_update BEFORE UPDATE ON prospect_delivery_identities
BEGIN SELECT RAISE(ABORT,'Verified delivery identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_delivery_identities_no_delete BEFORE DELETE ON prospect_delivery_identities
BEGIN SELECT RAISE(ABORT,'Verified delivery identity is permanent'); END;
