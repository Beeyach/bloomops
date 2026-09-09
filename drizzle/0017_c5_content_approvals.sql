CREATE TABLE `content_approval_rounds` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`content_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`number` integer NOT NULL,
	`request_id` text NOT NULL,
	`request_revision` integer NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`responded_by` text,
	`responded_at` text,
	`feedback` text,
	`withdrawn_by` text,
	`withdrawn_at` text,
	`withdrawal_reason` text,
	`completion_revision` integer,
	`completion_id` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`content_id`,`revision_id`) REFERENCES `content_review_revisions`(`workspace_id`,`content_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`requested_by`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`responded_by`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`withdrawn_by`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "content_approval_rounds_status_chk" CHECK(status IN ('requested','approved','changes_requested','withdrawn')),
	CONSTRAINT "content_approval_rounds_number_chk" CHECK(typeof(number)='integer' AND number>=1 AND typeof(request_revision)='integer' AND request_revision>=1),
	CONSTRAINT "content_approval_rounds_request_chk" CHECK(length(request_id)=36),
	CONSTRAINT "content_approval_rounds_feedback_chk" CHECK(feedback IS NULL OR length(trim(feedback)) BETWEEN 1 AND 2000),
	CONSTRAINT "content_approval_rounds_reason_chk" CHECK(withdrawal_reason IS NULL OR length(trim(withdrawal_reason)) BETWEEN 1 AND 2000),
	CONSTRAINT "content_approval_rounds_resolution_chk" CHECK((status='requested' AND responded_by IS NULL AND responded_at IS NULL AND feedback IS NULL AND withdrawn_by IS NULL AND withdrawn_at IS NULL AND withdrawal_reason IS NULL AND completion_revision IS NULL AND completion_id IS NULL)
    OR (completion_revision>=request_revision+1 AND completion_id IS NOT NULL AND ((status IN ('approved','changes_requested') AND responded_by IS NOT NULL AND responded_at IS NOT NULL AND withdrawn_by IS NULL AND withdrawn_at IS NULL AND withdrawal_reason IS NULL AND ((status='approved' AND feedback IS NULL) OR (status='changes_requested' AND feedback IS NOT NULL)))
    OR (status='withdrawn' AND withdrawn_by IS NOT NULL AND withdrawn_at IS NOT NULL AND responded_by IS NULL AND responded_at IS NULL AND feedback IS NULL))))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_approval_rounds_number_uq` ON `content_approval_rounds` (`workspace_id`,`content_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_approval_rounds_revision_uq` ON `content_approval_rounds` (`workspace_id`,`content_id`,`revision_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_approval_rounds_request_uq` ON `content_approval_rounds` (`workspace_id`,`content_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_approval_rounds_requested_uq` ON `content_approval_rounds` (`workspace_id`,`content_id`) WHERE status='requested';--> statement-breakpoint
CREATE INDEX `content_approval_rounds_status_idx` ON `content_approval_rounds` (`workspace_id`,`status`,`requested_at`,`id`);--> statement-breakpoint
CREATE TABLE `content_review_revisions` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`content_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`hook` text,
	`script` text,
	`caption` text,
	`cta` text,
	`target_publish_date` text,
	`platforms_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`content_id`) REFERENCES `content_items`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "content_review_revisions_number_chk" CHECK(typeof(number)='integer' AND number>=1),
	CONSTRAINT "content_review_revisions_platforms_chk" CHECK(json_valid(platforms_json) AND json_type(platforms_json)='array' AND json_array_length(platforms_json)<=12)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_review_revisions_parent_id_uq` ON `content_review_revisions` (`workspace_id`,`content_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_review_revisions_number_uq` ON `content_review_revisions` (`workspace_id`,`content_id`,`number`);
--> statement-breakpoint
-- Immutable review history: no replacements, deletions or retargeting.
CREATE TRIGGER content_review_revisions_insert_guard BEFORE INSERT ON content_review_revisions
WHEN NOT EXISTS (SELECT 1 FROM content_items c WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.content_id
 AND c.stage='client_review' AND c.client_approval_required=1 AND c.visibility='client'
 AND NEW.title IS c.title AND NEW.type IS c.type AND NEW.hook IS c.hook AND NEW.script IS c.script AND NEW.caption IS c.caption AND NEW.cta IS c.cta AND NEW.target_publish_date IS c.target_publish_date
 AND NEW.platforms_json=(SELECT json_group_array(label) FROM (SELECT cp.label FROM content_platforms cp WHERE cp.workspace_id=c.workspace_id AND cp.content_id=c.id ORDER BY cp.platform_key))
 AND NEW.number=(SELECT coalesce(max(v.number),0)+1 FROM content_review_revisions v WHERE v.workspace_id=c.workspace_id AND v.content_id=c.id))
BEGIN SELECT RAISE(ABORT,'Review revisions capture current eligible Content'); END;
--> statement-breakpoint
CREATE TRIGGER content_review_revisions_no_update BEFORE UPDATE ON content_review_revisions BEGIN SELECT RAISE(ABORT,'Review revisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER content_review_revisions_no_delete BEFORE DELETE ON content_review_revisions BEGIN SELECT RAISE(ABORT,'Review revisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER content_approval_rounds_no_delete BEFORE DELETE ON content_approval_rounds BEGIN SELECT RAISE(ABORT,'Approval rounds are durable'); END;
--> statement-breakpoint
CREATE TRIGGER content_approval_rounds_insert_guard BEFORE INSERT ON content_approval_rounds
WHEN NEW.status<>'requested' OR NOT EXISTS (SELECT 1 FROM content_review_revisions v WHERE v.workspace_id=NEW.workspace_id AND v.content_id=NEW.content_id AND v.id=NEW.revision_id AND v.number=NEW.number)
BEGIN SELECT RAISE(ABORT,'A round starts with its own review revision'); END;
--> statement-breakpoint
CREATE TRIGGER content_approval_rounds_update_guard BEFORE UPDATE ON content_approval_rounds
WHEN OLD.status<>'requested' OR NEW.status='requested' OR NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id
 OR NEW.content_id IS NOT OLD.content_id OR NEW.revision_id IS NOT OLD.revision_id OR NEW.number IS NOT OLD.number
 OR NEW.request_id IS NOT OLD.request_id OR NEW.request_revision IS NOT OLD.request_revision OR NEW.requested_by IS NOT OLD.requested_by OR NEW.requested_at IS NOT OLD.requested_at
 OR NEW.completion_revision IS NULL OR typeof(NEW.completion_revision)<>'integer'
BEGIN SELECT RAISE(ABORT,'Approval history is immutable'); END;
--> statement-breakpoint
-- Defense in depth. Authorization facts (especially visibility) stay live and
-- editable. Resolving/withdrawing the round unlocks these fields in the same
-- transaction, before the canonical Content stage changes.
CREATE TRIGGER content_items_approval_freeze BEFORE UPDATE ON content_items
WHEN EXISTS (SELECT 1 FROM content_approval_rounds r WHERE r.workspace_id=OLD.workspace_id AND r.content_id=OLD.id AND r.status='requested')
 AND (NEW.title IS NOT OLD.title OR NEW.type IS NOT OLD.type OR NEW.hook IS NOT OLD.hook OR NEW.script IS NOT OLD.script OR NEW.caption IS NOT OLD.caption OR NEW.cta IS NOT OLD.cta
 OR NEW.target_publish_date IS NOT OLD.target_publish_date OR NEW.recording_required IS NOT OLD.recording_required OR NEW.internal_review_required IS NOT OLD.internal_review_required
 OR NEW.client_approval_required IS NOT OLD.client_approval_required OR NEW.stage IS NOT OLD.stage OR NEW.stage_context IS NOT OLD.stage_context)
BEGIN SELECT RAISE(ABORT,'Withdraw the requested approval before changing reviewed Content'); END;
--> statement-breakpoint
CREATE TRIGGER content_platforms_approval_insert BEFORE INSERT ON content_platforms
WHEN EXISTS (SELECT 1 FROM content_approval_rounds r WHERE r.workspace_id=NEW.workspace_id AND r.content_id=NEW.content_id AND r.status='requested')
BEGIN SELECT RAISE(ABORT,'Requested review platforms are frozen'); END;
--> statement-breakpoint
CREATE TRIGGER content_platforms_approval_update BEFORE UPDATE ON content_platforms
WHEN EXISTS (SELECT 1 FROM content_approval_rounds r WHERE r.status='requested' AND ((r.workspace_id=OLD.workspace_id AND r.content_id=OLD.content_id) OR (r.workspace_id=NEW.workspace_id AND r.content_id=NEW.content_id)))
BEGIN SELECT RAISE(ABORT,'Requested review platforms are frozen'); END;
--> statement-breakpoint
CREATE TRIGGER content_platforms_approval_delete BEFORE DELETE ON content_platforms
WHEN EXISTS (SELECT 1 FROM content_approval_rounds r WHERE r.workspace_id=OLD.workspace_id AND r.content_id=OLD.content_id AND r.status='requested')
BEGIN SELECT RAISE(ABORT,'Requested review platforms are frozen'); END;
