CREATE TABLE `prospect_monitoring_checkpoints` (
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`source_run_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`workspace_id`, `run_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`run_id`) REFERENCES `prospect_discovery_runs`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`source_run_id`) REFERENCES `prospect_recovery_collections`(`workspace_id`,`run_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_monitoring_checkpoints_source_uq` ON `prospect_monitoring_checkpoints` (`workspace_id`,`source_run_id`);--> statement-breakpoint
DROP TRIGGER prospect_discovery_runs_kind_insert;
--> statement-breakpoint
CREATE TRIGGER prospect_discovery_runs_kind_insert BEFORE INSERT ON prospect_discovery_runs
WHEN NEW.kind NOT IN ('discovery','recovery','checkpoint')
BEGIN SELECT RAISE(ABORT,'Invalid discovery run kind'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_monitoring_checkpoint_finish BEFORE UPDATE ON prospect_discovery_runs
WHEN (NEW.kind='checkpoint' AND NEW.status='checked' AND NOT EXISTS(
 SELECT 1 FROM prospect_monitoring_checkpoints k JOIN prospect_recovery_collections c ON c.workspace_id=k.workspace_id AND c.run_id=k.source_run_id
 WHERE k.workspace_id=NEW.workspace_id AND k.run_id=NEW.id AND c.catchup_status='complete' AND c.catchup_history_id=NEW.result_history_id AND NEW.reason='checkpoint_saved'))
BEGIN SELECT RAISE(ABORT,'Only a linked monitoring checkpoint may promote recovery progress'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_monitoring_checkpoints_insert BEFORE INSERT ON prospect_monitoring_checkpoints
WHEN NOT EXISTS(
 SELECT 1 FROM prospect_discovery_runs active
 JOIN prospect_discovery_states state ON state.workspace_id=active.workspace_id AND state.account_email=active.account_email AND state.check_id=active.id
 JOIN prospect_discovery_runs source ON source.workspace_id=active.workspace_id AND source.id=NEW.source_run_id AND source.account_email=active.account_email
 JOIN prospect_recovery_collections c ON c.workspace_id=source.workspace_id AND c.run_id=source.id
 WHERE active.workspace_id=NEW.workspace_id AND active.id=NEW.run_id AND active.kind='checkpoint' AND active.status='checking'
 AND source.kind='recovery' AND source.status='unresolved' AND source.reason='recovery_collected'
 AND active.connection_revision=source.connection_revision AND active.sender_revision=source.sender_revision AND NEW.created_at=active.created_at
 AND julianday(source.finished_at) IS NOT NULL AND julianday(NEW.created_at) IS NOT NULL AND julianday(source.finished_at)<=julianday(NEW.created_at) AND source.finished_at>=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'-5 minutes')
 AND c.catchup_status='complete' AND c.catchup_history_id IS NOT NULL AND c.unassigned_count=0
 AND (active.source_history_id IS NULL OR length(c.catchup_history_id)>length(active.source_history_id) OR length(c.catchup_history_id)=length(active.source_history_id) AND c.catchup_history_id>=active.source_history_id)
 AND NOT EXISTS(SELECT 1 FROM prospect_discovery_runs newer WHERE newer.workspace_id=source.workspace_id AND newer.account_email=source.account_email AND newer.kind='recovery' AND (newer.created_at>source.created_at OR newer.created_at=source.created_at AND newer.id>source.id))
 AND (SELECT count(*) FROM prospect_discovery_targets nt WHERE nt.workspace_id=active.workspace_id AND nt.run_id=active.id) BETWEEN 1 AND 100
 AND (SELECT count(*) FROM prospect_discovery_targets nt WHERE nt.workspace_id=active.workspace_id AND nt.run_id=active.id)=(SELECT count(*) FROM prospect_discovery_targets ot WHERE ot.workspace_id=source.workspace_id AND ot.run_id=source.id)
 AND NOT EXISTS(SELECT 1 FROM prospect_discovery_targets nt LEFT JOIN prospect_discovery_targets ot ON ot.workspace_id=nt.workspace_id AND ot.run_id=source.id AND ot.delivery_id=nt.delivery_id AND ot.prospect_id=nt.prospect_id
 WHERE nt.workspace_id=active.workspace_id AND nt.run_id=active.id AND (ot.delivery_id IS NULL OR nt.identity_id IS NULL OR nt.identity_id IS NOT ot.identity_id OR nt.reply_revision!=ot.reply_revision+1))
)
BEGIN SELECT RAISE(ABORT,'Monitoring checkpoint requires a recent matching complete collection'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_monitoring_checkpoints_no_update BEFORE UPDATE ON prospect_monitoring_checkpoints
BEGIN SELECT RAISE(ABORT,'Monitoring checkpoint provenance is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_monitoring_checkpoints_no_delete BEFORE DELETE ON prospect_monitoring_checkpoints
BEGIN SELECT RAISE(ABORT,'Monitoring checkpoint provenance is retained'); END;
