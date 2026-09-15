CREATE TABLE `record_discussion_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`author_membership_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`body` text NOT NULL,
	`creation_hash` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_request_id` text NOT NULL,
	`edited_at` text,
	`removed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`thread_id`) REFERENCES `record_discussion_threads`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`author_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "record_discussion_comment_body_ck" CHECK(length(trim(body))>=1 AND length(CAST(body AS BLOB))<=8000),
	CONSTRAINT "record_discussion_comment_revision_ck" CHECK(typeof(revision)='integer' AND revision>=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `record_discussion_comments_scope_uq` ON `record_discussion_comments` (`workspace_id`,`thread_id`,`id`);--> statement-breakpoint
CREATE INDEX `record_discussion_comments_list_idx` ON `record_discussion_comments` (`workspace_id`,`thread_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `record_discussion_mentions` (
	`workspace_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`comment_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`comment_id`, `membership_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`thread_id`,`comment_id`) REFERENCES `record_discussion_comments`(`workspace_id`,`thread_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `record_discussion_mentions_recipient_idx` ON `record_discussion_mentions` (`workspace_id`,`membership_id`,`thread_id`);--> statement-breakpoint
CREATE TABLE `record_discussion_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`parent_type` text NOT NULL,
	`parent_id` text NOT NULL,
	`client_id` text,
	`project_id` text,
	`action_id` text,
	`deliverable_id` text,
	`audience` text DEFAULT 'internal' NOT NULL,
	`author_membership_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_request_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`author_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`,`action_id`) REFERENCES `actions`(`workspace_id`,`project_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`,`deliverable_id`) REFERENCES `deliverables`(`workspace_id`,`project_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "record_discussion_parent_ck" CHECK((
    (parent_type='client' AND client_id IS NOT NULL AND parent_id=client_id AND project_id IS NULL AND action_id IS NULL AND deliverable_id IS NULL) OR
    (parent_type='project' AND project_id IS NOT NULL AND parent_id=project_id AND client_id IS NULL AND action_id IS NULL AND deliverable_id IS NULL) OR
    (parent_type='action' AND project_id IS NOT NULL AND action_id IS NOT NULL AND parent_id=action_id AND client_id IS NULL AND deliverable_id IS NULL) OR
    (parent_type='deliverable' AND project_id IS NOT NULL AND deliverable_id IS NOT NULL AND parent_id=deliverable_id AND client_id IS NULL AND action_id IS NULL))),
	CONSTRAINT "record_discussion_audience_ck" CHECK(audience IN ('internal','client') AND (parent_type<>'action' OR audience='internal')),
	CONSTRAINT "record_discussion_state_ck" CHECK(resolved IN (0,1) AND typeof(revision)='integer' AND revision>=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `record_discussion_threads_scope_uq` ON `record_discussion_threads` (`workspace_id`,`id`);--> statement-breakpoint
CREATE INDEX `record_discussion_threads_list_idx` ON `record_discussion_threads` (`workspace_id`,`parent_type`,`parent_id`,`resolved`,`created_at`,`id`);