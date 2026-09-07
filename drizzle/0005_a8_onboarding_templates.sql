CREATE TABLE `onboarding_instance_templates` (
	`workspace_id` text NOT NULL,
	`onboarding_instance_id` text NOT NULL,
	`template_version_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`onboarding_instance_id`) REFERENCES `onboarding_instances`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`template_version_id`) REFERENCES `template_versions`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_instance_templates_uq` ON `onboarding_instance_templates` (`onboarding_instance_id`,`template_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `template_versions_published_uq` ON `template_versions` (`template_id`) WHERE status = 'published';--> statement-breakpoint
-- Provenance is append-only audit data; operational item progress is not.
CREATE TRIGGER onboarding_instance_templates_immutable_update
BEFORE UPDATE ON onboarding_instance_templates
BEGIN
  SELECT RAISE(ABORT, 'onboarding source provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER onboarding_instance_templates_immutable_delete
BEFORE DELETE ON onboarding_instance_templates
BEGIN
  SELECT RAISE(ABORT, 'onboarding source provenance is immutable');
END;
