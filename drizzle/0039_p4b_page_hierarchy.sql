CREATE TABLE `bloomops_page_locations` (
	`page_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`parent_id` text,
	`position` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`page_id`) REFERENCES `bloomops_pages`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`parent_id`) REFERENCES `bloomops_pages`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bloomops_page_locations_self_ck" CHECK("bloomops_page_locations"."parent_id" IS NULL OR "bloomops_page_locations"."parent_id"!="bloomops_page_locations"."page_id"),
	CONSTRAINT "bloomops_page_locations_position_ck" CHECK("bloomops_page_locations"."position">=0)
);
--> statement-breakpoint
CREATE INDEX `bloomops_page_locations_parent_idx` ON `bloomops_page_locations` (`workspace_id`,`parent_id`,`position`,`page_id`);--> statement-breakpoint
CREATE TABLE `bloomops_page_trees` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bloomops_page_trees_revision_ck" CHECK("bloomops_page_trees"."revision">=0)
);

--> statement-breakpoint
INSERT INTO bloomops_page_trees(workspace_id,revision) SELECT id,0 FROM workspaces;
--> statement-breakpoint
INSERT INTO bloomops_page_locations(page_id,workspace_id,parent_id,position)
SELECT id,workspace_id,NULL,row_number() OVER(PARTITION BY workspace_id ORDER BY updated_at DESC,id DESC)-1 FROM bloomops_pages;
