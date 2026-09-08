-- B3 is additive. The recursive guard runs inside the inserting transaction,
-- so competing edge additions cannot both pass a stale application graph.
CREATE TABLE `action_dependencies` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`action_id` text NOT NULL,
	`depends_on_action_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`,`action_id`) REFERENCES `actions`(`workspace_id`,`project_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`,`depends_on_action_id`) REFERENCES `actions`(`workspace_id`,`project_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "action_dependencies_self_chk" CHECK(action_id <> depends_on_action_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_dependencies_pair_uq` ON `action_dependencies` (`workspace_id`,`project_id`,`action_id`,`depends_on_action_id`);--> statement-breakpoint
CREATE INDEX `action_dependencies_prerequisite_idx` ON `action_dependencies` (`workspace_id`,`project_id`,`depends_on_action_id`);--> statement-breakpoint
CREATE TABLE `actions` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`milestone_id` text,
	`creation_request_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'to_do' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`assignee_membership_id` text,
	`due_date` text,
	`waiting_type` text,
	`waiting_reason` text,
	`visibility` text DEFAULT 'internal' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`assignee_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`,`milestone_id`) REFERENCES `milestones`(`workspace_id`,`project_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "actions_title_chk" CHECK(length(trim(title)) BETWEEN 1 AND 120),
	CONSTRAINT "actions_description_chk" CHECK(description IS NULL OR length(trim(description)) BETWEEN 1 AND 5000),
	CONSTRAINT "actions_status_chk" CHECK(status IN ('to_do', 'in_progress', 'waiting', 'review', 'done', 'cancelled')),
	CONSTRAINT "actions_priority_chk" CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
	CONSTRAINT "actions_visibility_chk" CHECK(visibility IN ('internal', 'restricted')),
	CONSTRAINT "actions_request_chk" CHECK(length(creation_request_id)=36),
	CONSTRAINT "actions_revision_chk" CHECK(typeof(revision)='integer' AND revision >= 1),
	CONSTRAINT "actions_due_date_chk" CHECK(due_date IS NULL OR (length(due_date)=10 AND due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(due_date, '+0 days') IS NOT NULL AND date(due_date, '+0 days')=due_date)),
	CONSTRAINT "actions_waiting_type_chk" CHECK(waiting_type IS NULL OR waiting_type IN ('client', 'ellen', 'ary', 'team', 'external', 'dependency', 'other')),
	CONSTRAINT "actions_waiting_chk" CHECK((status='waiting' AND waiting_type IS NOT NULL AND waiting_reason IS NOT NULL AND length(trim(waiting_reason)) BETWEEN 1 AND 1000) OR (status<>'waiting' AND waiting_type IS NULL AND waiting_reason IS NULL)),
	CONSTRAINT "actions_completion_chk" CHECK((status='done' AND completed_at IS NOT NULL) OR (status<>'done' AND completed_at IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actions_ws_project_id_uq` ON `actions` (`workspace_id`,`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `actions_project_request_uq` ON `actions` (`workspace_id`,`project_id`,`creation_request_id`);--> statement-breakpoint
CREATE INDEX `actions_ws_project_status_due_idx` ON `actions` (`workspace_id`,`project_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `actions_ws_assignee_status_due_idx` ON `actions` (`workspace_id`,`assignee_membership_id`,`status`,`due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `milestones_ws_project_id_uq` ON `milestones` (`workspace_id`,`project_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER action_dependencies_cycle_insert
BEFORE INSERT ON action_dependencies
WHEN EXISTS (
  WITH RECURSIVE reachable(id) AS (
    SELECT NEW.depends_on_action_id
    UNION
    SELECT edge.depends_on_action_id FROM action_dependencies edge
    JOIN reachable ON edge.action_id=reachable.id
    WHERE edge.workspace_id=NEW.workspace_id AND edge.project_id=NEW.project_id
  ) SELECT 1 FROM reachable WHERE id=NEW.action_id
)
BEGIN SELECT RAISE(ABORT, 'action_dependency_cycle'); END;
--> statement-breakpoint
-- Edges have identity so a delayed removal cannot delete a later re-addition.
-- Endpoints never change in place; remove and add through the domain layer.
CREATE TRIGGER action_dependencies_immutable_update
BEFORE UPDATE ON action_dependencies
BEGIN SELECT RAISE(ABORT, 'action_dependency_immutable'); END;
