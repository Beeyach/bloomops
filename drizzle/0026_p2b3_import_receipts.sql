CREATE TABLE `prospect_import_receipts` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`source_workspace_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`created_by_membership_id` text NOT NULL,
	`selected_count` integer NOT NULL,
	`imported_count` integer NOT NULL,
	`duplicate_count` integer NOT NULL,
	`rejected_count` integer NOT NULL,
	`sealed` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`created_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_import_receipts_counts_chk" CHECK(selected_count BETWEEN 1 AND 50 AND imported_count BETWEEN 1 AND selected_count AND duplicate_count>=0 AND rejected_count>=0 AND selected_count=imported_count+duplicate_count+rejected_count),
	CONSTRAINT "prospect_import_receipts_hash_chk" CHECK(length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "prospect_import_receipts_sealed_chk" CHECK(sealed IN (0,1)),
	CONSTRAINT "prospect_import_receipts_distinct_chk" CHECK(workspace_id<>source_workspace_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_import_receipts_request_uq` ON `prospect_import_receipts` (`workspace_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_import_receipts_source_uq` ON `prospect_import_receipts` (`workspace_id`,`id`,`source_workspace_id`);--> statement-breakpoint
CREATE INDEX `prospect_import_receipts_list_idx` ON `prospect_import_receipts` (`workspace_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `prospect_import_rows` (
	`workspace_id` text NOT NULL,
	`receipt_id` text NOT NULL,
	`source_workspace_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`status` text NOT NULL,
	`prospect_id` text,
	`source_record_id` integer,
	`business_name` text,
	`source_label` text,
	`fields_json` text,
	`reasons_json` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `receipt_id`, `ordinal`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`receipt_id`,`source_workspace_id`) REFERENCES `prospect_import_receipts`(`workspace_id`,`id`,`source_workspace_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`) REFERENCES `bloomops_prospects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_import_rows_ordinal_chk" CHECK(typeof(ordinal)='integer' AND ordinal BETWEEN 1 AND 50),
	CONSTRAINT "prospect_import_rows_outcome_chk" CHECK((status='imported' AND prospect_id IS NOT NULL AND typeof(source_record_id)='integer' AND source_record_id>0 AND fields_json IS NOT NULL AND json_valid(fields_json)) OR (status IN ('duplicate','rejected') AND prospect_id IS NULL AND fields_json IS NULL)),
	CONSTRAINT "prospect_import_rows_reasons_chk" CHECK(json_valid(reasons_json) AND json_type(reasons_json)='array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_import_rows_identity_uq` ON `prospect_import_rows` (`workspace_id`,`source_workspace_id`,`source_record_id`) WHERE status='imported';--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_import_rows_profile_uq` ON `prospect_import_rows` (`workspace_id`,`prospect_id`) WHERE prospect_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER prospect_import_receipts_insert_guard BEFORE INSERT ON prospect_import_receipts
WHEN NEW.sealed<>0 OR NOT EXISTS (
 SELECT 1 FROM workspaces d JOIN workspace_memberships dm ON dm.workspace_id=d.id
 JOIN workspaces s ON s.id=NEW.source_workspace_id JOIN workspace_memberships sm ON sm.workspace_id=s.id AND sm.user_id=dm.user_id
 WHERE d.id=NEW.workspace_id AND d.purpose='prospecting' AND d.status='active' AND dm.id=NEW.created_by_membership_id AND dm.status='active' AND dm.role IN ('owner','admin')
 AND s.purpose='operations' AND s.status='active' AND sm.status='active' AND sm.role IN ('owner','admin'))
BEGIN SELECT RAISE(ABORT,'Import requires current source and destination authority'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_import_receipts_seal_guard BEFORE UPDATE ON prospect_import_receipts
WHEN OLD.sealed<>0 OR NEW.sealed<>1 OR NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.source_workspace_id IS NOT OLD.source_workspace_id
 OR NEW.request_id IS NOT OLD.request_id OR NEW.request_hash IS NOT OLD.request_hash OR NEW.created_by_membership_id IS NOT OLD.created_by_membership_id OR NEW.created_at IS NOT OLD.created_at
 OR NEW.selected_count IS NOT OLD.selected_count OR NEW.imported_count IS NOT OLD.imported_count OR NEW.duplicate_count IS NOT OLD.duplicate_count OR NEW.rejected_count IS NOT OLD.rejected_count
 OR (SELECT count(*) FROM prospect_import_rows r WHERE r.workspace_id=NEW.workspace_id AND r.receipt_id=NEW.id)<>NEW.selected_count
 OR (SELECT count(*) FROM prospect_import_rows r WHERE r.workspace_id=NEW.workspace_id AND r.receipt_id=NEW.id AND r.status='imported')<>NEW.imported_count
 OR (SELECT count(*) FROM prospect_import_rows r WHERE r.workspace_id=NEW.workspace_id AND r.receipt_id=NEW.id AND r.status='duplicate')<>NEW.duplicate_count
 OR (SELECT count(*) FROM prospect_import_rows r WHERE r.workspace_id=NEW.workspace_id AND r.receipt_id=NEW.id AND r.status='rejected')<>NEW.rejected_count
 OR EXISTS (SELECT 1 FROM prospect_import_rows r WHERE r.workspace_id=NEW.workspace_id AND r.receipt_id=NEW.id AND r.status='imported'
  AND (SELECT count(*) FROM activity_events a WHERE a.workspace_id=r.workspace_id AND a.subject_type='prospect' AND a.subject_id=r.prospect_id AND a.event_type='PROSPECT_CREATED' AND a.actor_membership_id=NEW.created_by_membership_id)<>1)
BEGIN SELECT RAISE(ABORT,'Import must complete every selected record atomically'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_import_receipts_no_delete BEFORE DELETE ON prospect_import_receipts BEGIN SELECT RAISE(ABORT,'Import receipts are retained'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_import_rows_insert_guard BEFORE INSERT ON prospect_import_rows
WHEN NOT EXISTS (SELECT 1 FROM prospect_import_receipts r WHERE r.id=NEW.receipt_id AND r.workspace_id=NEW.workspace_id AND r.source_workspace_id=NEW.source_workspace_id AND r.sealed=0 AND NEW.ordinal<=r.selected_count)
 OR (NEW.status='imported' AND NOT EXISTS (SELECT 1 FROM bloomops_prospects p JOIN prospect_import_receipts r ON r.id=NEW.receipt_id AND r.workspace_id=p.workspace_id
 WHERE p.workspace_id=NEW.workspace_id AND p.id=NEW.prospect_id AND p.created_by_membership_id=r.created_by_membership_id AND p.revision=1
 AND p.business_name IS json_extract(NEW.fields_json,'$.businessName') AND p.person_name IS json_extract(NEW.fields_json,'$.personName')
 AND p.website IS json_extract(NEW.fields_json,'$.website') AND p.public_email IS json_extract(NEW.fields_json,'$.publicEmail')
 AND p.niche IS json_extract(NEW.fields_json,'$.niche') AND p.location IS json_extract(NEW.fields_json,'$.location')))
BEGIN SELECT RAISE(ABORT,'Import row must match its unsealed receipt and new profile'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_import_rows_no_update BEFORE UPDATE ON prospect_import_rows BEGIN SELECT RAISE(ABORT,'Import provenance is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_import_rows_no_delete BEFORE DELETE ON prospect_import_rows BEGIN SELECT RAISE(ABORT,'Import provenance is retained'); END;
