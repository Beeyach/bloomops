CREATE TABLE `service_type_blueprint_bindings` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`service_type_id` text NOT NULL,
	`template_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by_membership_id` text,
	`updated_by_membership_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`service_type_id`) REFERENCES `service_types`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`template_id`) REFERENCES `templates`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`created_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`updated_by_membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "service_type_blueprint_bindings_id_chk" CHECK(typeof(id) = 'text' AND length(id) > 0 AND instr(id, char(0)) = 0),
	CONSTRAINT "service_type_blueprint_bindings_workspace_id_chk" CHECK(typeof(workspace_id) = 'text' AND length(workspace_id) > 0 AND instr(workspace_id, char(0)) = 0),
	CONSTRAINT "service_type_blueprint_bindings_service_type_id_chk" CHECK(typeof(service_type_id) = 'text' AND length(service_type_id) > 0 AND instr(service_type_id, char(0)) = 0),
	CONSTRAINT "service_type_blueprint_bindings_template_id_chk" CHECK(typeof(template_id) = 'text' AND length(template_id) > 0 AND instr(template_id, char(0)) = 0),
	CONSTRAINT "service_type_blueprint_bindings_enabled_chk" CHECK(typeof(enabled) = 'integer' AND enabled IN (0, 1)),
	CONSTRAINT "service_type_blueprint_bindings_revision_chk" CHECK(typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_type_blueprint_bindings_ws_service_uq` ON `service_type_blueprint_bindings` (`workspace_id`,`service_type_id`);--> statement-breakpoint
CREATE INDEX `service_type_blueprint_bindings_ws_template_idx` ON `service_type_blueprint_bindings` (`workspace_id`,`template_id`);--> statement-breakpoint
CREATE INDEX `service_type_blueprint_bindings_ws_creator_idx` ON `service_type_blueprint_bindings` (`workspace_id`,`created_by_membership_id`);--> statement-breakpoint
CREATE INDEX `service_type_blueprint_bindings_ws_updater_idx` ON `service_type_blueprint_bindings` (`workspace_id`,`updated_by_membership_id`);
--> statement-breakpoint
-- Incoming guards run before REPLACE can delete a conflicting row. No DELETE
-- trigger or recursive_triggers setting is relied upon. Explicit NULL must
-- fail before REPLACE can substitute a column default.
CREATE TRIGGER service_type_blueprint_bindings_insert_guard
BEFORE INSERT ON service_type_blueprint_bindings
BEGIN
  SELECT RAISE(ABORT, 'blueprint binding required value')
  WHERE NEW.id IS NULL OR NEW.workspace_id IS NULL OR NEW.service_type_id IS NULL
     OR NEW.template_id IS NULL OR NEW.enabled IS NULL OR NEW.revision IS NULL
     OR NEW.created_at IS NULL OR NEW.updated_at IS NULL;
  SELECT RAISE(ABORT, 'blueprint binding initial revision must be 1')
  WHERE typeof(NEW.revision) <> 'integer' OR NEW.revision <> 1;
  SELECT RAISE(ABORT, 'blueprint binding requires same-workspace Systems Template')
  WHERE NOT EXISTS (SELECT 1 FROM templates WHERE workspace_id = NEW.workspace_id
    AND id = NEW.template_id AND kind = 'systems');
  SELECT RAISE(ABORT, 'blueprint binding actor must be active in workspace')
  WHERE (NEW.created_by_membership_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM workspace_memberships WHERE workspace_id = NEW.workspace_id
      AND id = NEW.created_by_membership_id AND status = 'active'))
    OR (NEW.updated_by_membership_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM workspace_memberships WHERE workspace_id = NEW.workspace_id
      AND id = NEW.updated_by_membership_id AND status = 'active'));
  -- NEW.rowid is defined for explicit integer rowids. An unspecified rowid
  -- is not an identity source; conservative collision refusal is intentional.
  SELECT RAISE(ABORT, 'blueprint binding replacement collision')
  WHERE EXISTS (SELECT 1 FROM service_type_blueprint_bindings
    WHERE id = NEW.id OR (workspace_id = NEW.workspace_id AND service_type_id = NEW.service_type_id)
      OR rowid = NEW.rowid);
