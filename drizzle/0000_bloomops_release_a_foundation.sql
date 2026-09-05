CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`issuer` text,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`event_type` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`actor_membership_id` text,
	`actor_user_id` text,
	`client_id` text,
	`service_engagement_id` text,
	`metadata_json` text,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`,`actor_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`service_engagement_id`) REFERENCES `service_engagements`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "activity_events_event_type_chk" CHECK(event_type GLOB '[A-Z]*' AND event_type = upper(event_type))
);
--> statement-breakpoint
CREATE INDEX `activity_events_ws_occurred_idx` ON `activity_events` (`workspace_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_events_client_occurred_idx` ON `activity_events` (`client_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_events_subject_idx` ON `activity_events` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE TABLE `client_assignments` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`assignment_role` text DEFAULT 'member' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "client_assignments_role_chk" CHECK(assignment_role IN ('lead', 'member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_assignments_client_member_uq` ON `client_assignments` (`client_id`,`membership_id`);--> statement-breakpoint
CREATE INDEX `client_assignments_member_idx` ON `client_assignments` (`membership_id`);--> statement-breakpoint
CREATE TABLE `client_contacts` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`title` text,
	`user_id` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `client_contacts_client_idx` ON `client_contacts` (`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `client_contacts_client_email_uq` ON `client_contacts` (`client_id`,`email`) WHERE email IS NOT NULL;--> statement-breakpoint
CREATE TABLE `bloomops_clients` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`company` text,
	`slug` text NOT NULL,
	`relationship_status` text DEFAULT 'draft' NOT NULL,
	`health` text DEFAULT 'on_track' NOT NULL,
	`timezone` text,
	`website` text,
	`start_date` text,
	`end_date` text,
	`owner_membership_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`owner_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bloomops_clients_relationship_status_chk" CHECK(relationship_status IN ('draft', 'onboarding', 'active', 'paused', 'completed', 'ended')),
	CONSTRAINT "bloomops_clients_health_chk" CHECK(health IN ('on_track', 'needs_attention', 'at_risk'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bloomops_clients_ws_id_uq` ON `bloomops_clients` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bloomops_clients_ws_slug_uq` ON `bloomops_clients` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE INDEX `bloomops_clients_ws_status_idx` ON `bloomops_clients` (`workspace_id`,`relationship_status`);--> statement-breakpoint
CREATE TABLE `department_memberships` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`department_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`is_lead` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`department_id`) REFERENCES `departments`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `department_memberships_dept_member_uq` ON `department_memberships` (`department_id`,`membership_id`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_ws_id_uq` ON `departments` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `departments_ws_slug_uq` ON `departments` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE TABLE `member_capabilities` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`capability` text NOT NULL,
	`granted_by_membership_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`granted_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "member_capabilities_capability_chk" CHECK(capability GLOB '[a-z]*.[a-z]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_capabilities_member_cap_uq` ON `member_capabilities` (`membership_id`,`capability`);--> statement-breakpoint
CREATE TABLE `onboarding_instances` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`template_version_id` text,
	`status` text DEFAULT 'not_started' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`completed_by_membership_id` text,
	`override_reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`template_version_id`) REFERENCES `template_versions`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`completed_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "onboarding_instances_status_chk" CHECK(status IN ('not_started', 'in_progress', 'ready', 'complete', 'blocked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_instances_ws_id_uq` ON `onboarding_instances` (`workspace_id`,`id`);--> statement-breakpoint
CREATE INDEX `onboarding_instances_client_idx` ON `onboarding_instances` (`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_instances_open_client_uq` ON `onboarding_instances` (`client_id`) WHERE status <> 'complete';--> statement-breakpoint
CREATE TABLE `onboarding_item_services` (
	`workspace_id` text NOT NULL,
	`onboarding_item_id` text NOT NULL,
	`service_engagement_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`onboarding_item_id`) REFERENCES `onboarding_items`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`service_engagement_id`) REFERENCES `service_engagements`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_item_services_uq` ON `onboarding_item_services` (`onboarding_item_id`,`service_engagement_id`);--> statement-breakpoint
CREATE INDEX `onboarding_item_services_engagement_idx` ON `onboarding_item_services` (`service_engagement_id`);--> statement-breakpoint
CREATE TABLE `onboarding_items` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`onboarding_instance_id` text NOT NULL,
	`logical_key` text NOT NULL,
	`title` text NOT NULL,
	`instructions` text,
	`required` integer DEFAULT true NOT NULL,
	`verification_required` integer DEFAULT false NOT NULL,
	`responsible_party` text DEFAULT 'client' NOT NULL,
	`responsible_membership_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`visibility` text DEFAULT 'client' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`due_date` text,
	`completed_at` text,
	`completed_by_membership_id` text,
	`verified_at` text,
	`verified_by_membership_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`onboarding_instance_id`) REFERENCES `onboarding_instances`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`responsible_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`completed_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`verified_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "onboarding_items_status_chk" CHECK(status IN ('pending', 'in_progress', 'completed', 'blocked', 'waived', 'not_applicable')),
	CONSTRAINT "onboarding_items_responsible_party_chk" CHECK(responsible_party IN ('client', 'team', 'user', 'external')),
	CONSTRAINT "onboarding_items_visibility_chk" CHECK(visibility IN ('internal', 'client', 'restricted')),
	CONSTRAINT "onboarding_items_logical_key_chk" CHECK(length(logical_key) > 0 AND logical_key = lower(logical_key))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_items_ws_id_uq` ON `onboarding_items` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_items_instance_key_uq` ON `onboarding_items` (`onboarding_instance_id`,`logical_key`);--> statement-breakpoint
CREATE INDEX `onboarding_items_instance_status_idx` ON `onboarding_items` (`onboarding_instance_id`,`status`);--> statement-breakpoint
CREATE TABLE `service_assignments` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`service_engagement_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`assignment_role` text DEFAULT 'member' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`service_engagement_id`) REFERENCES `service_engagements`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "service_assignments_role_chk" CHECK(assignment_role IN ('lead', 'member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_assignments_engagement_member_uq` ON `service_assignments` (`service_engagement_id`,`membership_id`);--> statement-breakpoint
CREATE INDEX `service_assignments_member_idx` ON `service_assignments` (`membership_id`);--> statement-breakpoint
CREATE TABLE `service_engagements` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`service_type_id` text NOT NULL,
	`package_name` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`start_date` text,
	`end_date` text,
	`approval_preference` text,
	`scope_notes` text,
	`source_template_version_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`service_type_id`) REFERENCES `service_types`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`source_template_version_id`) REFERENCES `template_versions`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "service_engagements_status_chk" CHECK(status IN ('planned', 'onboarding', 'active', 'paused', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_engagements_ws_id_uq` ON `service_engagements` (`workspace_id`,`id`);--> statement-breakpoint
CREATE INDEX `service_engagements_client_idx` ON `service_engagements` (`client_id`);--> statement-breakpoint
CREATE INDEX `service_engagements_ws_status_idx` ON `service_engagements` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `service_types` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`department_id` text,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`department_id`) REFERENCES `departments`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_types_ws_id_uq` ON `service_types` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `service_types_ws_slug_uq` ON `service_types` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `template_versions` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`template_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`definition_json` text NOT NULL,
	`definition_hash` text NOT NULL,
	`notes` text,
	`created_by_membership_id` text,
	`published_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`template_id`) REFERENCES `templates`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`created_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "template_versions_status_chk" CHECK(status IN ('draft', 'published', 'retired')),
	CONSTRAINT "template_versions_version_number_chk" CHECK(version_number >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_versions_ws_id_uq` ON `template_versions` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `template_versions_template_version_uq` ON `template_versions` (`template_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "templates_kind_chk" CHECK(kind IN ('onboarding', 'project', 'social', 'systems', 'ads'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `templates_ws_id_uq` ON `templates` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `templates_ws_kind_slug_uq` ON `templates` (`workspace_id`,`kind`,`slug`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `workspace_invitations` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token_hash` text NOT NULL,
	`client_id` text,
	`invited_by_membership_id` text,
	`accepted_membership_id` text,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`revoked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`invited_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`accepted_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "workspace_invitations_role_chk" CHECK(role IN ('owner', 'admin', 'project_manager', 'team_member', 'client')),
	CONSTRAINT "workspace_invitations_status_chk" CHECK(status IN ('pending', 'accepted', 'expired', 'revoked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invitations_token_hash_uq` ON `workspace_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `workspace_invitations_ws_email_idx` ON `workspace_invitations` (`workspace_id`,`email`);--> statement-breakpoint
CREATE TABLE `workspace_memberships` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`invited_by_membership_id` text,
	`joined_at` text,
	`suspended_at` text,
	`removed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "workspace_memberships_role_chk" CHECK(role IN ('owner', 'admin', 'project_manager', 'team_member', 'client')),
	CONSTRAINT "workspace_memberships_status_chk" CHECK(status IN ('invited', 'active', 'suspended', 'removed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_memberships_ws_id_uq` ON `workspace_memberships` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_memberships_ws_user_uq` ON `workspace_memberships` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `workspace_memberships_user_idx` ON `workspace_memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "workspaces_status_chk" CHECK(status IN ('active', 'suspended', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_uq` ON `workspaces` (`slug`);