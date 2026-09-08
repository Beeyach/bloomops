CREATE TABLE `content_items` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`service_engagement_id` text,
	`creation_request_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`pillar` text,
	`owner_membership_id` text,
	`hook` text,
	`script` text,
	`caption` text,
	`cta` text,
	`recording_required` integer DEFAULT false NOT NULL,
	`internal_review_required` integer DEFAULT true NOT NULL,
	`client_approval_required` integer DEFAULT true NOT NULL,
	`stage` text DEFAULT 'idea' NOT NULL,
	`target_publish_date` text,
	`published_at` text,
	`visibility` text DEFAULT 'internal' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`owner_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`service_engagement_id`) REFERENCES `service_engagements`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "content_items_type_chk" CHECK(type IN ('reel', 'static_post', 'carousel', 'story', 'video', 'email', 'ad_creative', 'other')),
	CONSTRAINT "content_items_stage_chk" CHECK(stage IN ('idea', 'script', 'waiting_for_recording', 'editing', 'internal_review', 'client_review', 'revision_requested', 'approved', 'scheduled', 'published')),
	CONSTRAINT "content_items_visibility_chk" CHECK(visibility IN ('internal', 'client', 'restricted')),
	CONSTRAINT "content_items_title_chk" CHECK(length(trim(title)) BETWEEN 1 AND 200),
	CONSTRAINT "content_items_pillar_chk" CHECK(pillar IS NULL OR length(trim(pillar)) BETWEEN 1 AND 120),
	CONSTRAINT "content_items_hook_chk" CHECK(hook IS NULL OR length(trim(hook)) BETWEEN 1 AND 2000),
	CONSTRAINT "content_items_script_chk" CHECK(script IS NULL OR length(trim(script)) BETWEEN 1 AND 20000),
	CONSTRAINT "content_items_caption_chk" CHECK(caption IS NULL OR length(trim(caption)) BETWEEN 1 AND 10000),
	CONSTRAINT "content_items_cta_chk" CHECK(cta IS NULL OR length(trim(cta)) BETWEEN 1 AND 1000),
	CONSTRAINT "content_items_recording_required_chk" CHECK(recording_required IN (0,1)),
	CONSTRAINT "content_items_internal_review_required_chk" CHECK(internal_review_required IN (0,1)),
	CONSTRAINT "content_items_client_approval_required_chk" CHECK(client_approval_required IN (0,1)),
	CONSTRAINT "content_items_request_chk" CHECK(length(creation_request_id)=36),
	CONSTRAINT "content_items_revision_chk" CHECK(typeof(revision)='integer' AND revision>=1),
	CONSTRAINT "content_items_target_chk" CHECK(target_publish_date IS NULL OR (length(target_publish_date)=10 AND target_publish_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(target_publish_date,'+0 days') IS NOT NULL AND date(target_publish_date,'+0 days')=target_publish_date)),
	CONSTRAINT "content_items_published_chk" CHECK((stage='published' AND published_at IS NOT NULL) OR (stage<>'published' AND published_at IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_items_client_request_uq` ON `content_items` (`workspace_id`,`client_id`,`creation_request_id`);--> statement-breakpoint
CREATE INDEX `content_items_ws_created_idx` ON `content_items` (`workspace_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `content_items_ws_client_created_idx` ON `content_items` (`workspace_id`,`client_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `content_items_ws_service_created_idx` ON `content_items` (`workspace_id`,`service_engagement_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TRIGGER content_items_identity_immutable BEFORE UPDATE ON content_items
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.client_id IS NOT OLD.client_id
 OR NEW.service_engagement_id IS NOT OLD.service_engagement_id OR NEW.creation_request_id IS NOT OLD.creation_request_id
 OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'Content identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER content_items_social_service BEFORE INSERT ON content_items
WHEN NEW.service_engagement_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM service_engagements se JOIN service_types st ON st.workspace_id=se.workspace_id AND st.id=se.service_type_id
 JOIN departments d ON d.workspace_id=st.workspace_id AND d.id=st.department_id
 WHERE se.workspace_id=NEW.workspace_id AND se.client_id=NEW.client_id AND se.id=NEW.service_engagement_id AND d.slug='social'
)
BEGIN SELECT RAISE(ABORT, 'Content requires its canonical Social service'); END;
