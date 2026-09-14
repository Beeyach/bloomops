CREATE TABLE `bloomops_page_grants` (
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
	CONSTRAINT "bloomops_page_grants_permission_ck" CHECK("bloomops_page_grants"."permission" IN ('view','edit','none')),
	CONSTRAINT "bloomops_page_grants_recipient_ck" CHECK(("bloomops_page_grants"."recipient_role" IN ('project_manager','team_member') AND "bloomops_page_grants"."contact_id" IS NULL) OR ("bloomops_page_grants"."recipient_role"='client' AND "bloomops_page_grants"."contact_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `bloomops_page_grants_member_idx` ON `bloomops_page_grants` (`workspace_id`,`membership_id`,`page_id`);--> statement-breakpoint
CREATE TABLE `bloomops_page_settings` (
	`page_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`icon` text DEFAULT 'file' NOT NULL,
	`inherit_access` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`page_id`) REFERENCES `bloomops_pages`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bloomops_page_settings_inherit_ck" CHECK("bloomops_page_settings"."inherit_access" IN (0,1)),
	CONSTRAINT "bloomops_page_settings_icon_ck" CHECK("bloomops_page_settings"."icon" IN ('file','flower','sprout','book-open','lightbulb','target','star','heart','table','calendar-check'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_contacts_ws_id_uq` ON `client_contacts` (`workspace_id`,`id`);
--> statement-breakpoint
INSERT INTO bloomops_page_settings(page_id,workspace_id,icon,inherit_access) SELECT id,workspace_id,'file',1 FROM bloomops_pages;
