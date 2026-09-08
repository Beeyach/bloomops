CREATE TABLE `deliverables` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`creation_request_id` text NOT NULL,
	`title` text NOT NULL,
	`client_label` text,
	`description` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`visibility` text DEFAULT 'internal' NOT NULL,
	`target_date` text,
	`delivered_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "deliverables_status_chk" CHECK(status IN ('planned', 'in_progress', 'internal_review', 'client_review', 'approved', 'delivered', 'cancelled')),
	CONSTRAINT "deliverables_visibility_chk" CHECK(visibility IN ('internal', 'client', 'restricted')),
	CONSTRAINT "deliverables_title_chk" CHECK(length(trim(title)) BETWEEN 1 AND 120),
	CONSTRAINT "deliverables_label_chk" CHECK(client_label IS NULL OR length(trim(client_label)) BETWEEN 1 AND 120),
	CONSTRAINT "deliverables_description_chk" CHECK(description IS NULL OR length(trim(description)) BETWEEN 1 AND 5000),
	CONSTRAINT "deliverables_request_chk" CHECK(length(creation_request_id)=36),
	CONSTRAINT "deliverables_revision_chk" CHECK(typeof(revision)='integer' AND revision >= 1),
	CONSTRAINT "deliverables_target_date_chk" CHECK(target_date IS NULL OR (length(target_date)=10 AND target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(target_date, '+0 days') IS NOT NULL AND date(target_date, '+0 days')=target_date)),
	CONSTRAINT "deliverables_delivery_chk" CHECK((status='delivered' AND delivered_at IS NOT NULL) OR (status<>'delivered' AND delivered_at IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliverables_project_request_uq` ON `deliverables` (`workspace_id`,`project_id`,`creation_request_id`);--> statement-breakpoint
CREATE INDEX `deliverables_ws_project_visibility_idx` ON `deliverables` (`workspace_id`,`project_id`,`visibility`);