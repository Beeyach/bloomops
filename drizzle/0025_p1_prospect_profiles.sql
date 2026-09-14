CREATE TABLE `prospect_field_sources` (
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`field_key` text NOT NULL,
	`source_kind` text DEFAULT 'manual' NOT NULL,
	`source_url` text,
	`verification` text DEFAULT 'unverified' NOT NULL,
	`checked_at` text,
	`updated_by_membership_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`workspace_id`, `prospect_id`, `field_key`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`) REFERENCES `bloomops_prospects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`updated_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_field_sources_key_chk" CHECK(field_key IN ('businessName', 'personName', 'website', 'platform', 'niche', 'services', 'publicEmail', 'location', 'timeZone', 'fit', 'fitReason', 'observedFacts', 'unknowns', 'proposedWork', 'evidenceDate', 'evidenceTarget', 'evidenceReport', 'evidenceInteraction', 'evidenceLimitations', 'draftSubject', 'draftBody')),
	CONSTRAINT "prospect_field_sources_kind_chk" CHECK(source_kind='manual'),
	CONSTRAINT "prospect_field_sources_verification_chk" CHECK((verification='unverified' AND checked_at IS NULL) OR (verification='checked' AND checked_at IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `bloomops_prospects` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`creation_request_id` text NOT NULL,
	`creation_hash` text NOT NULL,
	`created_by_membership_id` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`business_name` text NOT NULL,
	`person_name` text,
	`website` text,
	`platform` text,
	`niche` text,
	`services` text,
	`public_email` text,
	`location` text,
	`time_zone` text,
	`fit` text DEFAULT 'unknown' NOT NULL,
	`fit_reason` text,
	`observed_facts` text,
	`unknowns` text,
	`proposed_work` text,
	`evidence_date` text,
	`evidence_target` text,
	`evidence_report` text,
	`evidence_interaction` text,
	`evidence_limitations` text,
	`draft_subject` text,
	`draft_body` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`created_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bloomops_prospects_revision_chk" CHECK(typeof(revision)='integer' AND revision>=1),
	CONSTRAINT "bloomops_prospects_fit_chk" CHECK(fit IN ('unknown', 'strong', 'hold', 'skip')),
	CONSTRAINT "bloomops_prospects_name_chk" CHECK(length(trim(business_name)) BETWEEN 1 AND 180),
	CONSTRAINT "bloomops_prospects_hash_chk" CHECK(length(creation_hash)=64 AND creation_hash NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bloomops_prospects_ws_id_uq` ON `bloomops_prospects` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bloomops_prospects_request_uq` ON `bloomops_prospects` (`workspace_id`,`creation_request_id`);--> statement-breakpoint
CREATE INDEX `bloomops_prospects_list_idx` ON `bloomops_prospects` (`workspace_id`,`business_name`,`id`);--> statement-breakpoint
CREATE INDEX `bloomops_prospects_fit_idx` ON `bloomops_prospects` (`workspace_id`,`fit`,`business_name`,`id`);
--> statement-breakpoint
CREATE TRIGGER bloomops_prospects_insert_guard BEFORE INSERT ON bloomops_prospects
WHEN EXISTS (SELECT 1 FROM bloomops_prospects p WHERE p.id=NEW.id OR p.rowid=NEW.rowid OR (p.workspace_id=NEW.workspace_id AND p.creation_request_id=NEW.creation_request_id))
 OR NOT EXISTS (SELECT 1 FROM workspaces w JOIN workspace_memberships m ON m.workspace_id=w.id
 WHERE w.id=NEW.workspace_id AND w.purpose='prospecting' AND w.status='active' AND m.id=NEW.created_by_membership_id AND m.status='active' AND m.role IN ('owner','admin'))
BEGIN SELECT RAISE(ABORT,'Prospect creation requires its current workspace administrator'); END;
--> statement-breakpoint
CREATE TRIGGER bloomops_prospects_identity_guard BEFORE UPDATE ON bloomops_prospects
WHEN NEW.id IS NOT OLD.id OR NEW.rowid IS NOT OLD.rowid OR NEW.workspace_id IS NOT OLD.workspace_id
 OR NEW.creation_request_id IS NOT OLD.creation_request_id OR NEW.creation_hash IS NOT OLD.creation_hash
 OR NEW.created_by_membership_id IS NOT OLD.created_by_membership_id OR NEW.created_at IS NOT OLD.created_at
 OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'Preserve prospect identity and advance its revision'); END;
--> statement-breakpoint
CREATE TRIGGER bloomops_prospects_no_delete BEFORE DELETE ON bloomops_prospects BEGIN SELECT RAISE(ABORT,'Prospect creation records are retained'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_field_sources_identity_guard BEFORE UPDATE ON prospect_field_sources
WHEN NEW.workspace_id IS NOT OLD.workspace_id OR NEW.prospect_id IS NOT OLD.prospect_id OR NEW.field_key IS NOT OLD.field_key
BEGIN SELECT RAISE(ABORT,'Field sources belong to their exact prospect field'); END;
