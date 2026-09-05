-- Immutability guards the Drizzle schema cannot express.
--
-- template_versions are snapshots: the definition, its hash, and its place in
-- the template's history never change after insert. Status may still move
-- draft -> published -> retired, which is why only these columns are guarded.
CREATE TRIGGER template_versions_immutable_update
BEFORE UPDATE OF definition_json, definition_hash, template_id, version_number, workspace_id ON template_versions
BEGIN
  SELECT RAISE(ABORT, 'template_versions snapshots are immutable');
END;
--> statement-breakpoint
-- activity_events is an append-only history. Nothing updates or deletes a row.
CREATE TRIGGER activity_events_immutable_update
BEFORE UPDATE ON activity_events
BEGIN
  SELECT RAISE(ABORT, 'activity_events are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER activity_events_immutable_delete
BEFORE DELETE ON activity_events
BEGIN
  SELECT RAISE(ABORT, 'activity_events are immutable');
END;
