CREATE TABLE `prospect_google_attempts` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`member_updated_at` text NOT NULL,
	`session_hash` text NOT NULL,
	`sender_revision` integer NOT NULL,
	`connection_revision` integer NOT NULL,
	`sender_email` text NOT NULL,
	`verifier_box` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_google_attempts_revision_chk" CHECK(typeof(sender_revision)='integer' AND sender_revision>=1 AND typeof(connection_revision)='integer' AND connection_revision>=0)
);
--> statement-breakpoint
CREATE INDEX `prospect_google_attempts_member_idx` ON `prospect_google_attempts` (`workspace_id`,`membership_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `prospect_google_connections` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`sender_email` text NOT NULL,
	`account_email` text,
	`token_box` text,
	`granted_scope` text,
	`active` integer NOT NULL,
	`authorized_by_membership_id` text NOT NULL,
	`authorizer_updated_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`authorized_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_google_connections_revision_chk" CHECK(typeof(revision)='integer' AND revision>=1),
	CONSTRAINT "prospect_google_connections_active_chk" CHECK(active IN (0,1) AND (active=0 OR (token_box IS NOT NULL AND account_email IS NOT NULL AND granted_scope IS NOT NULL)))
);
