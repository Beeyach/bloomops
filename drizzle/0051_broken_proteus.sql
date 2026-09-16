CREATE TABLE `client_report_comparisons` (
	`workspace_id` text NOT NULL,
	`report_id` text NOT NULL,
	`publication_id` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `report_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`report_id`) REFERENCES `client_report_drafts`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`publication_id`) REFERENCES `client_report_publications`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action
);
