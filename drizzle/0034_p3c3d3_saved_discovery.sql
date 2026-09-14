CREATE TABLE `prospect_discovery_runs` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`account_email` text NOT NULL,
	`source_history_id` text,
	`actor_membership_id` text NOT NULL,
	`actor_stamp` text NOT NULL,
	`connection_revision` integer NOT NULL,
	`sender_revision` integer NOT NULL,
	`status` text DEFAULT 'checking' NOT NULL,
	`result_history_id` text,
	`reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`account_email`) REFERENCES `prospect_discovery_states`(`workspace_id`,`account_email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`actor_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_discovery_runs_revision_chk" CHECK(typeof(connection_revision)='integer' AND connection_revision>=1 AND typeof(sender_revision)='integer' AND sender_revision>=1),
	CONSTRAINT "prospect_discovery_runs_status_chk" CHECK((status='checking' AND finished_at IS NULL AND result_history_id IS NULL AND reason IS NULL) OR (status IN ('checked','unresolved','superseded') AND finished_at IS NOT NULL AND reason IS NOT NULL AND ((status='checked' AND result_history_id IS NOT NULL) OR (status!='checked' AND result_history_id IS NULL))))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_discovery_runs_ws_id_uq` ON `prospect_discovery_runs` (`workspace_id`,`id`);--> statement-breakpoint
CREATE TABLE `prospect_discovery_states` (
	`workspace_id` text NOT NULL,
	`account_email` text NOT NULL,
	`revision` integer NOT NULL,
	`baseline_history_id` text,
	`history_id` text,
	`coverage_status` text DEFAULT 'unverified' NOT NULL,
	`check_status` text NOT NULL,
	`check_id` text,
	`check_expires_at` text,
	`checked_at` text,
	`last_reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`workspace_id`, `account_email`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_discovery_states_revision_chk" CHECK(typeof(revision)='integer' AND revision>=1),
	CONSTRAINT "prospect_discovery_states_coverage_chk" CHECK(coverage_status IN ('unverified','gap')),
	CONSTRAINT "prospect_discovery_states_check_chk" CHECK(check_status IN ('checking','checked','unresolved') AND ((check_status='checking' AND check_id IS NOT NULL AND check_expires_at IS NOT NULL) OR (check_status!='checking' AND check_id IS NULL AND check_expires_at IS NULL))),
	CONSTRAINT "prospect_discovery_states_cursor_chk" CHECK((history_id IS NULL AND baseline_history_id IS NULL) OR (history_id IS NOT NULL AND baseline_history_id IS NOT NULL AND length(history_id) BETWEEN 1 AND 25 AND history_id NOT GLOB '*[^0-9]*' AND substr(history_id,1,1)!='0' AND length(baseline_history_id) BETWEEN 1 AND 25 AND baseline_history_id NOT GLOB '*[^0-9]*' AND substr(baseline_history_id,1,1)!='0'))
);
--> statement-breakpoint
CREATE TABLE `prospect_discovery_targets` (
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`delivery_id` text NOT NULL,
	`identity_id` text,
	`reply_revision` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `run_id`, `delivery_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`run_id`) REFERENCES `prospect_discovery_runs`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`identity_id`) REFERENCES `prospect_delivery_identities`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`,`delivery_id`) REFERENCES `prospect_deliveries`(`workspace_id`,`prospect_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_discovery_targets_revision_chk" CHECK(typeof(reply_revision)='integer' AND reply_revision>=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_delivery_identities_ws_id_uq` ON `prospect_delivery_identities` (`workspace_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER prospect_discovery_states_insert BEFORE INSERT ON prospect_discovery_states
WHEN NEW.revision!=1 OR NEW.history_id IS NOT NULL OR NEW.baseline_history_id IS NOT NULL OR NEW.coverage_status!='unverified' OR NEW.check_status!='checking' OR NEW.checked_at IS NOT NULL OR NEW.last_reason IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Discovery starts with unverified coverage and a claimed run'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_discovery_states_monotonic BEFORE UPDATE ON prospect_discovery_states
WHEN NEW.workspace_id IS NOT OLD.workspace_id OR NEW.account_email IS NOT OLD.account_email OR NEW.created_at IS NOT OLD.created_at OR NEW.revision!=OLD.revision+1
 OR (OLD.coverage_status='gap' AND NEW.coverage_status!='gap')
 OR (OLD.baseline_history_id IS NOT NULL AND NEW.baseline_history_id IS NOT OLD.baseline_history_id)
 OR (OLD.history_id IS NOT NULL AND (NEW.history_id IS NULL OR length(NEW.history_id)<length(OLD.history_id) OR (length(NEW.history_id)=length(OLD.history_id) AND NEW.history_id<OLD.history_id)))
 OR (NEW.history_id IS NOT OLD.history_id AND NOT EXISTS(SELECT 1 FROM prospect_discovery_runs WHERE workspace_id=OLD.workspace_id AND account_email=OLD.account_email AND id=OLD.check_id AND source_history_id IS OLD.history_id AND status='checked' AND result_history_id=NEW.history_id))
 OR (OLD.baseline_history_id IS NULL AND NEW.baseline_history_id IS NOT NULL AND (OLD.history_id IS NOT NULL OR NEW.baseline_history_id IS NOT NEW.history_id))
