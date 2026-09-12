-- Additive evidence foundation. Retain every existing row and historical trigger name.
ALTER TABLE content_review_revisions ADD COLUMN review_scope text DEFAULT 'copy_only' NOT NULL CONSTRAINT content_review_revisions_scope_chk CHECK(review_scope IN ('copy_only','copy_and_media'));
--> statement-breakpoint
ALTER TABLE content_review_revisions ADD COLUMN media_count integer DEFAULT 0 NOT NULL CONSTRAINT content_review_revisions_media_count_chk CHECK(typeof(media_count)='integer' AND ((review_scope='copy_only' AND media_count=0) OR (review_scope='copy_and_media' AND media_count BETWEEN 1 AND 10)));
--> statement-breakpoint
CREATE UNIQUE INDEX content_asset_links_ws_content_asset_uq ON content_asset_links(workspace_id,content_id,asset_id);
--> statement-breakpoint
CREATE TABLE `content_review_assets` (
	`workspace_id` text NOT NULL,
	`content_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`position` integer NOT NULL,
	`file_revision` integer NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`object_key` text NOT NULL,
	`etag` text NOT NULL,
	`ready_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `revision_id`, `asset_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`content_id`,`revision_id`) REFERENCES `content_review_revisions`(`workspace_id`,`content_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`content_id`,`asset_id`) REFERENCES `content_asset_links`(`workspace_id`,`content_id`,`asset_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "content_review_assets_position_chk" CHECK(typeof(position)='integer' AND position BETWEEN 1 AND 10),
	CONSTRAINT "content_review_assets_revision_chk" CHECK(typeof(file_revision)='integer' AND file_revision>=1),
	CONSTRAINT "content_review_assets_size_chk" CHECK(typeof(byte_size)='integer' AND byte_size BETWEEN 1 AND 5242880),
	CONSTRAINT "content_review_assets_hash_chk" CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "content_review_assets_type_chk" CHECK(mime_type IN ('image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm')),
	CONSTRAINT "content_review_assets_evidence_chk" CHECK(length(filename) BETWEEN 1 AND 180 AND length(object_key)>0 AND length(etag)>0 AND length(ready_at)>0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_review_assets_position_uq` ON `content_review_assets` (`workspace_id`,`revision_id`,`position`);--> statement-breakpoint
CREATE INDEX `content_review_assets_asset_idx` ON `content_review_assets` (`asset_id`);--> statement-breakpoint
CREATE INDEX `content_review_assets_key_idx` ON `content_review_assets` (`object_key`);--> statement-breakpoint
--> statement-breakpoint
DROP TRIGGER content_review_revisions_insert_guard;
--> statement-breakpoint
CREATE TRIGGER content_review_revisions_insert_guard BEFORE INSERT ON content_review_revisions
WHEN EXISTS (SELECT 1 FROM content_review_revisions v WHERE v.id=NEW.id OR v.rowid=NEW.rowid OR (v.workspace_id=NEW.workspace_id AND v.content_id=NEW.content_id AND v.number=NEW.number))
 OR NOT EXISTS (SELECT 1 FROM content_items c WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.content_id
 AND NEW.title IS c.title AND NEW.type IS c.type AND NEW.hook IS c.hook AND NEW.script IS c.script AND NEW.caption IS c.caption AND NEW.cta IS c.cta AND NEW.target_publish_date IS c.target_publish_date AND NEW.platforms_json=(SELECT json_group_array(label) FROM (SELECT cp.label FROM content_platforms cp WHERE cp.workspace_id=c.workspace_id AND cp.content_id=c.id ORDER BY cp.platform_key))
 AND NEW.number=(SELECT coalesce(max(v.number),0)+1 FROM content_review_revisions v WHERE v.workspace_id=c.workspace_id AND v.content_id=c.id)
 AND ((c.production_area='social' AND c.ads_project_id IS NULL AND c.stage='client_review' AND c.client_approval_required=1 AND c.visibility='client' AND NEW.review_scope='copy_only' AND NEW.media_count=0)
 OR (c.production_area='ads' AND c.visibility='internal' AND c.recording_required=0 AND c.internal_review_required=1 AND c.client_approval_required=1 AND c.published_at IS NULL
 AND EXISTS (SELECT 1 FROM projects p JOIN service_engagements se ON se.workspace_id=p.workspace_id AND se.client_id=p.client_id AND se.id=p.service_engagement_id
 JOIN service_types st ON st.workspace_id=se.workspace_id AND st.id=se.service_type_id JOIN departments d ON d.workspace_id=st.workspace_id AND d.id=st.department_id
 WHERE p.id=c.ads_project_id AND p.workspace_id=c.workspace_id AND p.client_id=c.client_id AND p.service_engagement_id=c.service_engagement_id AND p.visibility IN ('internal','client') AND d.slug='ads') AND c.stage='internal_review' AND NOT EXISTS (SELECT 1 FROM content_approval_rounds r WHERE r.workspace_id=c.workspace_id AND r.content_id=c.id AND r.status='requested'))))
BEGIN SELECT RAISE(ABORT,'Review revisions capture eligible immutable Content'); END;
--> statement-breakpoint
CREATE TRIGGER content_review_assets_insert_guard BEFORE INSERT ON content_review_assets
WHEN EXISTS (SELECT 1 FROM content_review_assets e WHERE e.rowid=NEW.rowid OR (e.workspace_id=NEW.workspace_id AND e.revision_id=NEW.revision_id AND (e.asset_id=NEW.asset_id OR e.position=NEW.position)))
 OR NOT EXISTS (SELECT 1 FROM content_review_revisions v JOIN content_items c ON c.workspace_id=v.workspace_id AND c.id=v.content_id
 JOIN content_asset_links l ON l.workspace_id=c.workspace_id AND l.content_id=c.id
 JOIN assets f ON f.workspace_id=l.workspace_id AND f.id=l.asset_id
 WHERE v.workspace_id=NEW.workspace_id AND v.content_id=NEW.content_id AND v.id=NEW.revision_id AND f.id=NEW.asset_id
 AND c.production_area='ads' AND c.visibility='internal' AND c.recording_required=0 AND c.internal_review_required=1 AND c.client_approval_required=1 AND c.published_at IS NULL
 AND EXISTS (SELECT 1 FROM projects p JOIN service_engagements se ON se.workspace_id=p.workspace_id AND se.client_id=p.client_id AND se.id=p.service_engagement_id
 JOIN service_types st ON st.workspace_id=se.workspace_id AND st.id=se.service_type_id JOIN departments d ON d.workspace_id=st.workspace_id AND d.id=st.department_id
 WHERE p.id=c.ads_project_id AND p.workspace_id=c.workspace_id AND p.client_id=c.client_id AND p.service_engagement_id=c.service_engagement_id AND p.visibility IN ('internal','client') AND d.slug='ads') AND c.stage='internal_review' AND v.review_scope='copy_and_media' AND NEW.position BETWEEN 1 AND v.media_count
 AND l.purpose='asset' AND f.status='ready' AND f.visibility='internal' AND NEW.file_revision=f.revision AND NEW.filename IS f.filename AND NEW.mime_type IS f.mime_type AND NEW.byte_size IS f.byte_size AND NEW.sha256 IS f.sha256 AND NEW.object_key IS f.object_key AND NEW.etag IS f.etag AND NEW.ready_at IS f.ready_at
 AND NOT EXISTS (SELECT 1 FROM content_approval_rounds r WHERE r.workspace_id=v.workspace_id AND r.content_id=v.content_id AND r.revision_id=v.id))
BEGIN SELECT RAISE(ABORT,'Review media requires exact unsealed ready evidence'); END;
--> statement-breakpoint
CREATE TRIGGER content_review_assets_no_update BEFORE UPDATE ON content_review_assets BEGIN SELECT RAISE(ABORT,'Review media is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER content_review_assets_no_delete BEFORE DELETE ON content_review_assets BEGIN SELECT RAISE(ABORT,'Review media is retained'); END;
--> statement-breakpoint
DROP TRIGGER content_approval_rounds_insert_guard;
--> statement-breakpoint
CREATE TRIGGER content_approval_rounds_insert_guard BEFORE INSERT ON content_approval_rounds
WHEN NEW.status<>'requested'
 OR EXISTS (SELECT 1 FROM content_approval_rounds r WHERE r.id=NEW.id OR r.rowid=NEW.rowid OR (r.workspace_id=NEW.workspace_id AND r.content_id=NEW.content_id AND (r.status='requested' OR r.revision_id=NEW.revision_id OR r.number=NEW.number OR r.request_id=NEW.request_id)))
 OR NOT EXISTS (SELECT 1 FROM content_review_revisions v JOIN content_items c ON c.workspace_id=v.workspace_id AND c.id=v.content_id
 WHERE v.workspace_id=NEW.workspace_id AND v.content_id=NEW.content_id AND v.id=NEW.revision_id AND v.number=NEW.number
 AND ((c.production_area='social' AND c.ads_project_id IS NULL AND v.review_scope='copy_only' AND v.media_count=0)
 OR (c.production_area='ads' AND c.visibility='internal' AND c.recording_required=0 AND c.internal_review_required=1 AND c.client_approval_required=1 AND c.published_at IS NULL
 AND EXISTS (SELECT 1 FROM projects p JOIN service_engagements se ON se.workspace_id=p.workspace_id AND se.client_id=p.client_id AND se.id=p.service_engagement_id
 JOIN service_types st ON st.workspace_id=se.workspace_id AND st.id=se.service_type_id JOIN departments d ON d.workspace_id=st.workspace_id AND d.id=st.department_id
 WHERE p.id=c.ads_project_id AND p.workspace_id=c.workspace_id AND p.client_id=c.client_id AND p.service_engagement_id=c.service_engagement_id AND p.visibility IN ('internal','client') AND d.slug='ads') AND c.stage='client_review'
 AND (SELECT count(*) FROM content_review_assets e WHERE e.workspace_id=v.workspace_id AND e.revision_id=v.id)=v.media_count
 AND NOT EXISTS (SELECT 1 FROM content_review_assets e LEFT JOIN content_asset_links l ON l.workspace_id=e.workspace_id AND l.content_id=e.content_id AND l.asset_id=e.asset_id
 LEFT JOIN assets f ON f.workspace_id=l.workspace_id AND f.id=l.asset_id
 WHERE e.workspace_id=v.workspace_id AND e.revision_id=v.id AND (e.content_id IS NOT c.id OR e.position>v.media_count OR f.id IS NULL OR l.purpose<>'asset' OR f.status<>'ready' OR f.visibility<>'internal' OR NOT (e.file_revision=f.revision AND e.filename IS f.filename AND e.mime_type IS f.mime_type AND e.byte_size IS f.byte_size AND e.sha256 IS f.sha256 AND e.object_key IS f.object_key AND e.etag IS f.etag AND e.ready_at IS f.ready_at))))))
BEGIN SELECT RAISE(ABORT,'A round seals its own complete review evidence'); END;
--> statement-breakpoint
CREATE TRIGGER content_approval_rounds_rowid_immutable BEFORE UPDATE ON content_approval_rounds WHEN NEW.rowid IS NOT OLD.rowid BEGIN SELECT RAISE(ABORT,'Approval physical identity is immutable'); END;
--> statement-breakpoint
-- Explicit rowid collisions are also replacements. As with existing provenance
-- guards, an ambiguous unspecified-rowid collision is conservatively refused.
CREATE TRIGGER assets_review_pin_insert_guard BEFORE INSERT ON assets
WHEN EXISTS (SELECT 1 FROM assets f JOIN content_review_assets e ON e.asset_id=f.id WHERE f.id=NEW.id OR f.rowid=NEW.rowid)
BEGIN SELECT RAISE(ABORT,'Retained File identity cannot be replaced'); END;
--> statement-breakpoint
CREATE TRIGGER assets_review_pin_update_guard BEFORE UPDATE ON assets
WHEN EXISTS (SELECT 1 FROM content_review_assets e WHERE e.asset_id=OLD.id)
 AND (NEW.rowid IS NOT OLD.rowid OR NEW.object_key IS NOT OLD.object_key OR NEW.etag IS NOT OLD.etag OR NEW.ready_at IS NOT OLD.ready_at)
BEGIN SELECT RAISE(ABORT,'Retained File generation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER assets_review_pin_no_delete BEFORE DELETE ON assets WHEN EXISTS (SELECT 1 FROM content_review_assets e WHERE e.asset_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Retain submitted File evidence'); END;
--> statement-breakpoint
CREATE TRIGGER content_asset_links_review_pin_insert_guard BEFORE INSERT ON content_asset_links
WHEN EXISTS (SELECT 1 FROM content_asset_links l JOIN content_review_assets e ON e.asset_id=l.asset_id
 WHERE l.asset_id=NEW.asset_id OR l.rowid=NEW.rowid)
BEGIN SELECT RAISE(ABORT,'Retained Content File attachment cannot be replaced'); END;
