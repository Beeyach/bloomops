CREATE TABLE `onboarding_item_resolutions` (
	`onboarding_item_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`reason` text NOT NULL,
	`resolved_by_membership_id` text NOT NULL,
	`resolved_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`onboarding_item_id`) REFERENCES `onboarding_items`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`resolved_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "onboarding_resolutions_reason_chk" CHECK(length(trim(reason)) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE `onboarding_item_submissions` (
	`onboarding_item_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`submitted_by_membership_id` text NOT NULL,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`onboarding_item_id`) REFERENCES `onboarding_items`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`submitted_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TRIGGER onboarding_submissions_no_update BEFORE UPDATE ON onboarding_item_submissions BEGIN SELECT RAISE(ABORT, 'onboarding submission is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_submissions_no_delete BEFORE DELETE ON onboarding_item_submissions BEGIN SELECT RAISE(ABORT, 'onboarding submission is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_resolutions_no_update BEFORE UPDATE ON onboarding_item_resolutions BEGIN SELECT RAISE(ABORT, 'onboarding resolution is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_resolutions_no_delete BEFORE DELETE ON onboarding_item_resolutions BEGIN SELECT RAISE(ABORT, 'onboarding resolution is immutable'); END;
