CREATE TABLE `bloomops_page_comment_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`page_id` text NOT NULL,
	`author_membership_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_request_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`page_id`) REFERENCES `bloomops_pages`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`author_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "page_comment_threads_state_ck" CHECK("bloomops_page_comment_threads"."resolved" IN (0,1) AND "bloomops_page_comment_threads"."revision">=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_comment_threads_scope_uq` ON `bloomops_page_comment_threads` (`workspace_id`,`page_id`,`id`);--> statement-breakpoint
CREATE INDEX `page_comment_threads_list_idx` ON `bloomops_page_comment_threads` (`workspace_id`,`page_id`,`resolved`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `bloomops_page_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`page_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`author_membership_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`page_id`,`thread_id`) REFERENCES `bloomops_page_comment_threads`(`workspace_id`,`page_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`author_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "page_comments_body_ck" CHECK(length(trim("bloomops_page_comments"."body"))>=1 AND length(CAST("bloomops_page_comments"."body" AS BLOB))<=8000)
);
--> statement-breakpoint
CREATE INDEX `page_comments_thread_idx` ON `bloomops_page_comments` (`workspace_id`,`thread_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `__new_bloomops_page_grants` (
	`workspace_id` text NOT NULL,
	`page_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`recipient_role` text NOT NULL,
	`contact_id` text,
	`permission` text NOT NULL,
	PRIMARY KEY(`page_id`, `membership_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`page_id`) REFERENCES `bloomops_pages`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`contact_id`) REFERENCES `client_contacts`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bloomops_page_grants_permission_ck" CHECK("__new_bloomops_page_grants"."permission" IN ('view','comment','edit','none')),
	CONSTRAINT "bloomops_page_grants_recipient_ck" CHECK(("__new_bloomops_page_grants"."recipient_role" IN ('project_manager','team_member') AND "__new_bloomops_page_grants"."contact_id" IS NULL) OR ("__new_bloomops_page_grants"."recipient_role"='client' AND "__new_bloomops_page_grants"."contact_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_bloomops_page_grants`("workspace_id", "page_id", "membership_id", "recipient_role", "contact_id", "permission") SELECT "workspace_id", "page_id", "membership_id", "recipient_role", "contact_id", "permission" FROM `bloomops_page_grants`;--> statement-breakpoint
DROP TABLE `bloomops_page_grants`;--> statement-breakpoint
ALTER TABLE `__new_bloomops_page_grants` RENAME TO `bloomops_page_grants`;--> statement-breakpoint
CREATE INDEX `bloomops_page_grants_member_idx` ON `bloomops_page_grants` (`workspace_id`,`membership_id`,`page_id`);