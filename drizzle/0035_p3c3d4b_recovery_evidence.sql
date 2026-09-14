CREATE TABLE `prospect_recovery_collections` (
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`from_at` text NOT NULL,
	`start_history_id` text NOT NULL,
	`catchup_history_id` text,
	`catchup_status` text NOT NULL,
	`reason` text NOT NULL,
	`matched_count` integer NOT NULL,
	`unassigned_count` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`workspace_id`, `run_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`run_id`) REFERENCES `prospect_discovery_runs`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_recovery_collections_count_chk" CHECK(typeof(matched_count)='integer' AND typeof(unassigned_count)='integer' AND matched_count>=0 AND unassigned_count>=0 AND matched_count+unassigned_count<=80),
	CONSTRAINT "prospect_recovery_collections_history_chk" CHECK(length(start_history_id) BETWEEN 1 AND 25 AND start_history_id NOT GLOB '*[^0-9]*' AND substr(start_history_id,1,1)!='0' AND ((catchup_status='unresolved' AND catchup_history_id IS NULL) OR (catchup_status='complete' AND catchup_history_id IS NOT NULL AND length(catchup_history_id) BETWEEN 1 AND 25 AND catchup_history_id NOT GLOB '*[^0-9]*' AND substr(catchup_history_id,1,1)!='0' AND (length(catchup_history_id)>length(start_history_id) OR (length(catchup_history_id)=length(start_history_id) AND catchup_history_id>=start_history_id)))))
);
--> statement-breakpoint
CREATE TABLE `prospect_recovery_messages` (
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`provider_thread_id` text NOT NULL,
	`received_at` text NOT NULL,
	`kind` text NOT NULL,
	`delivery_id` text,
	`prospect_id` text,
	PRIMARY KEY(`workspace_id`, `run_id`, `provider_message_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`run_id`) REFERENCES `prospect_recovery_collections`(`workspace_id`,`run_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`run_id`,`delivery_id`) REFERENCES `prospect_discovery_targets`(`workspace_id`,`run_id`,`delivery_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`,`delivery_id`) REFERENCES `prospect_deliveries`(`workspace_id`,`prospect_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_recovery_messages_assignment_chk" CHECK(((delivery_id IS NULL AND prospect_id IS NULL AND kind='needs_review') OR (delivery_id IS NOT NULL AND prospect_id IS NOT NULL AND kind IN ('reply_unreviewed','automatic_response','delivery_report','needs_review'))))
);
--> statement-breakpoint
ALTER TABLE `prospect_discovery_runs` ADD `kind` text DEFAULT 'discovery' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER prospect_discovery_runs_kind_insert BEFORE INSERT ON prospect_discovery_runs
WHEN NEW.kind NOT IN ('discovery','recovery')
BEGIN SELECT RAISE(ABORT,'Invalid discovery run kind'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_discovery_runs_kind_update BEFORE UPDATE ON prospect_discovery_runs
WHEN NEW.kind IS NOT OLD.kind OR (NEW.kind='recovery' AND NEW.status='checked')
BEGIN SELECT RAISE(ABORT,'Recovery cannot change run identity or advance the discovery cursor'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_recovery_collections_insert BEFORE INSERT ON prospect_recovery_collections
WHEN NOT EXISTS(SELECT 1 FROM prospect_discovery_runs q JOIN prospect_discovery_states s ON s.workspace_id=q.workspace_id AND s.account_email=q.account_email AND s.check_id=q.id WHERE q.workspace_id=NEW.workspace_id AND q.id=NEW.run_id AND q.kind='recovery' AND q.status='checking')
BEGIN SELECT RAISE(ABORT,'Recovery collection requires its current claimed recovery run'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_recovery_messages_insert BEFORE INSERT ON prospect_recovery_messages
WHEN NOT EXISTS(SELECT 1 FROM prospect_discovery_runs q JOIN prospect_recovery_collections c ON c.workspace_id=q.workspace_id AND c.run_id=q.id WHERE q.workspace_id=NEW.workspace_id AND q.id=NEW.run_id AND q.kind='recovery' AND q.status='checking')
 OR (NEW.delivery_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM prospect_discovery_targets t JOIN prospect_discovery_runs q ON q.workspace_id=t.workspace_id AND q.id=t.run_id JOIN prospect_deliveries d ON d.workspace_id=t.workspace_id AND d.id=t.delivery_id AND d.account_email=q.account_email WHERE t.workspace_id=NEW.workspace_id AND t.run_id=NEW.run_id AND t.delivery_id=NEW.delivery_id AND t.prospect_id=NEW.prospect_id AND t.identity_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Recovery message requires its active collection and registered target'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_recovery_complete BEFORE UPDATE ON prospect_discovery_runs
WHEN OLD.kind='recovery' AND EXISTS(SELECT 1 FROM prospect_recovery_collections c WHERE c.workspace_id=OLD.workspace_id AND c.run_id=OLD.id AND (
 c.matched_count!=(SELECT count(*) FROM prospect_recovery_messages m WHERE m.workspace_id=c.workspace_id AND m.run_id=c.run_id AND m.delivery_id IS NOT NULL)
 OR c.unassigned_count!=(SELECT count(*) FROM prospect_recovery_messages m WHERE m.workspace_id=c.workspace_id AND m.run_id=c.run_id AND m.delivery_id IS NULL)
 OR EXISTS(SELECT 1 FROM prospect_recovery_messages m WHERE m.workspace_id=c.workspace_id AND m.run_id=c.run_id AND m.delivery_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM prospect_reply_observations o WHERE o.workspace_id=m.workspace_id AND o.account_email=OLD.account_email AND o.provider_message_id=m.provider_message_id AND o.delivery_id=m.delivery_id))
))
BEGIN SELECT RAISE(ABORT,'Recovery evidence and canonical observations must be complete before sealing'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_recovery_collections_no_update BEFORE UPDATE ON prospect_recovery_collections
BEGIN SELECT RAISE(ABORT,'Recovery collection evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_recovery_collections_no_delete BEFORE DELETE ON prospect_recovery_collections
BEGIN SELECT RAISE(ABORT,'Recovery collection evidence is permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_recovery_messages_no_update BEFORE UPDATE ON prospect_recovery_messages
BEGIN SELECT RAISE(ABORT,'Recovery message evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_recovery_messages_no_delete BEFORE DELETE ON prospect_recovery_messages
BEGIN SELECT RAISE(ABORT,'Recovery message evidence is permanent'); END;
