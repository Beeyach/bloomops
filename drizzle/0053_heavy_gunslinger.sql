CREATE TABLE `bloomops_page_contexts` (
	`page_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text,
	`project_id` text,
	`revision` integer NOT NULL,
	`mutation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`page_id`) REFERENCES `bloomops_pages`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bloomops_page_contexts_parent_ck" CHECK("bloomops_page_contexts"."project_id" IS NULL OR "bloomops_page_contexts"."client_id" IS NOT NULL),
	CONSTRAINT "bloomops_page_contexts_revision_ck" CHECK(typeof("bloomops_page_contexts"."revision")='integer' AND "bloomops_page_contexts"."revision">=1),
	CONSTRAINT "bloomops_page_contexts_mutation_ck" CHECK(length("bloomops_page_contexts"."mutation_id")=36)
);
--> statement-breakpoint
CREATE INDEX `bloomops_page_contexts_client_idx` ON `bloomops_page_contexts` (`workspace_id`,`client_id`,`page_id`);--> statement-breakpoint
CREATE INDEX `bloomops_page_contexts_project_idx` ON `bloomops_page_contexts` (`workspace_id`,`project_id`,`page_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_ws_client_id_uq` ON `projects` (`workspace_id`,`client_id`,`id`);