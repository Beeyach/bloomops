CREATE TABLE `prospect_followup_attempts` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`sequence_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`message_number` integer NOT NULL,
	`message_id` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`state` text NOT NULL,
	`attempted_at` text,
	`account_email` text,
	`provider_message_id` text,
	`provider_thread_id` text,
	`accepted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`sequence_id`) REFERENCES `prospect_followup_sequences`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`) REFERENCES `bloomops_prospects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_followup_attempts_number_chk" CHECK(message_number IN (2,3)),
	CONSTRAINT "prospect_followup_attempts_state_chk" CHECK(state IN ('scheduled','submitting','uncertain','accepted','cancelled')),
	CONSTRAINT "prospect_followup_attempts_outcome_chk" CHECK((state='scheduled' OR (attempted_at IS NOT NULL AND account_email IS NOT NULL)) AND (state!='accepted' OR (provider_message_id IS NOT NULL AND provider_thread_id IS NOT NULL AND accepted_at IS NOT NULL)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_followup_attempts_ws_id_uq` ON `prospect_followup_attempts` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_followup_attempts_step_uq` ON `prospect_followup_attempts` (`workspace_id`,`sequence_id`,`message_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_followup_attempts_message_uq` ON `prospect_followup_attempts` (`message_id`);--> statement-breakpoint
CREATE TABLE `prospect_followup_sequences` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`delivery_id` text NOT NULL,
	`approval_id` text NOT NULL,
	`identity_id` text NOT NULL,
	`state` text NOT NULL,
	`total_messages` integer NOT NULL,
	`next_message` integer,
	`second_scheduled_at` text,
	`third_scheduled_at` text,
	`account_email` text NOT NULL,
	`connection_revision` integer NOT NULL,
	`sender_revision` integer NOT NULL,
	`reply_revision` integer NOT NULL,
	`activated_by_membership_id` text NOT NULL,
	`activator_updated_at` text NOT NULL,
	`last_reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`,`delivery_id`) REFERENCES `prospect_deliveries`(`workspace_id`,`prospect_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`approval_id`) REFERENCES `prospect_outreach_approvals`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`identity_id`) REFERENCES `prospect_delivery_identities`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`activated_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_followup_sequences_state_chk" CHECK(state IN ('running','held','stopped','failed','complete')),
	CONSTRAINT "prospect_followup_sequences_count_chk" CHECK(total_messages BETWEEN 1 AND 3 AND (next_message IS NULL OR next_message BETWEEN 2 AND total_messages)),
	CONSTRAINT "prospect_followup_sequences_schedule_chk" CHECK((total_messages=1 AND second_scheduled_at IS NULL AND third_scheduled_at IS NULL) OR (total_messages=2 AND second_scheduled_at IS NOT NULL AND third_scheduled_at IS NULL) OR (total_messages=3 AND second_scheduled_at IS NOT NULL AND third_scheduled_at IS NOT NULL)),
	CONSTRAINT "prospect_followup_sequences_revision_chk" CHECK(connection_revision>=1 AND sender_revision>=1 AND reply_revision>=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_followup_sequences_ws_id_uq` ON `prospect_followup_sequences` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_followup_sequences_delivery_uq` ON `prospect_followup_sequences` (`workspace_id`,`delivery_id`);--> statement-breakpoint
CREATE INDEX `prospect_followup_sequences_due_idx` ON `prospect_followup_sequences` (`state`,`second_scheduled_at`,`third_scheduled_at`);
--> statement-breakpoint
CREATE TRIGGER prospect_followup_sequences_update BEFORE UPDATE ON prospect_followup_sequences
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.prospect_id IS NOT OLD.prospect_id OR NEW.delivery_id IS NOT OLD.delivery_id OR NEW.approval_id IS NOT OLD.approval_id OR NEW.identity_id IS NOT OLD.identity_id OR NEW.total_messages IS NOT OLD.total_messages OR NEW.second_scheduled_at IS NOT OLD.second_scheduled_at OR NEW.third_scheduled_at IS NOT OLD.third_scheduled_at OR NEW.account_email IS NOT OLD.account_email OR NEW.connection_revision IS NOT OLD.connection_revision OR NEW.sender_revision IS NOT OLD.sender_revision OR NEW.activated_by_membership_id IS NOT OLD.activated_by_membership_id OR NEW.activator_updated_at IS NOT OLD.activator_updated_at OR NEW.created_at IS NOT OLD.created_at OR NEW.reply_revision<OLD.reply_revision
 OR (OLD.state='complete' AND NEW.state!='complete') OR (OLD.state='stopped' AND NEW.state!='stopped') OR (OLD.state='held' AND NEW.state NOT IN ('held','stopped'))
 OR (OLD.state='failed' AND NEW.state NOT IN ('failed','running','stopped','complete')) OR (OLD.state='running' AND NEW.state NOT IN ('running','held','stopped','failed','complete'))
 OR (OLD.next_message IS NULL AND NEW.next_message IS NOT NULL AND OLD.state!='failed') OR (OLD.next_message IS NOT NULL AND NEW.next_message IS NOT NULL AND NEW.next_message<OLD.next_message)
BEGIN SELECT RAISE(ABORT,'Follow-up sequence provenance and terminal states are permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_followup_sequences_no_delete BEFORE DELETE ON prospect_followup_sequences
BEGIN SELECT RAISE(ABORT,'Follow-up sequence evidence is permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_followup_attempts_update BEFORE UPDATE ON prospect_followup_attempts
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.sequence_id IS NOT OLD.sequence_id OR NEW.prospect_id IS NOT OLD.prospect_id OR NEW.message_number IS NOT OLD.message_number OR NEW.message_id IS NOT OLD.message_id OR NEW.scheduled_at IS NOT OLD.scheduled_at OR NEW.created_at IS NOT OLD.created_at
 OR (OLD.state='scheduled' AND NEW.state NOT IN ('scheduled','submitting','cancelled')) OR (OLD.state='submitting' AND NEW.state NOT IN ('submitting','uncertain','accepted','cancelled')) OR (OLD.state='uncertain' AND NEW.state NOT IN ('uncertain','accepted')) OR (OLD.state IN ('accepted','cancelled') AND NEW.state IS NOT OLD.state)
 OR (OLD.attempted_at IS NOT NULL AND NEW.attempted_at IS NOT OLD.attempted_at) OR (OLD.account_email IS NOT NULL AND NEW.account_email IS NOT OLD.account_email) OR (OLD.provider_message_id IS NOT NULL AND NEW.provider_message_id IS NOT OLD.provider_message_id) OR (OLD.provider_thread_id IS NOT NULL AND NEW.provider_thread_id IS NOT OLD.provider_thread_id) OR (OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS NOT OLD.accepted_at)
BEGIN SELECT RAISE(ABORT,'Follow-up attempt provenance and outcomes are permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_followup_attempts_no_delete BEFORE DELETE ON prospect_followup_attempts
BEGIN SELECT RAISE(ABORT,'Follow-up attempt evidence is permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_followup_reply_hold AFTER INSERT ON prospect_reply_observations
WHEN NEW.kind IN ('reply_unreviewed','needs_review')
BEGIN UPDATE prospect_followup_sequences SET state='held',last_reason='reply_recorded',updated_at=NEW.created_at WHERE workspace_id=NEW.workspace_id AND prospect_id=NEW.prospect_id AND state='running'; END;
--> statement-breakpoint
CREATE TRIGGER prospect_followup_reply_stop AFTER UPDATE OF hold_state ON prospect_reply_states
WHEN NEW.hold_state='stopped'
BEGIN UPDATE prospect_followup_sequences SET state='stopped',last_reason=coalesce(NEW.stop_reason,'recorded_stop'),updated_at=NEW.updated_at WHERE workspace_id=NEW.workspace_id AND prospect_id=NEW.prospect_id AND state IN ('running','held','failed'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_followup_conversion_stop AFTER INSERT ON prospect_conversions
BEGIN UPDATE prospect_followup_sequences SET state='stopped',last_reason='converted',updated_at=NEW.created_at WHERE workspace_id=NEW.workspace_id AND prospect_id=NEW.prospect_id AND state IN ('running','held','failed'); END;
