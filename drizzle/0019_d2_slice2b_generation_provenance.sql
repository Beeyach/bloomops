CREATE TABLE `systems_blueprint_generation_items` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`generation_id` text NOT NULL,
	`kind` text NOT NULL,
	`logical_key` text NOT NULL,
	`record_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`generation_id`) REFERENCES `systems_blueprint_generations`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "systems_blueprint_generation_items_kind_chk" CHECK(kind IN ('milestone', 'action', 'deliverable')),
	CONSTRAINT "systems_blueprint_generation_items_key_chk" CHECK(typeof(logical_key) = 'text' AND length(logical_key) BETWEEN 1 AND 64 AND logical_key NOT GLOB '*[^a-z0-9_]*' AND instr(logical_key, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generation_items_id_chk" CHECK(typeof(id) = 'text' AND length(id) > 0 AND instr(id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generation_items_workspace_id_chk" CHECK(typeof(workspace_id) = 'text' AND length(workspace_id) > 0 AND instr(workspace_id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generation_items_generation_id_chk" CHECK(typeof(generation_id) = 'text' AND length(generation_id) > 0 AND instr(generation_id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generation_items_record_id_chk" CHECK(typeof(record_id) = 'text' AND length(record_id) > 0 AND instr(record_id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generation_items_created_at_chk" CHECK(typeof(created_at) = 'text' AND length(created_at) > 0 AND instr(created_at, char(0)) = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `systems_blueprint_generation_items_key_uq` ON `systems_blueprint_generation_items` (`generation_id`,`kind`,`logical_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `systems_blueprint_generation_items_record_uq` ON `systems_blueprint_generation_items` (`kind`,`record_id`);--> statement-breakpoint
