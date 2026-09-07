CREATE TABLE `client_activations` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`onboarding_instance_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`recipient_email` text NOT NULL,
	`invitee_name` text NOT NULL,
	`actor_membership_id` text NOT NULL,
	`invitation_id` text,
	`delivery_status` text DEFAULT 'pending' NOT NULL,
	`delivery_attempt_id` text,
	`delivery_lease_until` text,
	`delivered_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`actor_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`onboarding_instance_id`) REFERENCES `onboarding_instances`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`contact_id`) REFERENCES `client_contacts`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`invitation_id`) REFERENCES `workspace_invitations`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "client_activations_delivery_chk" CHECK(delivery_status IN ('pending', 'sending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_activations_client_uq` ON `client_activations` (`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `client_activations_instance_uq` ON `client_activations` (`onboarding_instance_id`);--> statement-breakpoint
CREATE TABLE `client_invitation_contacts` (
	`invitation_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`invitation_id`) REFERENCES `workspace_invitations`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`contact_id`) REFERENCES `client_contacts`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_contacts_ws_client_id_uq` ON `client_contacts` (`workspace_id`,`client_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_instances_ws_client_id_uq` ON `onboarding_instances` (`workspace_id`,`client_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invitations_ws_client_id_uq` ON `workspace_invitations` (`workspace_id`,`client_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER client_invitation_contacts_immutable_update BEFORE UPDATE ON client_invitation_contacts BEGIN SELECT RAISE(ABORT, 'invited contact association is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER client_invitation_contacts_immutable_delete BEFORE DELETE ON client_invitation_contacts BEGIN SELECT RAISE(ABORT, 'invited contact association is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER client_activations_immutable_core BEFORE UPDATE OF id, workspace_id, client_id, onboarding_instance_id, contact_id, recipient_email, invitee_name, actor_membership_id, created_at ON client_activations BEGIN SELECT RAISE(ABORT, 'activation core is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER client_activations_immutable_delete BEFORE DELETE ON client_activations BEGIN SELECT RAISE(ABORT, 'activation core is immutable'); END;