END;
--> statement-breakpoint
CREATE TRIGGER service_type_blueprint_bindings_update_guard
BEFORE UPDATE ON service_type_blueprint_bindings
BEGIN
  SELECT RAISE(ABORT, 'blueprint binding identity is immutable')
  WHERE NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id
     OR NEW.service_type_id IS NOT OLD.service_type_id
     OR NEW.created_by_membership_id IS NOT OLD.created_by_membership_id
     OR NEW.created_at IS NOT OLD.created_at;
  SELECT RAISE(ABORT, 'blueprint binding required value')
  WHERE NEW.template_id IS NULL OR NEW.enabled IS NULL OR NEW.revision IS NULL OR NEW.updated_at IS NULL;
  SELECT RAISE(ABORT, 'blueprint binding revision must increment by 1 without overflow')
  WHERE typeof(NEW.revision) <> 'integer' OR OLD.revision >= 9007199254740991
     OR NEW.revision <> OLD.revision + 1;
  SELECT RAISE(ABORT, 'blueprint binding requires same-workspace Systems Template')
  WHERE NOT EXISTS (SELECT 1 FROM templates WHERE workspace_id = NEW.workspace_id
    AND id = NEW.template_id AND kind = 'systems');
  -- Creator is historical and immutable. Only the updater is attributable to
  -- this operation; revoking the historical creator must not freeze config.
  SELECT RAISE(ABORT, 'blueprint binding actor must be active in workspace')
  WHERE NEW.updated_by_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM workspace_memberships WHERE workspace_id = NEW.workspace_id
    AND id = NEW.updated_by_membership_id AND status = 'active');
  SELECT RAISE(ABORT, 'blueprint binding replacement collision')
  WHERE EXISTS (SELECT 1 FROM service_type_blueprint_bindings WHERE rowid <> OLD.rowid
    AND (id = NEW.id OR (workspace_id = NEW.workspace_id AND service_type_id = NEW.service_type_id)
      OR rowid = NEW.rowid));
END;
--> statement-breakpoint
-- Only bound parents are protected, including disabled bindings. Other kinds
-- and unbound Templates retain their existing behavior. Version rules are 2C.
CREATE TRIGGER templates_bound_blueprint_insert_guard
BEFORE INSERT ON templates
BEGIN
  SELECT RAISE(ABORT, 'bound blueprint Template replacement collision')
  WHERE EXISTS (SELECT 1 FROM templates t
    JOIN service_type_blueprint_bindings b ON b.workspace_id = t.workspace_id AND b.template_id = t.id
    WHERE t.id = NEW.id OR (t.workspace_id = NEW.workspace_id AND t.id = NEW.id)
      OR (t.workspace_id = NEW.workspace_id AND t.kind = NEW.kind AND t.slug = NEW.slug)
      OR t.rowid = NEW.rowid);
END;
--> statement-breakpoint
CREATE TRIGGER templates_bound_blueprint_update_guard
BEFORE UPDATE ON templates
BEGIN
  SELECT RAISE(ABORT, 'bound blueprint Template identity is immutable')
  WHERE EXISTS (SELECT 1 FROM service_type_blueprint_bindings
      WHERE workspace_id = OLD.workspace_id AND template_id = OLD.id)
    AND (NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id
      OR NEW.kind IS NOT OLD.kind OR NEW.slug IS NOT OLD.slug);
  SELECT RAISE(ABORT, 'bound blueprint Template replacement collision')
  WHERE EXISTS (SELECT 1 FROM templates t
    JOIN service_type_blueprint_bindings b ON b.workspace_id = t.workspace_id AND b.template_id = t.id
    WHERE t.rowid <> OLD.rowid AND (t.id = NEW.id
      OR (t.workspace_id = NEW.workspace_id AND t.id = NEW.id)
      OR (t.workspace_id = NEW.workspace_id AND t.kind = NEW.kind AND t.slug = NEW.slug)
      OR t.rowid = NEW.rowid));
END;
