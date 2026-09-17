CREATE TABLE `prospect_historical_coverages` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`account_email` text NOT NULL,
	`source_run_id` text NOT NULL,
	`checkpoint_run_id` text NOT NULL,
	`interval_from` text NOT NULL,
	`interval_through` text NOT NULL,
	`actor_membership_id` text NOT NULL,
	`actor_stamp` text NOT NULL,
	`connection_revision` integer NOT NULL,
	`sender_revision` integer NOT NULL,
	`discovery_revision` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`account_email`) REFERENCES `prospect_discovery_states`(`workspace_id`,`account_email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`source_run_id`) REFERENCES `prospect_recovery_scopes`(`workspace_id`,`run_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`checkpoint_run_id`) REFERENCES `prospect_monitoring_checkpoints`(`workspace_id`,`run_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`actor_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_historical_coverages_revision_chk" CHECK(connection_revision>=1 AND sender_revision>=1 AND discovery_revision>=1),
	CONSTRAINT "prospect_historical_coverages_interval_chk" CHECK(julianday(interval_from) IS NOT NULL AND julianday(interval_through) IS NOT NULL AND julianday(interval_from)<=julianday(interval_through))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_historical_coverages_checkpoint_uq` ON `prospect_historical_coverages` (`workspace_id`,`checkpoint_run_id`);--> statement-breakpoint
CREATE INDEX `prospect_historical_coverages_account_idx` ON `prospect_historical_coverages` (`workspace_id`,`account_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `prospect_recovery_scopes` (
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`interval_from` text NOT NULL,
	`listing_pages` integer NOT NULL,
	`listed_count` integer NOT NULL,
	`metadata_processed_count` integer NOT NULL,
	`enumeration_complete` integer NOT NULL,
	`include_spam_trash` integer NOT NULL,
	`max_messages` integer NOT NULL,
	`max_pages` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`workspace_id`, `run_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`run_id`) REFERENCES `prospect_recovery_collections`(`workspace_id`,`run_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_recovery_scopes_bounds_chk" CHECK(listing_pages BETWEEN 1 AND 3 AND listed_count BETWEEN 0 AND 40 AND metadata_processed_count=listed_count AND enumeration_complete=1 AND include_spam_trash=1 AND max_messages=40 AND max_pages=3)
);
--> statement-breakpoint
CREATE TRIGGER prospect_recovery_scopes_insert BEFORE INSERT ON prospect_recovery_scopes
WHEN NOT EXISTS(
 SELECT 1 FROM prospect_discovery_runs run
 JOIN prospect_discovery_states state ON state.workspace_id=run.workspace_id AND state.account_email=run.account_email AND state.check_id=run.id
 JOIN prospect_recovery_collections collection ON collection.workspace_id=run.workspace_id AND collection.run_id=run.id
 WHERE run.workspace_id=NEW.workspace_id AND run.id=NEW.run_id AND run.kind='recovery' AND run.status='checking'
 AND collection.from_at=NEW.interval_from AND collection.created_at=NEW.created_at)
BEGIN SELECT RAISE(ABORT,'Recovery scope requires its active immutable collection'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_recovery_scope_required BEFORE UPDATE ON prospect_discovery_runs
WHEN OLD.kind='recovery' AND NEW.status IN ('checked','unresolved')
 AND EXISTS(SELECT 1 FROM prospect_recovery_collections collection WHERE collection.workspace_id=OLD.workspace_id AND collection.run_id=OLD.id)
 AND NOT EXISTS(SELECT 1 FROM prospect_recovery_scopes scope WHERE scope.workspace_id=OLD.workspace_id AND scope.run_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'Recovery collection requires complete enumeration evidence'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_recovery_scopes_no_update BEFORE UPDATE ON prospect_recovery_scopes
BEGIN SELECT RAISE(ABORT,'Recovery scope evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_recovery_scopes_no_delete BEFORE DELETE ON prospect_recovery_scopes
BEGIN SELECT RAISE(ABORT,'Recovery scope evidence is permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_historical_coverages_insert_core BEFORE INSERT ON prospect_historical_coverages
WHEN NOT EXISTS(
 SELECT 1 FROM prospect_monitoring_checkpoints point
 JOIN prospect_discovery_runs checkpoint ON checkpoint.workspace_id=point.workspace_id AND checkpoint.id=point.run_id
 JOIN prospect_discovery_runs source ON source.workspace_id=point.workspace_id AND source.id=point.source_run_id
 JOIN prospect_recovery_collections collection ON collection.workspace_id=source.workspace_id AND collection.run_id=source.id
 JOIN prospect_recovery_scopes scope ON scope.workspace_id=collection.workspace_id AND scope.run_id=collection.run_id
 JOIN prospect_discovery_states state ON state.workspace_id=source.workspace_id AND state.account_email=source.account_email
 JOIN prospect_google_connections connection ON connection.workspace_id=source.workspace_id AND connection.account_email=source.account_email
 JOIN prospect_senders sender ON sender.workspace_id=source.workspace_id AND sender.email=connection.sender_email
 JOIN workspace_memberships grantor ON grantor.workspace_id=connection.workspace_id AND grantor.id=connection.authorized_by_membership_id
 WHERE point.workspace_id=NEW.workspace_id AND source.account_email=NEW.account_email AND point.source_run_id=NEW.source_run_id AND point.run_id=NEW.checkpoint_run_id
 AND source.kind='recovery' AND source.status='unresolved' AND source.reason='recovery_collected'
 AND checkpoint.kind='checkpoint' AND checkpoint.status='checked' AND checkpoint.reason='checkpoint_saved' AND checkpoint.result_history_id=collection.catchup_history_id
 AND source.connection_revision=NEW.connection_revision AND source.sender_revision=NEW.sender_revision AND checkpoint.connection_revision=NEW.connection_revision AND checkpoint.sender_revision=NEW.sender_revision
 AND collection.catchup_status='complete' AND collection.catchup_history_id IS NOT NULL AND collection.unassigned_count=0
 AND scope.interval_from=collection.from_at AND scope.enumeration_complete=1 AND scope.include_spam_trash=1 AND scope.max_messages=40 AND scope.max_pages=3
 AND scope.listing_pages BETWEEN 1 AND 3 AND scope.listed_count BETWEEN 0 AND 40 AND scope.metadata_processed_count=scope.listed_count
 AND state.revision=NEW.discovery_revision AND state.check_status='checked' AND state.check_id IS NULL AND state.history_id=collection.catchup_history_id
 AND connection.revision=NEW.connection_revision AND connection.active=1 AND connection.check_status='healthy' AND connection.check_id IS NULL
 AND sender.revision=NEW.sender_revision AND grantor.status='active' AND grantor.role IN ('owner','admin') AND grantor.updated_at=connection.authorizer_updated_at
 AND NEW.interval_from=scope.interval_from AND NEW.interval_through=source.created_at)
BEGIN SELECT RAISE(ABORT,'Historical coverage requires exact complete current evidence'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_historical_coverages_insert_counts BEFORE INSERT ON prospect_historical_coverages
WHEN NOT (
 (SELECT count(*) FROM prospect_discovery_targets WHERE workspace_id=NEW.workspace_id AND run_id=NEW.source_run_id) BETWEEN 1 AND 100
 AND (SELECT count(*) FROM prospect_discovery_targets WHERE workspace_id=NEW.workspace_id AND run_id=NEW.source_run_id)=(SELECT count(*) FROM prospect_discovery_targets WHERE workspace_id=NEW.workspace_id AND run_id=NEW.checkpoint_run_id)
 AND (SELECT count(*) FROM prospect_discovery_targets WHERE workspace_id=NEW.workspace_id AND run_id=NEW.checkpoint_run_id)=(SELECT count(*) FROM prospect_deliveries WHERE workspace_id=NEW.workspace_id AND account_email=NEW.account_email AND state='accepted'))
BEGIN SELECT RAISE(ABORT,'Historical coverage target set is incomplete'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_historical_coverages_insert_targets BEFORE INSERT ON prospect_historical_coverages
WHEN EXISTS(
 SELECT 1 FROM prospect_discovery_targets target
 LEFT JOIN prospect_deliveries delivery ON delivery.workspace_id=target.workspace_id AND delivery.id=target.delivery_id AND delivery.prospect_id=target.prospect_id AND delivery.account_email=NEW.account_email AND delivery.state='accepted'
 LEFT JOIN prospect_delivery_identities identity ON identity.workspace_id=delivery.workspace_id AND identity.delivery_id=delivery.id
 WHERE target.workspace_id=NEW.workspace_id AND target.run_id=NEW.checkpoint_run_id
 AND (delivery.id IS NULL OR target.identity_id IS NULL OR identity.id IS NOT target.identity_id OR delivery.attempted_at<NEW.interval_from))
BEGIN SELECT RAISE(ABORT,'Historical coverage target evidence is invalid'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_historical_coverages_insert_fresh BEFORE INSERT ON prospect_historical_coverages
WHEN EXISTS(
 SELECT 1 FROM prospect_discovery_runs checkpoint
 JOIN prospect_discovery_runs newer ON newer.workspace_id=checkpoint.workspace_id AND newer.account_email=checkpoint.account_email AND (newer.created_at>checkpoint.created_at OR newer.created_at=checkpoint.created_at AND newer.id>checkpoint.id)
 WHERE checkpoint.workspace_id=NEW.workspace_id AND checkpoint.id=NEW.checkpoint_run_id)
BEGIN SELECT RAISE(ABORT,'Historical coverage evidence was replaced'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_historical_coverages_no_update BEFORE UPDATE ON prospect_historical_coverages
BEGIN SELECT RAISE(ABORT,'Historical coverage provenance is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_historical_coverages_no_delete BEFORE DELETE ON prospect_historical_coverages
BEGIN SELECT RAISE(ABORT,'Historical coverage provenance is permanent'); END;
