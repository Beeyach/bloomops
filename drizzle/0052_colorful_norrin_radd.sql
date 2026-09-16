CREATE TABLE `work_setup_generations` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`template_id` text NOT NULL,
	`template_version_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_membership_id` text NOT NULL,
	`request_id` text NOT NULL,
	`intent_hash` text NOT NULL,
	`event_name` text NOT NULL,
	`event_date` text NOT NULL,
	`plan_hash` text NOT NULL,
	`plan_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`milestone_count` integer NOT NULL,
	`action_count` integer NOT NULL,
	`deliverable_count` integer NOT NULL,
	`dependency_count` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`actor_membership_id`,`actor_user_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`,`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`template_id`,`template_version_id`) REFERENCES `template_versions`(`workspace_id`,`template_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "work_setup_generation_hash_ck" CHECK(length(intent_hash)=64 AND length(plan_hash)=64),
	CONSTRAINT "work_setup_generation_plan_ck" CHECK(json_valid(plan_json) AND json_extract(plan_json,'$.schemaVersion')=1),
	CONSTRAINT "work_setup_generation_counts_ck" CHECK(typeof(milestone_count)='integer' AND milestone_count BETWEEN 0 AND 20 AND typeof(action_count)='integer' AND action_count BETWEEN 0 AND 60 AND typeof(deliverable_count)='integer' AND deliverable_count BETWEEN 0 AND 20 AND typeof(dependency_count)='integer' AND dependency_count BETWEEN 0 AND 180),
	CONSTRAINT "work_setup_generation_date_ck" CHECK(length(event_date)=10 AND date(event_date,'+0 days') IS NOT NULL AND date(event_date,'+0 days')=event_date)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_setup_generation_ws_request_uq` ON `work_setup_generations` (`workspace_id`,`actor_user_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `work_setup_generation_project_uq` ON `work_setup_generations` (`workspace_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `work_setup_saves` (
	`workspace_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_membership_id` text NOT NULL,
	`request_id` text NOT NULL,
	`intent_hash` text NOT NULL,
	`template_id` text NOT NULL,
	`template_version_id` text NOT NULL,
	`operation` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`workspace_id`, `actor_user_id`, `request_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`actor_membership_id`,`actor_user_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`,`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`template_id`,`template_version_id`) REFERENCES `template_versions`(`workspace_id`,`template_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`template_id`) REFERENCES `work_setup_states`(`workspace_id`,`template_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "work_setup_save_operation_ck" CHECK(operation IN ('save','retire','restore') AND typeof(revision)='integer' AND revision>=1 AND length(intent_hash)=64)
);
--> statement-breakpoint
CREATE TABLE `work_setup_states` (
	`workspace_id` text NOT NULL,
	`template_id` text NOT NULL,
	`revision` integer NOT NULL,
	`mutation_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`workspace_id`, `template_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`template_id`) REFERENCES `templates`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "work_setup_state_revision_ck" CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_versions_ws_template_id_uq` ON `template_versions` (`workspace_id`,`template_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_memberships_ws_identity_uq` ON `workspace_memberships` (`workspace_id`,`id`,`user_id`);
--> statement-breakpoint
CREATE TRIGGER work_setup_states_insert_guard BEFORE INSERT ON work_setup_states
WHEN NEW.revision<>1 OR EXISTS(SELECT 1 FROM work_setup_states WHERE workspace_id=NEW.workspace_id AND template_id=NEW.template_id)
 OR NOT EXISTS(SELECT 1 FROM templates WHERE workspace_id=NEW.workspace_id AND id=NEW.template_id AND kind='project')
BEGIN SELECT RAISE(ABORT,'invalid reusable setup identity'); END;
--> statement-breakpoint
CREATE TRIGGER work_setup_states_update_guard BEFORE UPDATE ON work_setup_states
WHEN NEW.workspace_id IS NOT OLD.workspace_id OR NEW.template_id IS NOT OLD.template_id OR NEW.created_at IS NOT OLD.created_at
 OR NEW.revision<>OLD.revision+1 OR NEW.mutation_id IS OLD.mutation_id
BEGIN SELECT RAISE(ABORT,'invalid reusable setup revision'); END;
--> statement-breakpoint
CREATE TRIGGER work_setup_states_no_delete BEFORE DELETE ON work_setup_states
BEGIN SELECT RAISE(ABORT,'retire reusable setups instead of deleting history'); END;
--> statement-breakpoint
CREATE TRIGGER work_setup_saves_insert_guard BEFORE INSERT ON work_setup_saves
WHEN EXISTS(SELECT 1 FROM work_setup_saves WHERE workspace_id=NEW.workspace_id AND actor_user_id=NEW.actor_user_id AND request_id=NEW.request_id)
 OR NOT EXISTS(SELECT 1 FROM work_setup_states s JOIN templates t ON t.workspace_id=s.workspace_id AND t.id=s.template_id
 JOIN template_versions v ON v.workspace_id=t.workspace_id AND v.template_id=t.id
 WHERE s.workspace_id=NEW.workspace_id AND s.template_id=NEW.template_id AND s.revision=NEW.revision AND v.id=NEW.template_version_id
 AND t.kind='project' AND v.status='published'
 AND (NEW.operation<>'save' OR (t.name=json_extract(v.definition_json,'$.name') AND coalesce(t.description,'')=json_extract(v.definition_json,'$.description')))
 AND (NEW.operation<>'retire' OR t.active=0) AND (NEW.operation<>'restore' OR t.active=1))
BEGIN SELECT RAISE(ABORT,'incomplete reusable setup mutation'); END;
--> statement-breakpoint
CREATE TRIGGER work_setup_saves_no_update BEFORE UPDATE ON work_setup_saves BEGIN SELECT RAISE(ABORT,'reusable setup receipts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER work_setup_saves_no_delete BEFORE DELETE ON work_setup_saves BEGIN SELECT RAISE(ABORT,'reusable setup receipts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER work_setup_generations_insert_guard BEFORE INSERT ON work_setup_generations
WHEN EXISTS(SELECT 1 FROM work_setup_generations WHERE id=NEW.id OR (workspace_id=NEW.workspace_id AND (project_id=NEW.project_id OR (actor_user_id=NEW.actor_user_id AND request_id=NEW.request_id))))
 OR NOT EXISTS(SELECT 1 FROM templates t JOIN work_setup_states s ON s.workspace_id=t.workspace_id AND s.template_id=t.id JOIN template_versions v ON v.workspace_id=t.workspace_id AND v.template_id=t.id
 WHERE t.workspace_id=NEW.workspace_id AND t.id=NEW.template_id AND t.kind='project' AND t.active=1 AND v.id=NEW.template_version_id AND v.status='published')
 OR NEW.milestone_count<>(SELECT count(*) FROM milestones WHERE workspace_id=NEW.workspace_id AND project_id=NEW.project_id)
 OR NEW.action_count<>(SELECT count(*) FROM actions WHERE workspace_id=NEW.workspace_id AND project_id=NEW.project_id)
 OR NEW.deliverable_count<>(SELECT count(*) FROM deliverables WHERE workspace_id=NEW.workspace_id AND project_id=NEW.project_id)
 OR NEW.dependency_count<>(SELECT count(*) FROM action_dependencies WHERE workspace_id=NEW.workspace_id AND project_id=NEW.project_id)
BEGIN SELECT RAISE(ABORT,'incomplete reusable setup generation'); END;
--> statement-breakpoint
CREATE TRIGGER work_setup_generations_no_update BEFORE UPDATE ON work_setup_generations BEGIN SELECT RAISE(ABORT,'reusable setup generation history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER work_setup_generations_no_delete BEFORE DELETE ON work_setup_generations BEGIN SELECT RAISE(ABORT,'reusable setup generation history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER work_setup_versions_no_replace BEFORE INSERT ON template_versions
WHEN EXISTS(SELECT 1 FROM template_versions old JOIN work_setup_states s ON s.workspace_id=old.workspace_id AND s.template_id=old.template_id
 WHERE old.id=NEW.id OR (old.template_id=NEW.template_id AND old.version_number=NEW.version_number))
BEGIN SELECT RAISE(ABORT,'reusable setup versions cannot be replaced'); END;
--> statement-breakpoint
CREATE TRIGGER work_setup_versions_immutable BEFORE UPDATE ON template_versions
WHEN EXISTS(SELECT 1 FROM work_setup_states WHERE workspace_id=OLD.workspace_id AND template_id=OLD.template_id)
 AND (NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.template_id IS NOT OLD.template_id OR NEW.version_number IS NOT OLD.version_number
 OR NEW.definition_json IS NOT OLD.definition_json OR NEW.definition_hash IS NOT OLD.definition_hash OR NEW.notes IS NOT OLD.notes
 OR NEW.created_by_membership_id IS NOT OLD.created_by_membership_id OR NEW.published_at IS NOT OLD.published_at OR NEW.created_at IS NOT OLD.created_at
 OR NOT(NEW.status=OLD.status OR (OLD.status='published' AND NEW.status='retired')))
BEGIN SELECT RAISE(ABORT,'reusable setup versions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER work_setup_versions_no_delete BEFORE DELETE ON template_versions
WHEN EXISTS(SELECT 1 FROM work_setup_states WHERE workspace_id=OLD.workspace_id AND template_id=OLD.template_id)
BEGIN SELECT RAISE(ABORT,'reusable setup versions are retained'); END;
