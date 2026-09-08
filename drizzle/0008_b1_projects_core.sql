CREATE TABLE `project_assignments` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`assignment_role` text DEFAULT 'member' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "project_assignments_role_chk" CHECK(assignment_role IN ('lead', 'member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_assignments_project_member_uq` ON `project_assignments` (`project_id`,`membership_id`);--> statement-breakpoint
CREATE INDEX `project_assignments_ws_member_idx` ON `project_assignments` (`workspace_id`,`membership_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`service_engagement_id` text,
	`department_id` text,
	`name` text NOT NULL,
	`client_label` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`health` text DEFAULT 'on_track' NOT NULL,
	`owner_membership_id` text,
	`start_date` text,
	`target_date` text,
	`completed_at` text,
	`visibility` text DEFAULT 'internal' NOT NULL,
	`status_reason` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`service_engagement_id`) REFERENCES `service_engagements`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`department_id`) REFERENCES `departments`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`owner_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "projects_status_chk" CHECK(status IN ('planned', 'ready', 'in_progress', 'waiting', 'blocked', 'review', 'completed', 'cancelled', 'archived')),
	CONSTRAINT "projects_health_chk" CHECK(health IN ('on_track', 'needs_attention', 'at_risk')),
	CONSTRAINT "projects_visibility_chk" CHECK(visibility IN ('internal', 'client', 'restricted')),
	CONSTRAINT "projects_name_chk" CHECK(length(trim(name)) BETWEEN 1 AND 120),
	CONSTRAINT "projects_label_chk" CHECK(client_label IS NULL OR length(trim(client_label)) BETWEEN 1 AND 120),
	CONSTRAINT "projects_department_source_chk" CHECK(service_engagement_id IS NULL OR department_id IS NULL),
	CONSTRAINT "projects_dates_chk" CHECK(start_date IS NULL OR target_date IS NULL OR target_date >= start_date),
	CONSTRAINT "projects_completion_chk" CHECK((status <> 'completed' OR completed_at IS NOT NULL) AND (completed_at IS NULL OR status IN ('completed','archived'))),
	CONSTRAINT "projects_reason_chk" CHECK((status IN ('waiting','blocked') AND status_reason IS NOT NULL AND length(trim(status_reason)) BETWEEN 1 AND 1000) OR (status NOT IN ('waiting','blocked') AND status_reason IS NULL)),
	CONSTRAINT "projects_revision_chk" CHECK(revision >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_ws_id_uq` ON `projects` (`workspace_id`,`id`);--> statement-breakpoint
CREATE INDEX `projects_ws_client_idx` ON `projects` (`workspace_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `projects_ws_service_idx` ON `projects` (`workspace_id`,`service_engagement_id`);--> statement-breakpoint
CREATE INDEX `projects_ws_status_idx` ON `projects` (`workspace_id`,`status`,`target_date`);--> statement-breakpoint
CREATE INDEX `projects_ws_owner_idx` ON `projects` (`workspace_id`,`owner_membership_id`);--> statement-breakpoint
CREATE INDEX `projects_ws_visibility_idx` ON `projects` (`workspace_id`,`visibility`,`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `service_engagements_ws_client_id_uq` ON `service_engagements` (`workspace_id`,`client_id`,`id`);