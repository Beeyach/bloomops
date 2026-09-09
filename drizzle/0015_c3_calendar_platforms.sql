CREATE TABLE `content_platforms` (
	`workspace_id` text NOT NULL,
	`content_id` text NOT NULL,
	`platform_key` text NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `content_id`, `platform_key`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`content_id`) REFERENCES `content_items`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "content_platforms_key_chk" CHECK(length(trim(platform_key)) BETWEEN 1 AND 120),
	CONSTRAINT "content_platforms_label_chk" CHECK(length(trim(label)) BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE INDEX `content_platforms_ws_key_content_idx` ON `content_platforms` (`workspace_id`,`platform_key`,`content_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_items_ws_id_uq` ON `content_items` (`workspace_id`,`id`);--> statement-breakpoint
CREATE INDEX `content_items_ws_target_id_idx` ON `content_items` (`workspace_id`,`target_publish_date`,`id`);