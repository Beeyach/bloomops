CREATE TABLE `milestones` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`creation_request_id` text NOT NULL,
	`name` text NOT NULL,
	`client_label` text,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`position` integer NOT NULL,
	`start_date` text,
	`target_date` text,
	`completed_at` text,
	`waiting_reason` text,
	`visibility` text DEFAULT 'internal' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "milestones_status_chk" CHECK(status IN ('upcoming', 'in_progress', 'waiting', 'completed', 'skipped')),
	CONSTRAINT "milestones_visibility_chk" CHECK(visibility IN ('internal', 'client', 'restricted')),
	CONSTRAINT "milestones_name_chk" CHECK(length(trim(name)) BETWEEN 1 AND 120),
	CONSTRAINT "milestones_label_chk" CHECK(client_label IS NULL OR length(trim(client_label)) BETWEEN 1 AND 120),
	CONSTRAINT "milestones_request_chk" CHECK(length(creation_request_id) = 36),
	CONSTRAINT "milestones_position_chk" CHECK(typeof(position) = 'integer' AND position BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "milestones_revision_chk" CHECK(typeof(revision) = 'integer' AND revision >= 1),
	CONSTRAINT "milestones_start_date_chk" CHECK(start_date IS NULL OR (length(start_date)=10 AND start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(start_date, '+0 days') IS NOT NULL AND date(start_date, '+0 days')=start_date)),
	CONSTRAINT "milestones_target_date_chk" CHECK(target_date IS NULL OR (length(target_date)=10 AND target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(target_date, '+0 days') IS NOT NULL AND date(target_date, '+0 days')=target_date)),
	CONSTRAINT "milestones_dates_chk" CHECK(start_date IS NULL OR target_date IS NULL OR target_date >= start_date),
	CONSTRAINT "milestones_completion_chk" CHECK((status='completed' AND completed_at IS NOT NULL) OR (status<>'completed' AND completed_at IS NULL)),
	CONSTRAINT "milestones_waiting_chk" CHECK((status='waiting' AND waiting_reason IS NOT NULL AND length(trim(waiting_reason)) BETWEEN 1 AND 1000) OR (status<>'waiting' AND waiting_reason IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `milestones_ws_id_uq` ON `milestones` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `milestones_project_position_uq` ON `milestones` (`project_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `milestones_project_request_uq` ON `milestones` (`workspace_id`,`project_id`,`creation_request_id`);--> statement-breakpoint
CREATE INDEX `milestones_ws_project_visibility_idx` ON `milestones` (`workspace_id`,`project_id`,`visibility`);