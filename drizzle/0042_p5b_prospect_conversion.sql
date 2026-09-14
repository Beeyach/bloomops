CREATE TABLE `prospect_conversions` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`prospect_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`profile_revision` integer NOT NULL,
	`review_hash` text NOT NULL,
	`client_id` text NOT NULL,
	`client_created` integer DEFAULT false NOT NULL,
	`client_name` text NOT NULL,
	`service_engagement_id` text NOT NULL,
	`service_type_id` text NOT NULL,
	`service_created` integer DEFAULT false NOT NULL,
	`service_name` text NOT NULL,
	`package_name` text,
	`scope_notes` text NOT NULL,
	`recipient_emails_json` text NOT NULL,
	`converted_by_membership_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`prospect_id`) REFERENCES `bloomops_prospects`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `bloomops_clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`service_type_id`) REFERENCES `service_types`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`converted_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`service_engagement_id`) REFERENCES `service_engagements`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_conversions_revision_ck" CHECK(typeof(profile_revision)='integer' AND profile_revision>=1),
	CONSTRAINT "prospect_conversions_hash_ck" CHECK(length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*' AND length(review_hash)=64 AND review_hash NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "prospect_conversions_scope_ck" CHECK(length(trim(scope_notes)) BETWEEN 1 AND 2000 AND (package_name IS NULL OR length(package_name)<=120)),
	CONSTRAINT "prospect_conversions_recipients_ck" CHECK(json_valid(recipient_emails_json) AND json_type(recipient_emails_json)='array' AND json_array_length(recipient_emails_json)<=3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_conversions_ws_id_uq` ON `prospect_conversions` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_conversions_prospect_uq` ON `prospect_conversions` (`workspace_id`,`prospect_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_conversions_request_uq` ON `prospect_conversions` (`workspace_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `prospect_conversions_client_idx` ON `prospect_conversions` (`workspace_id`,`client_id`);
--> statement-breakpoint
CREATE TRIGGER prospect_conversions_validate BEFORE INSERT ON prospect_conversions
WHEN NOT EXISTS(SELECT 1 FROM service_engagements WHERE workspace_id=NEW.workspace_id AND client_id=NEW.client_id AND id=NEW.service_engagement_id AND service_type_id=NEW.service_type_id)
 OR EXISTS(SELECT 1 FROM json_each(NEW.recipient_emails_json) WHERE type!='text' OR value!=lower(trim(value)) OR length(value) NOT BETWEEN 3 AND 254 OR instr(value,'@')<2)
 OR EXISTS(SELECT 1 FROM prospect_deliveries d JOIN prospect_outreach_approvals a ON a.workspace_id=d.workspace_id AND a.id=d.approval_id WHERE d.workspace_id=NEW.workspace_id AND d.state IN ('submitting','uncertain') AND (d.prospect_id=NEW.prospect_id OR lower(trim(json_extract(a.snapshot_json,'$.draft.recipient'))) IN (SELECT value FROM json_each(NEW.recipient_emails_json))))
BEGIN SELECT RAISE(ABORT,'Conversion requires canonical service and resolved delivery'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_conversions_no_update BEFORE UPDATE ON prospect_conversions
BEGIN SELECT RAISE(ABORT,'Conversion receipts and outreach stops are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_conversions_no_delete BEFORE DELETE ON prospect_conversions
BEGIN SELECT RAISE(ABORT,'Conversion receipts and outreach stops are permanent'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_deliveries_conversion_insert BEFORE INSERT ON prospect_deliveries
WHEN NEW.state IN ('prepared','submitting') AND EXISTS(
 SELECT 1 FROM prospect_conversions pc WHERE pc.workspace_id=NEW.workspace_id AND (pc.prospect_id=NEW.prospect_id OR EXISTS(
 SELECT 1 FROM json_each(pc.recipient_emails_json) ce JOIN prospect_outreach_approvals a ON a.workspace_id=NEW.workspace_id AND a.id=NEW.approval_id WHERE ce.value=lower(trim(json_extract(a.snapshot_json,'$.draft.recipient'))))))
BEGIN SELECT RAISE(ABORT,'Converted prospects and recipients are permanently stopped'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_deliveries_conversion_submit BEFORE UPDATE OF state ON prospect_deliveries
WHEN NEW.state='submitting' AND EXISTS(
 SELECT 1 FROM prospect_conversions pc WHERE pc.workspace_id=NEW.workspace_id AND (pc.prospect_id=NEW.prospect_id OR EXISTS(
 SELECT 1 FROM json_each(pc.recipient_emails_json) ce JOIN prospect_outreach_approvals a ON a.workspace_id=NEW.workspace_id AND a.id=NEW.approval_id WHERE ce.value=lower(trim(json_extract(a.snapshot_json,'$.draft.recipient'))))))
BEGIN SELECT RAISE(ABORT,'Converted prospects and recipients are permanently stopped'); END;
