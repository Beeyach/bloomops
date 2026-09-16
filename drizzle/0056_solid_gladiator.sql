CREATE TABLE `prospect_conversion_services` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`conversion_id` text NOT NULL,
	`client_id` text NOT NULL,
	`service_engagement_id` text NOT NULL,
	`service_type_id` text NOT NULL,
	`service_name` text NOT NULL,
	`service_created` integer DEFAULT false NOT NULL,
	`package_name` text,
	`scope_notes` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`conversion_id`) REFERENCES `prospect_conversions`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`,`service_engagement_id`) REFERENCES `service_engagements`(`workspace_id`,`client_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`service_type_id`) REFERENCES `service_types`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prospect_conversion_services_scope_ck" CHECK(length(trim(scope_notes)) BETWEEN 1 AND 2000 AND (package_name IS NULL OR length(package_name)<=120))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_conversion_services_type_uq` ON `prospect_conversion_services` (`workspace_id`,`conversion_id`,`service_type_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_conversion_services_engagement_uq` ON `prospect_conversion_services` (`workspace_id`,`conversion_id`,`service_engagement_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_conversions_ws_client_id_uq` ON `prospect_conversions` (`workspace_id`,`client_id`,`id`);--> statement-breakpoint
CREATE TRIGGER prospect_conversion_services_validate BEFORE INSERT ON prospect_conversion_services
WHEN NOT EXISTS(SELECT 1 FROM service_engagements WHERE workspace_id=NEW.workspace_id AND client_id=NEW.client_id AND id=NEW.service_engagement_id AND service_type_id=NEW.service_type_id)
BEGIN SELECT RAISE(ABORT,'Conversion item requires its canonical engagement'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_conversion_services_no_update BEFORE UPDATE ON prospect_conversion_services
BEGIN SELECT RAISE(ABORT,'Conversion items are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prospect_conversion_services_no_delete BEFORE DELETE ON prospect_conversion_services
BEGIN SELECT RAISE(ABORT,'Conversion items are permanent'); END;
