CREATE TABLE `prospect_report_checks` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`account_email` text NOT NULL,
	`recovery_run_id` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`status` text NOT NULL,
	`actor_membership_id` text NOT NULL,
	`actor_stamp` text NOT NULL,
	`connection_revision` integer NOT NULL,
	`sender_revision` integer NOT NULL,
	`discovery_revision` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	`finished_at` text,
	`reason` text,
	`delivery_id` text,
	`prospect_id` text,
	`action` text,
	`status_code` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`recovery_run_id`,`provider_message_id`) REFERENCES `prospect_recovery_messages`(`workspace_id`,`run_id`,`provider_message_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`actor_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`,`delivery_id`) REFERENCES `prospect_deliveries`(`workspace_id`,`prospect_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_report_checks_revision_chk" CHECK(typeof(connection_revision)='integer' AND typeof(sender_revision)='integer' AND typeof(discovery_revision)='integer' AND connection_revision>=1 AND sender_revision>=1 AND discovery_revision>=1),
	CONSTRAINT "prospect_report_checks_state_chk" CHECK(((status='checking' AND finished_at IS NULL AND reason IS NULL) OR (status IN ('associated','unresolved','superseded') AND finished_at IS NOT NULL AND reason IS NOT NULL AND reason IN ('associated','invalid_context','invalid_message','invalid_report','unmatched_original','conflicting_evidence','recipient_mismatch','provider_unavailable','observation_conflict','lease_expired')))),
	CONSTRAINT "prospect_report_checks_evidence_chk" CHECK(((status='associated' AND reason='associated' AND delivery_id IS NOT NULL AND prospect_id IS NOT NULL AND action IS NOT NULL AND action IN ('failed','delayed','delivered','relayed','expanded') AND status_code IS NOT NULL AND status_code GLOB '[245].[0-9]*.[0-9]*' AND status_code NOT GLOB '*[^0-9.]*' AND length(status_code)-length(replace(status_code,'.',''))=2 AND instr(substr(status_code,3),'.') BETWEEN 2 AND 4 AND length(substr(status_code,3))-instr(substr(status_code,3),'.') BETWEEN 1 AND 3) OR (status!='associated' AND delivery_id IS NULL AND prospect_id IS NULL AND action IS NULL AND status_code IS NULL)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_report_checks_workspace_id` ON `prospect_report_checks` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_report_checks_active` ON `prospect_report_checks` (`workspace_id`,`account_email`) WHERE status='checking';--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_report_checks_associated` ON `prospect_report_checks` (`workspace_id`,`account_email`,`provider_message_id`) WHERE status='associated';--> statement-breakpoint
CREATE INDEX `prospect_report_checks_account` ON `prospect_report_checks` (`workspace_id`,`account_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `prospect_report_targets` (
	`workspace_id` text NOT NULL,
	`check_id` text NOT NULL,
	`delivery_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`identity_id` text NOT NULL,
	`reply_revision` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `check_id`, `delivery_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`check_id`) REFERENCES `prospect_report_checks`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`,`delivery_id`) REFERENCES `prospect_deliveries`(`workspace_id`,`prospect_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`identity_id`) REFERENCES `prospect_delivery_identities`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_report_targets_revision_chk" CHECK(reply_revision>=1)
);
--> statement-breakpoint
CREATE TRIGGER prospect_report_checks_insert BEFORE INSERT ON prospect_report_checks
WHEN NEW.status!='checking' OR NOT EXISTS(
 SELECT 1 FROM prospect_recovery_messages m JOIN prospect_discovery_runs q ON q.workspace_id=m.workspace_id AND q.id=m.run_id
 JOIN prospect_recovery_collections c ON c.workspace_id=q.workspace_id AND c.run_id=q.id
 WHERE m.workspace_id=NEW.workspace_id AND m.run_id=NEW.recovery_run_id AND m.provider_message_id=NEW.provider_message_id
 AND m.kind IN ('delivery_report','needs_review') AND q.kind='recovery' AND q.status IN ('unresolved','checked') AND q.account_email=NEW.account_email)
BEGIN SELECT RAISE(ABORT,'Report check requires a saved terminal recovery candidate'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_report_targets_insert BEFORE INSERT ON prospect_report_targets
WHEN NOT EXISTS(SELECT 1 FROM prospect_report_checks q JOIN prospect_deliveries d ON d.workspace_id=q.workspace_id AND d.account_email=q.account_email
 JOIN prospect_delivery_identities h ON h.workspace_id=d.workspace_id AND h.delivery_id=d.id
 JOIN prospect_reply_states r ON r.workspace_id=d.workspace_id AND r.prospect_id=d.prospect_id AND r.delivery_id=d.id
 WHERE q.workspace_id=NEW.workspace_id AND q.id=NEW.check_id AND q.status='checking' AND d.id=NEW.delivery_id AND d.prospect_id=NEW.prospect_id AND d.state='accepted'
 AND h.id=NEW.identity_id AND r.revision=NEW.reply_revision AND r.hold_state IN ('held','stopped'))
BEGIN SELECT RAISE(ABORT,'Report target requires its claimed account, identity and held revision'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_report_checks_update BEFORE UPDATE ON prospect_report_checks
WHEN OLD.status!='checking' OR NEW.status NOT IN ('associated','unresolved','superseded')
 OR NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.account_email IS NOT OLD.account_email
 OR NEW.recovery_run_id IS NOT OLD.recovery_run_id OR NEW.provider_message_id IS NOT OLD.provider_message_id
 OR NEW.actor_membership_id IS NOT OLD.actor_membership_id OR NEW.actor_stamp IS NOT OLD.actor_stamp
 OR NEW.connection_revision IS NOT OLD.connection_revision OR NEW.sender_revision IS NOT OLD.sender_revision
 OR NEW.discovery_revision IS NOT OLD.discovery_revision OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
 OR (NEW.status='superseded' AND (NEW.reason!='lease_expired' OR NEW.finished_at<OLD.expires_at))
 OR (NEW.status!='superseded' AND NEW.finished_at>=OLD.expires_at)
 OR NEW.finished_at<OLD.created_at
 OR (NEW.status='associated' AND NOT EXISTS(SELECT 1 FROM prospect_report_targets t JOIN prospect_recovery_messages m ON m.workspace_id=t.workspace_id
 AND m.run_id=OLD.recovery_run_id AND m.provider_message_id=OLD.provider_message_id
 WHERE t.workspace_id=OLD.workspace_id AND t.check_id=OLD.id AND t.delivery_id=NEW.delivery_id AND t.prospect_id=NEW.prospect_id
 AND (m.delivery_id IS NULL OR (m.delivery_id=NEW.delivery_id AND m.prospect_id=NEW.prospect_id))))
BEGIN SELECT RAISE(ABORT,'Report provenance and terminal evidence are immutable and must agree'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_report_checks_no_delete BEFORE DELETE ON prospect_report_checks
BEGIN SELECT RAISE(ABORT,'Report check evidence is permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_report_targets_no_update BEFORE UPDATE ON prospect_report_targets
BEGIN SELECT RAISE(ABORT,'Report targets are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_report_targets_no_delete BEFORE DELETE ON prospect_report_targets
BEGIN SELECT RAISE(ABORT,'Report targets are permanent'); END;
