CREATE TABLE `bloomops_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`creation_request_id` text NOT NULL,
	`title` text DEFAULT 'Untitled' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bloomops_pages_title_ck" CHECK(length(trim("bloomops_pages"."title")) BETWEEN 1 AND 200),
	CONSTRAINT "bloomops_pages_body_ck" CHECK(length(CAST("bloomops_pages"."body" AS BLOB))<=1800000),
	CONSTRAINT "bloomops_pages_revision_ck" CHECK("bloomops_pages"."revision">=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bloomops_pages_workspace_id_uq` ON `bloomops_pages` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bloomops_pages_request_uq` ON `bloomops_pages` (`workspace_id`,`creation_request_id`);--> statement-breakpoint
CREATE INDEX `bloomops_pages_updated_idx` ON `bloomops_pages` (`workspace_id`,`updated_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER bloomops_pages_identity_update BEFORE UPDATE ON bloomops_pages
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.creation_request_id IS NOT OLD.creation_request_id OR NEW.created_at IS NOT OLD.created_at OR NEW.revision != OLD.revision+1
BEGIN SELECT RAISE(ABORT,'Page identity is immutable and saves require the next revision'); END;
