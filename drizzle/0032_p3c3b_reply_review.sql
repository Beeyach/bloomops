CREATE TABLE `prospect_reply_observations` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`delivery_id` text NOT NULL,
	`account_email` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`received_at` text NOT NULL,
	`kind` text NOT NULL,
	`match` text NOT NULL,
	`observed_by_membership_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`,`delivery_id`) REFERENCES `prospect_reply_states`(`workspace_id`,`prospect_id`,`delivery_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`observed_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_reply_observations_kind_chk" CHECK(kind IN ('reply_unreviewed','automatic_response','delivery_report','needs_review')),
	CONSTRAINT "prospect_reply_observations_match_chk" CHECK(match IN ('reply_chain','unresolved'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_reply_observations_provider_uq` ON `prospect_reply_observations` (`workspace_id`,`account_email`,`provider_message_id`);--> statement-breakpoint
CREATE INDEX `prospect_reply_observations_list_idx` ON `prospect_reply_observations` (`workspace_id`,`prospect_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `prospect_reply_states` (
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`delivery_id` text NOT NULL,
	`revision` integer NOT NULL,
	`hold_state` text DEFAULT 'clear' NOT NULL,
	`check_status` text DEFAULT 'never' NOT NULL,
	`check_id` text,
	`check_expires_at` text,
	`checked_at` text,
	`stop_reason` text,
	`stop_note` text,
	`stopped_by_membership_id` text,
	`stopped_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`workspace_id`, `prospect_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`,`delivery_id`) REFERENCES `prospect_deliveries`(`workspace_id`,`prospect_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`stopped_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_reply_states_revision_chk" CHECK(typeof(revision)='integer' AND revision>=1),
	CONSTRAINT "prospect_reply_states_hold_chk" CHECK(hold_state IN ('clear','held','stopped')),
	CONSTRAINT "prospect_reply_states_check_chk" CHECK(check_status IN ('never','checking','checked','unresolved') AND ((check_status='checking' AND check_id IS NOT NULL AND check_expires_at IS NOT NULL) OR (check_status!='checking' AND check_id IS NULL AND check_expires_at IS NULL))),
	CONSTRAINT "prospect_reply_states_stop_chk" CHECK((hold_state='stopped' AND stop_reason IS NOT NULL AND stop_note IS NOT NULL AND stop_reason IN ('opt_out','declined','hard_bounce','manual') AND length(trim(stop_note)) BETWEEN 1 AND 1000 AND stopped_by_membership_id IS NOT NULL AND stopped_at IS NOT NULL) OR (hold_state!='stopped' AND stop_reason IS NULL AND stop_note IS NULL AND stopped_by_membership_id IS NULL AND stopped_at IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_reply_states_receipt_uq` ON `prospect_reply_states` (`workspace_id`,`prospect_id`,`delivery_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_deliveries_reply_uq` ON `prospect_deliveries` (`workspace_id`,`prospect_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER prospect_reply_states_accepted BEFORE INSERT ON prospect_reply_states
WHEN NOT EXISTS(SELECT 1 FROM prospect_deliveries WHERE workspace_id=NEW.workspace_id AND prospect_id=NEW.prospect_id AND id=NEW.delivery_id AND state='accepted')
BEGIN SELECT RAISE(ABORT,'Reply review requires an accepted receipt'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_reply_states_monotonic BEFORE UPDATE ON prospect_reply_states
WHEN NEW.workspace_id IS NOT OLD.workspace_id OR NEW.prospect_id IS NOT OLD.prospect_id OR NEW.delivery_id IS NOT OLD.delivery_id OR NEW.created_at IS NOT OLD.created_at OR NEW.revision!=OLD.revision+1
 OR (OLD.hold_state='held' AND NEW.hold_state='clear')
 OR (OLD.hold_state='stopped' AND (NEW.hold_state!='stopped' OR NEW.stop_reason IS NOT OLD.stop_reason OR NEW.stop_note IS NOT OLD.stop_note OR NEW.stopped_at IS NOT OLD.stopped_at OR NEW.stopped_by_membership_id IS NOT OLD.stopped_by_membership_id))
BEGIN SELECT RAISE(ABORT,'Reply state identity and prior holds are permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_reply_states_no_delete BEFORE DELETE ON prospect_reply_states
BEGIN SELECT RAISE(ABORT,'Reply state is permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_reply_observations_account BEFORE INSERT ON prospect_reply_observations
WHEN NOT EXISTS(SELECT 1 FROM prospect_deliveries WHERE workspace_id=NEW.workspace_id AND prospect_id=NEW.prospect_id AND id=NEW.delivery_id AND state='accepted' AND account_email=NEW.account_email)
BEGIN SELECT RAISE(ABORT,'Reply account must match the accepted receipt'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_reply_observations_no_update BEFORE UPDATE ON prospect_reply_observations
BEGIN SELECT RAISE(ABORT,'Reply observations are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_reply_observations_no_delete BEFORE DELETE ON prospect_reply_observations
BEGIN SELECT RAISE(ABORT,'Reply observations are permanent'); END;
