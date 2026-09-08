CREATE TABLE `asset_links` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`deliverable_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`asset_id`) REFERENCES `assets`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`project_id`,`deliverable_id`) REFERENCES `deliverables`(`workspace_id`,`project_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asset_links_ws_project_idx` ON `asset_links` (`workspace_id`,`project_id`,`deliverable_id`);--> statement-breakpoint
CREATE TABLE `asset_upload_attempts` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`object_key` text NOT NULL,
	`cleanup_checked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`asset_id`) REFERENCES `assets`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_attempts_key_uq` ON `asset_upload_attempts` (`object_key`);--> statement-breakpoint
CREATE INDEX `asset_attempts_cleanup_idx` ON `asset_upload_attempts` (`workspace_id`,`asset_id`,`cleanup_checked_at`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`creation_request_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`uploader_membership_id` text NOT NULL,
	`initial_visibility` text NOT NULL,
	`visibility` text DEFAULT 'internal' NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`object_key` text NOT NULL,
	`lease_until` text,
	`etag` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`ready_at` text,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`uploader_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assets_status_chk" CHECK(status IN ('uploading', 'ready', 'failed', 'archived')),
	CONSTRAINT "assets_visibility_chk" CHECK(visibility IN ('internal', 'client', 'restricted')),
	CONSTRAINT "assets_initial_visibility_chk" CHECK(initial_visibility IN ('internal', 'client', 'restricted')),
	CONSTRAINT "assets_name_chk" CHECK(length(trim(filename)) BETWEEN 1 AND 180 AND instr(filename, char(0))=0 AND instr(filename, char(10))=0 AND instr(filename, char(13))=0 AND instr(filename, '/')=0 AND instr(filename, char(92))=0),
	CONSTRAINT "assets_mime_chk" CHECK(length(mime_type) BETWEEN 3 AND 127 AND instr(mime_type, '/')>1 AND instr(mime_type, char(10))=0 AND instr(mime_type, char(13))=0),
	CONSTRAINT "assets_size_chk" CHECK(typeof(byte_size)='integer' AND byte_size BETWEEN 1 AND 5242880),
	CONSTRAINT "assets_hash_chk" CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "assets_request_chk" CHECK(length(creation_request_id)=36),
	CONSTRAINT "assets_revision_chk" CHECK(typeof(revision)='integer' AND revision>=1),
	CONSTRAINT "assets_ready_chk" CHECK((status='ready' AND ready_at IS NOT NULL AND etag IS NOT NULL) OR (status='archived') OR (status IN ('uploading','failed') AND ready_at IS NULL AND etag IS NULL)),
	CONSTRAINT "assets_archive_chk" CHECK((status='archived' AND archived_at IS NOT NULL) OR (status<>'archived' AND archived_at IS NULL)),
	CONSTRAINT "assets_lease_chk" CHECK((status='uploading' AND lease_until IS NOT NULL) OR (status<>'uploading' AND lease_until IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_ws_id_uq` ON `assets` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assets_ws_request_uq` ON `assets` (`workspace_id`,`creation_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assets_key_uq` ON `assets` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `deliverables_ws_project_id_uq` ON `deliverables` (`workspace_id`,`project_id`,`id`);
--> statement-breakpoint
-- Fixed attachments and immutable original request details keep recovery and
-- historical authorization unambiguous. Relinking/versioning is outside B5.
CREATE TRIGGER asset_links_no_update BEFORE UPDATE ON asset_links
BEGIN SELECT RAISE(ABORT, 'File attachments are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER asset_links_no_delete BEFORE DELETE ON asset_links
BEGIN SELECT RAISE(ABORT, 'Archive the File instead'); END;
--> statement-breakpoint
CREATE TRIGGER asset_attempts_immutable BEFORE UPDATE OF id, workspace_id, asset_id, object_key, created_at ON asset_upload_attempts
BEGIN SELECT RAISE(ABORT, 'Upload attempt identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER asset_attempts_no_delete BEFORE DELETE ON asset_upload_attempts
BEGIN SELECT RAISE(ABORT, 'Retain upload recovery evidence'); END;
--> statement-breakpoint
CREATE TRIGGER assets_initial_immutable BEFORE UPDATE OF id, workspace_id, creation_request_id, filename, mime_type, byte_size, sha256, uploader_membership_id, initial_visibility, created_at ON assets
BEGIN SELECT RAISE(ABORT, 'Original File details are immutable'); END;
--> statement-breakpoint
-- A failed generation can never become Ready or reuse its old key. Cleanup
-- may safely delete its key even while another request claims recovery.
CREATE TRIGGER assets_generation_guard BEFORE UPDATE OF status, object_key ON assets
WHEN NOT (
  (OLD.status='uploading' AND NEW.status IN ('ready','failed','archived') AND NEW.object_key=OLD.object_key)
  OR (OLD.status IN ('uploading','failed') AND NEW.status='uploading' AND NEW.object_key<>OLD.object_key
      AND NOT EXISTS (SELECT 1 FROM asset_upload_attempts WHERE object_key=NEW.object_key))
  OR (OLD.status='failed' AND NEW.status='archived' AND NEW.object_key=OLD.object_key)
  OR (OLD.status='ready' AND NEW.status='archived' AND NEW.object_key=OLD.object_key)
)
BEGIN SELECT RAISE(ABORT, 'Invalid File storage transition'); END;
