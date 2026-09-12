CREATE TABLE `workspace_creations` (
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`initial_name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `request_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_creations_workspace_uq` ON `workspace_creations` (`workspace_id`);--> statement-breakpoint
ALTER TABLE workspaces ADD COLUMN purpose text DEFAULT 'operations' NOT NULL CONSTRAINT workspaces_purpose_chk CHECK(purpose IN ('operations','prospecting'));
--> statement-breakpoint
CREATE TRIGGER workspaces_purpose_immutable BEFORE UPDATE OF purpose ON workspaces
WHEN NEW.purpose IS NOT OLD.purpose BEGIN SELECT RAISE(ABORT,'Workspace purpose is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER workspaces_purpose_replace_guard BEFORE INSERT ON workspaces
WHEN EXISTS (SELECT 1 FROM workspaces w WHERE (w.id=NEW.id OR w.slug=NEW.slug OR w.rowid=NEW.rowid) AND w.purpose IS NOT NEW.purpose)
BEGIN SELECT RAISE(ABORT,'Workspace replacement cannot change its purpose'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_creations_insert_guard BEFORE INSERT ON workspace_creations
WHEN EXISTS (SELECT 1 FROM workspace_creations r WHERE r.rowid=NEW.rowid OR r.workspace_id=NEW.workspace_id OR (r.user_id=NEW.user_id AND r.request_id=NEW.request_id))
 OR NOT EXISTS (SELECT 1 FROM workspaces w JOIN workspace_memberships m ON m.workspace_id=w.id
 WHERE w.id=NEW.workspace_id AND w.purpose='prospecting' AND w.status='active' AND m.user_id=NEW.user_id AND m.role='owner' AND m.status='active')
BEGIN SELECT RAISE(ABORT,'Fresh workspace receipt requires its owner'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_creations_no_update BEFORE UPDATE ON workspace_creations BEGIN SELECT RAISE(ABORT,'Workspace creation receipts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_creations_no_delete BEFORE DELETE ON workspace_creations BEGIN SELECT RAISE(ABORT,'Workspace creation receipts are retained'); END;
