CREATE TABLE `content_asset_links` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`content_id` text NOT NULL,
	`purpose` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`asset_id`) REFERENCES `assets`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`content_id`) REFERENCES `content_items`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "content_asset_links_purpose_chk" CHECK(purpose IN ('recording','asset'))
);
--> statement-breakpoint
CREATE INDEX `content_asset_links_ws_content_idx` ON `content_asset_links` (`workspace_id`,`content_id`);
--> statement-breakpoint
CREATE TRIGGER content_asset_links_no_update BEFORE UPDATE ON content_asset_links
BEGIN SELECT RAISE(ABORT, 'Content File attachments are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER content_asset_links_no_delete BEFORE DELETE ON content_asset_links
BEGIN SELECT RAISE(ABORT, 'Archive the File instead'); END;
--> statement-breakpoint
CREATE TRIGGER content_asset_links_exclusive BEFORE INSERT ON content_asset_links
WHEN EXISTS (SELECT 1 FROM asset_links WHERE asset_id=NEW.asset_id)
BEGIN SELECT RAISE(ABORT, 'File attachment families are exclusive'); END;
--> statement-breakpoint
CREATE TRIGGER asset_links_exclusive BEFORE INSERT ON asset_links
WHEN EXISTS (SELECT 1 FROM content_asset_links WHERE asset_id=NEW.asset_id)
BEGIN SELECT RAISE(ABORT, 'File attachment families are exclusive'); END;
