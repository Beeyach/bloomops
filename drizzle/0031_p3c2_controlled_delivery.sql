CREATE TABLE `prospect_deliveries` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`approval_id` text NOT NULL,
	`message_id` text NOT NULL,
	`state` text DEFAULT 'prepared' NOT NULL,
	`created_by_membership_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`attempted_at` text,
	`account_email` text,
	`provider_message_id` text,
	`provider_thread_id` text,
	`accepted_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`) REFERENCES `bloomops_prospects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`approval_id`) REFERENCES `prospect_outreach_approvals`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`created_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_deliveries_state_chk" CHECK(state IN ('prepared','submitting','uncertain','accepted','cancelled')),
	CONSTRAINT "prospect_deliveries_attempt_chk" CHECK((state IN ('prepared','cancelled') OR (attempted_at IS NOT NULL AND account_email IS NOT NULL)) AND (state!='accepted' OR (provider_message_id IS NOT NULL AND provider_thread_id IS NOT NULL AND accepted_at IS NOT NULL)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_deliveries_prospect_uq` ON `prospect_deliveries` (`workspace_id`,`prospect_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_deliveries_message_uq` ON `prospect_deliveries` (`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_outreach_approvals_ws_id_uq` ON `prospect_outreach_approvals` (`workspace_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER prospect_deliveries_identity_immutable BEFORE UPDATE ON prospect_deliveries
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.prospect_id IS NOT OLD.prospect_id OR NEW.approval_id IS NOT OLD.approval_id OR NEW.message_id IS NOT OLD.message_id OR NEW.created_by_membership_id IS NOT OLD.created_by_membership_id OR NEW.created_at IS NOT OLD.created_at OR (OLD.attempted_at IS NOT NULL AND (NEW.attempted_at IS NOT OLD.attempted_at OR NEW.account_email IS NOT OLD.account_email))
BEGIN SELECT RAISE(ABORT,'Delivery identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_deliveries_state_transition BEFORE UPDATE ON prospect_deliveries
WHEN NOT ((OLD.state='prepared' AND NEW.state IN ('submitting','cancelled')) OR (OLD.state='submitting' AND NEW.state IN ('accepted','uncertain','cancelled')) OR (OLD.state='uncertain' AND NEW.state='accepted'))
BEGIN SELECT RAISE(ABORT,'Invalid delivery transition'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_deliveries_no_delete BEFORE DELETE ON prospect_deliveries
BEGIN SELECT RAISE(ABORT,'Delivery receipt is permanent'); END;