BEGIN SELECT RAISE(ABORT,'Discovery identity, coverage and cursor provenance are permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_discovery_states_no_delete BEFORE DELETE ON prospect_discovery_states
BEGIN SELECT RAISE(ABORT,'Discovery state is permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_discovery_runs_insert BEFORE INSERT ON prospect_discovery_runs
WHEN NEW.status!='checking' OR NOT EXISTS(SELECT 1 FROM prospect_discovery_states WHERE workspace_id=NEW.workspace_id AND account_email=NEW.account_email AND check_id=NEW.id AND check_status='checking' AND history_id IS NEW.source_history_id)
BEGIN SELECT RAISE(ABORT,'Discovery run requires its current claimed state'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_discovery_runs_finish BEFORE UPDATE ON prospect_discovery_runs
WHEN OLD.status!='checking' OR NEW.status='checking' OR NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.account_email IS NOT OLD.account_email OR NEW.source_history_id IS NOT OLD.source_history_id
 OR NEW.actor_membership_id IS NOT OLD.actor_membership_id OR NEW.actor_stamp IS NOT OLD.actor_stamp OR NEW.connection_revision IS NOT OLD.connection_revision OR NEW.sender_revision IS NOT OLD.sender_revision OR NEW.created_at IS NOT OLD.created_at
 OR length(NEW.reason) NOT BETWEEN 1 AND 50
 OR (NEW.status='checked' AND (length(NEW.result_history_id) NOT BETWEEN 1 AND 25 OR NEW.result_history_id GLOB '*[^0-9]*' OR substr(NEW.result_history_id,1,1)='0'))
 OR NOT EXISTS(SELECT 1 FROM prospect_discovery_states WHERE workspace_id=OLD.workspace_id AND account_email=OLD.account_email AND ((NEW.status='superseded' AND check_id IS NOT OLD.id) OR (NEW.status!='superseded' AND check_id=OLD.id AND check_status='checking')))
BEGIN SELECT RAISE(ABORT,'Discovery run provenance and terminal result are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_discovery_runs_no_delete BEFORE DELETE ON prospect_discovery_runs
BEGIN SELECT RAISE(ABORT,'Discovery run is permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_discovery_targets_insert BEFORE INSERT ON prospect_discovery_targets
WHEN NOT EXISTS(SELECT 1 FROM prospect_discovery_runs run
 JOIN prospect_discovery_states state ON state.workspace_id=run.workspace_id AND state.account_email=run.account_email AND state.check_id=run.id
 JOIN prospect_deliveries d ON d.workspace_id=run.workspace_id AND d.id=NEW.delivery_id AND d.prospect_id=NEW.prospect_id AND d.account_email=run.account_email AND d.state='accepted'
 JOIN prospect_reply_states r ON r.workspace_id=d.workspace_id AND r.prospect_id=d.prospect_id AND r.delivery_id=d.id AND r.revision=NEW.reply_revision AND r.hold_state IN ('held','stopped')
 LEFT JOIN prospect_delivery_identities h ON h.workspace_id=d.workspace_id AND h.delivery_id=d.id
 WHERE run.workspace_id=NEW.workspace_id AND run.id=NEW.run_id AND run.status='checking' AND h.id IS NEW.identity_id)
BEGIN SELECT RAISE(ABORT,'Discovery target must snapshot its current accepted identity and held reply state'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_discovery_targets_no_update BEFORE UPDATE ON prospect_discovery_targets
BEGIN SELECT RAISE(ABORT,'Discovery target snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_discovery_targets_no_delete BEFORE DELETE ON prospect_discovery_targets
BEGIN SELECT RAISE(ABORT,'Discovery target snapshots are permanent'); END;
