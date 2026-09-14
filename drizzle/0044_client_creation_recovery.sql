CREATE TABLE `client_creation_receipts` (
	`workspace_id` text NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`workspace_id`, `request_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "client_creation_receipts_hash_chk" CHECK(length(fingerprint)=64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_creation_receipts_client_uq` ON `client_creation_receipts` (`workspace_id`,`client_id`);
--> statement-breakpoint
CREATE TRIGGER client_creation_receipts_immutable_update BEFORE UPDATE ON client_creation_receipts BEGIN SELECT RAISE(ABORT,'Client creation receipt is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER client_creation_receipts_immutable_delete BEFORE DELETE ON client_creation_receipts BEGIN SELECT RAISE(ABORT,'Client creation receipt is immutable'); END;
