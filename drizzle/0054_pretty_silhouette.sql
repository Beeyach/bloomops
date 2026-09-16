CREATE TABLE `bloomops_page_template_creations` (
	`page_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`version_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_membership_id` text NOT NULL,
	`request_id` text NOT NULL,
	`intent_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`page_id`) REFERENCES `bloomops_pages`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`version_id`) REFERENCES `bloomops_page_template_versions`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`actor_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_template_creations_request_uq` ON `bloomops_page_template_creations` (`workspace_id`,`actor_user_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `bloomops_page_template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`page_id` text NOT NULL,
	`version` integer NOT NULL,
	`source_revision` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_membership_id` text NOT NULL,
	`request_id` text NOT NULL,
	`intent_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`page_id`) REFERENCES `bloomops_page_templates`(`workspace_id`,`page_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`actor_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "page_template_versions_numbers_ck" CHECK(typeof("bloomops_page_template_versions"."version")='integer' AND "bloomops_page_template_versions"."version">=1 AND typeof("bloomops_page_template_versions"."source_revision")='integer' AND "bloomops_page_template_versions"."source_revision">=1),
	CONSTRAINT "page_template_versions_title_ck" CHECK(length(trim("bloomops_page_template_versions"."title")) BETWEEN 1 AND 200),
	CONSTRAINT "page_template_versions_body_ck" CHECK(length(CAST("bloomops_page_template_versions"."body" AS BLOB))<=1800000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_template_versions_ws_id_uq` ON `bloomops_page_template_versions` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `page_template_versions_number_uq` ON `bloomops_page_template_versions` (`workspace_id`,`page_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `page_template_versions_request_uq` ON `bloomops_page_template_versions` (`workspace_id`,`actor_user_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `bloomops_page_templates` (
	`page_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`revision` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`mutation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`page_id`) REFERENCES `bloomops_pages`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "page_templates_revision_ck" CHECK(typeof("bloomops_page_templates"."revision")='integer' AND "bloomops_page_templates"."revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "page_templates_active_ck" CHECK("bloomops_page_templates"."active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_templates_ws_page_uq` ON `bloomops_page_templates` (`workspace_id`,`page_id`);
--> statement-breakpoint
CREATE TRIGGER bloomops_page_template_versions_update_guard BEFORE UPDATE ON bloomops_page_template_versions BEGIN SELECT RAISE(ABORT, 'Page template provenance is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER bloomops_page_template_versions_delete_guard BEFORE DELETE ON bloomops_page_template_versions BEGIN SELECT RAISE(ABORT, 'Page template provenance is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER bloomops_page_template_versions_actor_guard BEFORE INSERT ON bloomops_page_template_versions WHEN NOT EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=NEW.workspace_id AND m.id=NEW.actor_membership_id AND m.user_id=NEW.actor_user_id) BEGIN SELECT RAISE(ABORT, 'Page template actor mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER bloomops_page_template_versions_replace_guard BEFORE INSERT ON bloomops_page_template_versions WHEN EXISTS(SELECT 1 FROM bloomops_page_template_versions WHERE id=NEW.id OR (workspace_id=NEW.workspace_id AND actor_user_id=NEW.actor_user_id AND request_id=NEW.request_id)) BEGIN SELECT RAISE(ABORT, 'Page template provenance already exists'); END;

--> statement-breakpoint
CREATE TRIGGER bloomops_page_template_creations_update_guard BEFORE UPDATE ON bloomops_page_template_creations BEGIN SELECT RAISE(ABORT, 'Page template provenance is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER bloomops_page_template_creations_delete_guard BEFORE DELETE ON bloomops_page_template_creations BEGIN SELECT RAISE(ABORT, 'Page template provenance is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER bloomops_page_template_creations_actor_guard BEFORE INSERT ON bloomops_page_template_creations WHEN NOT EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=NEW.workspace_id AND m.id=NEW.actor_membership_id AND m.user_id=NEW.actor_user_id) BEGIN SELECT RAISE(ABORT, 'Page template actor mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER bloomops_page_template_creations_replace_guard BEFORE INSERT ON bloomops_page_template_creations WHEN EXISTS(SELECT 1 FROM bloomops_page_template_creations WHERE page_id=NEW.page_id OR (workspace_id=NEW.workspace_id AND actor_user_id=NEW.actor_user_id AND request_id=NEW.request_id)) BEGIN SELECT RAISE(ABORT, 'Page template provenance already exists'); END;

--> statement-breakpoint
CREATE TRIGGER page_template_membership_identity_guard BEFORE UPDATE OF workspace_id,id,user_id ON workspace_memberships
WHEN (NEW.workspace_id IS NOT OLD.workspace_id OR NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id)
AND (EXISTS(SELECT 1 FROM bloomops_page_template_versions WHERE workspace_id=OLD.workspace_id AND actor_membership_id=OLD.id)
 OR EXISTS(SELECT 1 FROM bloomops_page_template_creations WHERE workspace_id=OLD.workspace_id AND actor_membership_id=OLD.id))
BEGIN SELECT RAISE(ABORT, 'Page template actor identity is immutable'); END;
