CREATE TABLE `notification_mutes` (
	`workspace_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`thread_id` text NOT NULL,
	`record_thread_id` text,
	`page_thread_id` text,
	PRIMARY KEY(`workspace_id`, `membership_id`, `user_id`, `kind`, `thread_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`record_thread_id`) REFERENCES `record_discussion_threads`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`page_thread_id`) REFERENCES `bloomops_page_comment_threads`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notification_mute_target_ck" CHECK((kind='record' AND record_thread_id IS NOT NULL AND thread_id=record_thread_id AND page_thread_id IS NULL) OR (kind='page' AND page_thread_id IS NOT NULL AND thread_id=page_thread_id AND record_thread_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`workspace_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`user_id` text NOT NULL,
	`mentions` integer DEFAULT 1 NOT NULL,
	`replies` integer DEFAULT 1 NOT NULL,
	`assignments` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`workspace_id`, `membership_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notification_preferences_flags_ck" CHECK(mentions IN (0,1) AND replies IN (0,1) AND assignments IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`event_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`record_thread_id` text,
	`record_comment_id` text,
	`page_id` text,
	`page_thread_id` text,
	`page_comment_id` text,
	`action_id` text,
	`read_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`action_id`) REFERENCES `actions`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`record_thread_id`,`record_comment_id`) REFERENCES `record_discussion_comments`(`workspace_id`,`thread_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`page_id`,`page_thread_id`) REFERENCES `bloomops_page_comment_threads`(`workspace_id`,`page_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`page_id`,`page_thread_id`,`page_comment_id`) REFERENCES `bloomops_page_comments`(`workspace_id`,`page_id`,`thread_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`event_id`) REFERENCES `activity_events`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "notification_target_ck" CHECK((
    (category IN ('mentions','replies') AND record_thread_id IS NOT NULL AND record_comment_id IS NOT NULL AND page_id IS NULL AND page_thread_id IS NULL AND page_comment_id IS NULL AND action_id IS NULL) OR
    (category='replies' AND page_id IS NOT NULL AND page_thread_id IS NOT NULL AND page_comment_id IS NOT NULL AND record_thread_id IS NULL AND record_comment_id IS NULL AND action_id IS NULL) OR
    (category='assignments' AND action_id IS NOT NULL AND record_thread_id IS NULL AND record_comment_id IS NULL AND page_id IS NULL AND page_thread_id IS NULL AND page_comment_id IS NULL)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_id_uq` ON `notifications` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_event_recipient_uq` ON `notifications` (`event_id`,`membership_id`);--> statement-breakpoint
CREATE INDEX `notifications_inbox_idx` ON `notifications` (`workspace_id`,`membership_id`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `actions_workspace_uq` ON `actions` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `activity_events_scope_uq` ON `activity_events` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `page_comment_threads_workspace_uq` ON `bloomops_page_comment_threads` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `page_comments_scope_uq` ON `bloomops_page_comments` (`workspace_id`,`page_id`,`thread_id`,`id`);