CREATE TABLE `systems_blueprint_generations` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`client_id` text NOT NULL,
	`service_engagement_id` text NOT NULL,
	`service_type_id` text NOT NULL,
	`binding_id` text NOT NULL,
	`binding_revision` integer NOT NULL,
	`template_id` text NOT NULL,
	`template_version_id` text NOT NULL,
	`template_version_number` integer NOT NULL,
	`request_id` text NOT NULL,
	`blueprint_key` text NOT NULL,
	`definition_schema_version` integer NOT NULL,
	`compiler_version` integer NOT NULL,
	`definition_json` text NOT NULL,
	`definition_hash` text NOT NULL,
	`plan_json` text NOT NULL,
	`plan_hash` text NOT NULL,
	`created_by_membership_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "systems_blueprint_generations_id_chk" CHECK(typeof(id) = 'text' AND length(id) > 0 AND instr(id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_workspace_id_chk" CHECK(typeof(workspace_id) = 'text' AND length(workspace_id) > 0 AND instr(workspace_id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_project_id_chk" CHECK(typeof(project_id) = 'text' AND length(project_id) > 0 AND instr(project_id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_client_id_chk" CHECK(typeof(client_id) = 'text' AND length(client_id) > 0 AND instr(client_id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_service_engagement_id_chk" CHECK(typeof(service_engagement_id) = 'text' AND length(service_engagement_id) > 0 AND instr(service_engagement_id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_service_type_id_chk" CHECK(typeof(service_type_id) = 'text' AND length(service_type_id) > 0 AND instr(service_type_id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_binding_id_chk" CHECK(typeof(binding_id) = 'text' AND length(binding_id) > 0 AND instr(binding_id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_template_id_chk" CHECK(typeof(template_id) = 'text' AND length(template_id) > 0 AND instr(template_id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_template_version_id_chk" CHECK(typeof(template_version_id) = 'text' AND length(template_version_id) > 0 AND instr(template_version_id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_created_by_membership_id_chk" CHECK(typeof(created_by_membership_id) = 'text' AND length(created_by_membership_id) > 0 AND instr(created_by_membership_id, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_created_at_chk" CHECK(typeof(created_at) = 'text' AND length(created_at) > 0 AND instr(created_at, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_binding_revision_chk" CHECK(typeof(binding_revision) = 'integer' AND binding_revision BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "systems_blueprint_generations_template_version_number_chk" CHECK(typeof(template_version_number) = 'integer' AND template_version_number BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "systems_blueprint_generations_versions_chk" CHECK(definition_schema_version = 1 AND compiler_version = 1),
	CONSTRAINT "systems_blueprint_generations_blueprint_key_chk" CHECK(typeof(blueprint_key) = 'text' AND length(blueprint_key) BETWEEN 1 AND 64 AND blueprint_key NOT GLOB '*[^a-z0-9_]*' AND instr(blueprint_key, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_request_chk" CHECK(typeof(request_id) = 'text' AND length(request_id) = 36 AND instr(request_id, char(0)) = 0
    AND substr(request_id,9,1) = '-' AND substr(request_id,14,1) = '-' AND substr(request_id,19,1) = '-' AND substr(request_id,24,1) = '-'
    AND substr(request_id,15,1) = '4' AND substr(request_id,20,1) IN ('8','9','a','b')
    AND length(replace(request_id,'-','')) = 32 AND replace(request_id,'-','') NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "systems_blueprint_generations_definition_hash_chk" CHECK(typeof(definition_hash) = 'text' AND length(definition_hash) = 64 AND definition_hash NOT GLOB '*[^0-9a-f]*' AND instr(definition_hash, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_plan_hash_chk" CHECK(typeof(plan_hash) = 'text' AND length(plan_hash) = 64 AND plan_hash NOT GLOB '*[^0-9a-f]*' AND instr(plan_hash, char(0)) = 0),
	CONSTRAINT "systems_blueprint_generations_definition_json_chk" CHECK(CASE WHEN typeof(definition_json) = 'text' AND length(CAST(definition_json AS BLOB)) BETWEEN 2 AND 32768 AND json_valid(definition_json) THEN json_type(definition_json) = 'object' ELSE 0 END),
	CONSTRAINT "systems_blueprint_generations_plan_json_chk" CHECK(CASE WHEN typeof(plan_json) = 'text' AND length(CAST(plan_json AS BLOB)) BETWEEN 2 AND 32768 AND json_valid(plan_json) THEN json_type(plan_json) = 'object' ELSE 0 END)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `systems_blueprint_generations_ws_id_uq` ON `systems_blueprint_generations` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `systems_blueprint_generations_project_uq` ON `systems_blueprint_generations` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `systems_blueprint_generations_ws_request_uq` ON `systems_blueprint_generations` (`workspace_id`,`request_id`);
--> statement-breakpoint
-- Historical rows are append-only; live deletion is intentionally not blocked.
-- As in 2A, unspecified NEW.rowid is not an identity source. Matching a
-- protected atypical rowid is conservatively refused, never exempted.
CREATE TRIGGER systems_blueprint_generations_insert_guard
BEFORE INSERT ON systems_blueprint_generations
BEGIN
  SELECT RAISE(ABORT, 'blueprint provenance required value')
  WHERE NEW.id IS NULL OR NEW.workspace_id IS NULL OR NEW.project_id IS NULL OR NEW.client_id IS NULL OR NEW.service_engagement_id IS NULL OR NEW.service_type_id IS NULL OR NEW.binding_id IS NULL OR NEW.binding_revision IS NULL OR NEW.template_id IS NULL OR NEW.template_version_id IS NULL OR NEW.template_version_number IS NULL OR NEW.request_id IS NULL OR NEW.blueprint_key IS NULL OR NEW.definition_schema_version IS NULL OR NEW.compiler_version IS NULL OR NEW.definition_json IS NULL OR NEW.definition_hash IS NULL OR NEW.plan_json IS NULL OR NEW.plan_hash IS NULL OR NEW.created_by_membership_id IS NULL OR NEW.created_at IS NULL;
  SELECT RAISE(ABORT, 'blueprint provenance replacement collision')
  WHERE EXISTS (SELECT 1 FROM systems_blueprint_generations WHERE id = NEW.id OR project_id = NEW.project_id OR (workspace_id = NEW.workspace_id AND request_id = NEW.request_id) OR rowid = NEW.rowid);
  SELECT RAISE(ABORT, 'blueprint provenance requires exact live source context')
  WHERE NOT EXISTS (
    SELECT 1 FROM projects p
    JOIN service_engagements se ON se.workspace_id = p.workspace_id AND se.id = p.service_engagement_id AND se.client_id = p.client_id
    JOIN service_type_blueprint_bindings b ON b.workspace_id = se.workspace_id AND b.service_type_id = se.service_type_id
    JOIN templates t ON t.workspace_id = b.workspace_id AND t.id = b.template_id AND t.kind = 'systems'
    JOIN template_versions v ON v.workspace_id = t.workspace_id AND v.template_id = t.id
    WHERE p.workspace_id = NEW.workspace_id AND p.id = NEW.project_id AND p.client_id = NEW.client_id
      AND se.id = NEW.service_engagement_id AND se.service_type_id = NEW.service_type_id
      AND b.id = NEW.binding_id AND b.revision = NEW.binding_revision AND t.id = NEW.template_id
      AND v.id = NEW.template_version_id AND v.version_number = NEW.template_version_number
      AND v.definition_json = NEW.definition_json AND v.definition_hash = NEW.definition_hash);
  SELECT RAISE(ABORT, 'blueprint provenance actor must be active in workspace')
  WHERE NOT EXISTS (SELECT 1 FROM workspace_memberships WHERE workspace_id = NEW.workspace_id AND id = NEW.created_by_membership_id AND status = 'active');
  SELECT RAISE(ABORT, 'blueprint provenance requires bounded JSON objects')
  -- D1 remote /query parsing needs parentheses around top-level CASE expressions
  -- in trigger bodies; otherwise CASE END can be mistaken for the trigger END.
  WHERE (CASE WHEN typeof(NEW.definition_json) = 'text' AND length(CAST(NEW.definition_json AS BLOB)) BETWEEN 2 AND 32768 AND json_valid(NEW.definition_json) THEN json_type(NEW.definition_json) IS NOT 'object' ELSE 1 END) OR (CASE WHEN typeof(NEW.plan_json) = 'text' AND length(CAST(NEW.plan_json AS BLOB)) BETWEEN 2 AND 32768 AND json_valid(NEW.plan_json) THEN json_type(NEW.plan_json) IS NOT 'object' ELSE 1 END);
  SELECT RAISE(ABORT, 'blueprint provenance version envelope mismatch')
  WHERE json_extract(NEW.definition_json, '$.schemaVersion') IS NOT NEW.definition_schema_version OR json_extract(NEW.definition_json, '$.compilerVersion') IS NOT NEW.compiler_version OR json_extract(NEW.definition_json, '$.blueprintKey') IS NOT NEW.blueprint_key;
  SELECT RAISE(ABORT, 'blueprint provenance version envelope mismatch')
  WHERE json_extract(NEW.plan_json, '$.schemaVersion') IS NOT NEW.definition_schema_version OR json_extract(NEW.plan_json, '$.compilerVersion') IS NOT NEW.compiler_version OR json_extract(NEW.plan_json, '$.blueprintKey') IS NOT NEW.blueprint_key;
  SELECT RAISE(ABORT, 'blueprint provenance plan array bounds')
  WHERE json_type(NEW.plan_json, '$.selectedComponentKeys') IS NOT 'array' OR json_array_length(NEW.plan_json, '$.selectedComponentKeys') NOT BETWEEN 1 AND 14;
  SELECT RAISE(ABORT, 'blueprint provenance plan array bounds')
  WHERE json_type(NEW.plan_json, '$.milestones') IS NOT 'array' OR json_array_length(NEW.plan_json, '$.milestones') NOT BETWEEN 1 AND 13;
  SELECT RAISE(ABORT, 'blueprint provenance plan array bounds')
  WHERE json_type(NEW.plan_json, '$.actions') IS NOT 'array' OR json_array_length(NEW.plan_json, '$.actions') NOT BETWEEN 1 AND 14;
  SELECT RAISE(ABORT, 'blueprint provenance plan array bounds')
  WHERE json_type(NEW.plan_json, '$.deliverables') IS NOT 'array' OR json_array_length(NEW.plan_json, '$.deliverables') NOT BETWEEN 0 AND 8;
  SELECT RAISE(ABORT, 'blueprint provenance plan array bounds')
  WHERE json_type(NEW.plan_json, '$.dependencies') IS NOT 'array' OR json_array_length(NEW.plan_json, '$.dependencies') NOT BETWEEN 0 AND 49;
  SELECT RAISE(ABORT, 'blueprint provenance invalid selection')
  WHERE EXISTS (SELECT 1 FROM json_each(NEW.plan_json, '$.selectedComponentKeys') WHERE type <> 'text')
    OR (SELECT count(*) FROM json_each(NEW.plan_json, '$.selectedComponentKeys')) <>
       (SELECT count(DISTINCT value) FROM json_each(NEW.plan_json, '$.selectedComponentKeys'));
  SELECT RAISE(ABORT, 'blueprint provenance invalid plan logical keys')
  WHERE EXISTS (SELECT 1 FROM json_each(NEW.plan_json, '$.milestones')
      WHERE CASE WHEN type = 'object' THEN json_type(value, '$.logicalKey') IS NOT 'text'
        OR length(json_extract(value, '$.logicalKey')) NOT BETWEEN 1 AND 64
        OR json_extract(value, '$.logicalKey') GLOB '*[^a-z0-9_]*'
        OR instr(json_extract(value, '$.logicalKey'), char(0)) > 0 ELSE 1 END)
    OR (SELECT count(*) FROM json_each(NEW.plan_json, '$.milestones')) <>
       (SELECT count(DISTINCT json_extract(value, '$.logicalKey')) FROM json_each(NEW.plan_json, '$.milestones'));
  SELECT RAISE(ABORT, 'blueprint provenance invalid plan logical keys')
  WHERE EXISTS (SELECT 1 FROM json_each(NEW.plan_json, '$.actions')
      WHERE CASE WHEN type = 'object' THEN json_type(value, '$.logicalKey') IS NOT 'text'
        OR length(json_extract(value, '$.logicalKey')) NOT BETWEEN 1 AND 64
        OR json_extract(value, '$.logicalKey') GLOB '*[^a-z0-9_]*'
        OR instr(json_extract(value, '$.logicalKey'), char(0)) > 0 ELSE 1 END)
    OR (SELECT count(*) FROM json_each(NEW.plan_json, '$.actions')) <>
       (SELECT count(DISTINCT json_extract(value, '$.logicalKey')) FROM json_each(NEW.plan_json, '$.actions'));
  SELECT RAISE(ABORT, 'blueprint provenance invalid plan logical keys')
  WHERE EXISTS (SELECT 1 FROM json_each(NEW.plan_json, '$.deliverables')
      WHERE CASE WHEN type = 'object' THEN json_type(value, '$.logicalKey') IS NOT 'text'
        OR length(json_extract(value, '$.logicalKey')) NOT BETWEEN 1 AND 64
        OR json_extract(value, '$.logicalKey') GLOB '*[^a-z0-9_]*'
        OR instr(json_extract(value, '$.logicalKey'), char(0)) > 0 ELSE 1 END)
    OR (SELECT count(*) FROM json_each(NEW.plan_json, '$.deliverables')) <>
       (SELECT count(DISTINCT json_extract(value, '$.logicalKey')) FROM json_each(NEW.plan_json, '$.deliverables'));
END;
--> statement-breakpoint
CREATE TRIGGER systems_blueprint_generations_update_guard
BEFORE UPDATE ON systems_blueprint_generations
BEGIN
  SELECT RAISE(ABORT, 'blueprint provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER systems_blueprint_generations_delete_guard
BEFORE DELETE ON systems_blueprint_generations
BEGIN
  SELECT RAISE(ABORT, 'blueprint provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER systems_blueprint_generation_items_insert_guard
BEFORE INSERT ON systems_blueprint_generation_items
BEGIN
  SELECT RAISE(ABORT, 'blueprint provenance required value')
  WHERE NEW.id IS NULL OR NEW.workspace_id IS NULL OR NEW.generation_id IS NULL OR NEW.kind IS NULL OR NEW.logical_key IS NULL OR NEW.record_id IS NULL OR NEW.created_at IS NULL;
  SELECT RAISE(ABORT, 'blueprint provenance replacement collision')
  WHERE EXISTS (SELECT 1 FROM systems_blueprint_generation_items WHERE id = NEW.id OR (generation_id = NEW.generation_id AND kind = NEW.kind AND logical_key = NEW.logical_key) OR (kind = NEW.kind AND record_id = NEW.record_id) OR rowid = NEW.rowid);
  SELECT RAISE(ABORT, 'blueprint provenance item requires exact live Project and planned key')
  WHERE NOT EXISTS (
    SELECT 1 FROM systems_blueprint_generations g JOIN projects p ON p.workspace_id = g.workspace_id AND p.id = g.project_id
    WHERE g.workspace_id = NEW.workspace_id AND g.id = NEW.generation_id AND (
      (NEW.kind = 'milestone' AND EXISTS (SELECT 1 FROM milestones r
        WHERE r.workspace_id = g.workspace_id AND r.project_id = g.project_id AND r.id = NEW.record_id)
      AND EXISTS (SELECT 1 FROM json_each(g.plan_json, '$.milestones')
        WHERE json_extract(value, '$.logicalKey') = NEW.logical_key)) OR (NEW.kind = 'action' AND EXISTS (SELECT 1 FROM actions r
        WHERE r.workspace_id = g.workspace_id AND r.project_id = g.project_id AND r.id = NEW.record_id)
      AND EXISTS (SELECT 1 FROM json_each(g.plan_json, '$.actions')
        WHERE json_extract(value, '$.logicalKey') = NEW.logical_key)) OR (NEW.kind = 'deliverable' AND EXISTS (SELECT 1 FROM deliverables r
        WHERE r.workspace_id = g.workspace_id AND r.project_id = g.project_id AND r.id = NEW.record_id)
      AND EXISTS (SELECT 1 FROM json_each(g.plan_json, '$.deliverables')
        WHERE json_extract(value, '$.logicalKey') = NEW.logical_key))));
END;
--> statement-breakpoint
CREATE TRIGGER systems_blueprint_generation_items_update_guard
BEFORE UPDATE ON systems_blueprint_generation_items
BEGIN
  SELECT RAISE(ABORT, 'blueprint provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER systems_blueprint_generation_items_delete_guard
BEFORE DELETE ON systems_blueprint_generation_items
BEGIN
  SELECT RAISE(ABORT, 'blueprint provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER projects_blueprint_identity_insert_guard
BEFORE INSERT ON projects
BEGIN
  SELECT RAISE(ABORT, 'blueprint historical identity cannot be reused')
  WHERE EXISTS (SELECT 1 FROM systems_blueprint_generations WHERE project_id = NEW.id);
  SELECT RAISE(ABORT, 'blueprint live replacement collision')
  WHERE EXISTS (SELECT 1 FROM projects r JOIN systems_blueprint_generations h ON h.project_id = r.id WHERE r.id = NEW.id OR r.rowid = NEW.rowid);
END;
--> statement-breakpoint
CREATE TRIGGER projects_blueprint_identity_update_guard
BEFORE UPDATE ON projects
BEGIN
  SELECT RAISE(ABORT, 'blueprint live identity is immutable')
  WHERE EXISTS (SELECT 1 FROM systems_blueprint_generations WHERE project_id = OLD.id) AND (NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.client_id IS NOT OLD.client_id OR NEW.service_engagement_id IS NOT OLD.service_engagement_id);
  SELECT RAISE(ABORT, 'blueprint historical identity cannot be reused')
  WHERE NEW.id IS NOT OLD.id AND EXISTS (SELECT 1 FROM systems_blueprint_generations WHERE project_id = NEW.id);
  SELECT RAISE(ABORT, 'blueprint live replacement collision')
  WHERE EXISTS (SELECT 1 FROM projects r JOIN systems_blueprint_generations h ON h.project_id = r.id WHERE r.rowid <> OLD.rowid AND (r.id = NEW.id OR r.rowid = NEW.rowid));
END;
--> statement-breakpoint
CREATE TRIGGER milestones_blueprint_identity_insert_guard
BEFORE INSERT ON milestones
BEGIN
  SELECT RAISE(ABORT, 'blueprint historical identity cannot be reused')
  WHERE EXISTS (SELECT 1 FROM systems_blueprint_generation_items WHERE kind = 'milestone' AND record_id = NEW.id);
  SELECT RAISE(ABORT, 'blueprint live replacement collision')
  WHERE EXISTS (SELECT 1 FROM milestones r JOIN systems_blueprint_generation_items h ON h.kind = 'milestone' AND h.record_id = r.id WHERE r.id = NEW.id OR r.rowid = NEW.rowid OR (r.workspace_id = NEW.workspace_id AND r.project_id = NEW.project_id AND r.creation_request_id = NEW.creation_request_id) OR (r.project_id = NEW.project_id AND r.position = NEW.position));
END;
--> statement-breakpoint
CREATE TRIGGER milestones_blueprint_identity_update_guard
BEFORE UPDATE ON milestones
BEGIN
  SELECT RAISE(ABORT, 'blueprint live identity is immutable')
  WHERE EXISTS (SELECT 1 FROM systems_blueprint_generation_items WHERE kind = 'milestone' AND record_id = OLD.id) AND (NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.project_id IS NOT OLD.project_id);
  SELECT RAISE(ABORT, 'blueprint historical identity cannot be reused')
  WHERE NEW.id IS NOT OLD.id AND EXISTS (SELECT 1 FROM systems_blueprint_generation_items WHERE kind = 'milestone' AND record_id = NEW.id);
  SELECT RAISE(ABORT, 'blueprint live replacement collision')
  WHERE EXISTS (SELECT 1 FROM milestones r JOIN systems_blueprint_generation_items h ON h.kind = 'milestone' AND h.record_id = r.id WHERE r.rowid <> OLD.rowid AND (r.id = NEW.id OR r.rowid = NEW.rowid OR (r.workspace_id = NEW.workspace_id AND r.project_id = NEW.project_id AND r.creation_request_id = NEW.creation_request_id) OR (r.project_id = NEW.project_id AND r.position = NEW.position)));
END;
--> statement-breakpoint
CREATE TRIGGER actions_blueprint_identity_insert_guard
BEFORE INSERT ON actions
BEGIN
  SELECT RAISE(ABORT, 'blueprint historical identity cannot be reused')
  WHERE EXISTS (SELECT 1 FROM systems_blueprint_generation_items WHERE kind = 'action' AND record_id = NEW.id);
  SELECT RAISE(ABORT, 'blueprint live replacement collision')
  WHERE EXISTS (SELECT 1 FROM actions r JOIN systems_blueprint_generation_items h ON h.kind = 'action' AND h.record_id = r.id WHERE r.id = NEW.id OR r.rowid = NEW.rowid OR (r.workspace_id = NEW.workspace_id AND r.project_id = NEW.project_id AND r.creation_request_id = NEW.creation_request_id));
END;
--> statement-breakpoint
CREATE TRIGGER actions_blueprint_identity_update_guard
BEFORE UPDATE ON actions
BEGIN
  SELECT RAISE(ABORT, 'blueprint live identity is immutable')
  WHERE EXISTS (SELECT 1 FROM systems_blueprint_generation_items WHERE kind = 'action' AND record_id = OLD.id) AND (NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.project_id IS NOT OLD.project_id);
  SELECT RAISE(ABORT, 'blueprint historical identity cannot be reused')
  WHERE NEW.id IS NOT OLD.id AND EXISTS (SELECT 1 FROM systems_blueprint_generation_items WHERE kind = 'action' AND record_id = NEW.id);
  SELECT RAISE(ABORT, 'blueprint live replacement collision')
  WHERE EXISTS (SELECT 1 FROM actions r JOIN systems_blueprint_generation_items h ON h.kind = 'action' AND h.record_id = r.id WHERE r.rowid <> OLD.rowid AND (r.id = NEW.id OR r.rowid = NEW.rowid OR (r.workspace_id = NEW.workspace_id AND r.project_id = NEW.project_id AND r.creation_request_id = NEW.creation_request_id)));
END;
--> statement-breakpoint
CREATE TRIGGER deliverables_blueprint_identity_insert_guard
BEFORE INSERT ON deliverables
BEGIN
  SELECT RAISE(ABORT, 'blueprint historical identity cannot be reused')
  WHERE EXISTS (SELECT 1 FROM systems_blueprint_generation_items WHERE kind = 'deliverable' AND record_id = NEW.id);
  SELECT RAISE(ABORT, 'blueprint live replacement collision')
  WHERE EXISTS (SELECT 1 FROM deliverables r JOIN systems_blueprint_generation_items h ON h.kind = 'deliverable' AND h.record_id = r.id WHERE r.id = NEW.id OR r.rowid = NEW.rowid OR (r.workspace_id = NEW.workspace_id AND r.project_id = NEW.project_id AND r.creation_request_id = NEW.creation_request_id));
END;
--> statement-breakpoint
CREATE TRIGGER deliverables_blueprint_identity_update_guard
BEFORE UPDATE ON deliverables
BEGIN
  SELECT RAISE(ABORT, 'blueprint live identity is immutable')
  WHERE EXISTS (SELECT 1 FROM systems_blueprint_generation_items WHERE kind = 'deliverable' AND record_id = OLD.id) AND (NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.project_id IS NOT OLD.project_id);
  SELECT RAISE(ABORT, 'blueprint historical identity cannot be reused')
  WHERE NEW.id IS NOT OLD.id AND EXISTS (SELECT 1 FROM systems_blueprint_generation_items WHERE kind = 'deliverable' AND record_id = NEW.id);
  SELECT RAISE(ABORT, 'blueprint live replacement collision')
  WHERE EXISTS (SELECT 1 FROM deliverables r JOIN systems_blueprint_generation_items h ON h.kind = 'deliverable' AND h.record_id = r.id WHERE r.rowid <> OLD.rowid AND (r.id = NEW.id OR r.rowid = NEW.rowid OR (r.workspace_id = NEW.workspace_id AND r.project_id = NEW.project_id AND r.creation_request_id = NEW.creation_request_id)));
END;
