-- D2 2C: Systems-only snapshot/lifecycle guards. No data backfill or table changes.
-- Incoming guards run even with recursive_triggers=OFF; REPLACE is not publication.
CREATE TRIGGER systems_template_versions_insert_guard
BEFORE INSERT ON template_versions
BEGIN
  SELECT RAISE(ABORT, 'Systems version replacement collision')
  WHERE EXISTS (SELECT 1 FROM template_versions v
    JOIN templates t ON t.id = v.template_id AND t.workspace_id = v.workspace_id
    WHERE t.kind = 'systems' AND (v.id = NEW.id OR (v.template_id = NEW.template_id AND v.version_number = NEW.version_number)
      OR (NEW.status = 'published' AND v.status = 'published' AND v.template_id = NEW.template_id)
      OR v.rowid = NEW.rowid));
  SELECT RAISE(ABORT, 'Systems generation source version identity is reserved')
  WHERE EXISTS (SELECT 1 FROM systems_blueprint_generations g
    WHERE g.template_version_id = NEW.id
      OR (g.template_id = NEW.template_id AND g.template_version_number = NEW.version_number));
  SELECT RAISE(ABORT, 'Systems version must start as an identified draft')
  WHERE EXISTS (SELECT 1 FROM templates WHERE id = NEW.template_id AND workspace_id = NEW.workspace_id AND kind = 'systems')
    AND (NEW.id IS NULL OR typeof(NEW.id) <> 'text' OR length(NEW.id) = 0 OR instr(NEW.id, char(0)) > 0 OR NEW.workspace_id IS NULL OR typeof(NEW.workspace_id) <> 'text' OR length(NEW.workspace_id) = 0 OR instr(NEW.workspace_id, char(0)) > 0 OR NEW.template_id IS NULL OR typeof(NEW.template_id) <> 'text' OR length(NEW.template_id) = 0 OR instr(NEW.template_id, char(0)) > 0 OR NEW.created_at IS NULL OR typeof(NEW.created_at) <> 'text' OR length(NEW.created_at) = 0 OR instr(NEW.created_at, char(0)) > 0 OR NEW.updated_at IS NULL OR typeof(NEW.updated_at) <> 'text' OR length(NEW.updated_at) = 0 OR instr(NEW.updated_at, char(0)) > 0
      OR (NEW.created_by_membership_id IS NOT NULL AND (typeof(NEW.created_by_membership_id) <> 'text'
        OR length(NEW.created_by_membership_id) = 0 OR instr(NEW.created_by_membership_id, char(0)) > 0))
      OR typeof(NEW.version_number) <> 'integer' OR NEW.version_number NOT BETWEEN 1 AND 9007199254740991
      OR NEW.status IS NOT 'draft' OR NEW.published_at IS NOT NULL);
END;
--> statement-breakpoint
CREATE TRIGGER systems_template_versions_update_guard
BEFORE UPDATE ON template_versions
BEGIN
  SELECT RAISE(ABORT, 'Systems version snapshot is immutable')
  WHERE EXISTS (SELECT 1 FROM templates WHERE id = OLD.template_id AND workspace_id = OLD.workspace_id AND kind = 'systems') AND (NEW.id IS NOT OLD.id OR NEW.rowid IS NOT OLD.rowid OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.template_id IS NOT OLD.template_id OR NEW.version_number IS NOT OLD.version_number OR NEW.definition_json IS NOT OLD.definition_json OR NEW.definition_hash IS NOT OLD.definition_hash OR NEW.notes IS NOT OLD.notes OR NEW.created_by_membership_id IS NOT OLD.created_by_membership_id OR NEW.created_at IS NOT OLD.created_at);
  SELECT RAISE(ABORT, 'Systems version replacement collision')
  WHERE EXISTS (SELECT 1 FROM template_versions v
    JOIN templates t ON t.id = v.template_id AND t.workspace_id = v.workspace_id
    WHERE t.kind = 'systems' AND v.rowid <> OLD.rowid AND (v.id = NEW.id OR (v.template_id = NEW.template_id AND v.version_number = NEW.version_number)
      OR (NEW.status = 'published' AND v.status = 'published' AND v.template_id = NEW.template_id)
      OR v.rowid = NEW.rowid));
  SELECT RAISE(ABORT, 'Systems generation source version identity is reserved')
  WHERE EXISTS (SELECT 1 FROM systems_blueprint_generations g
    WHERE (g.template_version_id = NEW.id AND NEW.id IS NOT OLD.id)
      OR (g.template_id = NEW.template_id AND g.template_version_number = NEW.version_number
        AND (NEW.template_id IS NOT OLD.template_id OR NEW.version_number IS NOT OLD.version_number)));
  SELECT RAISE(ABORT, 'Systems version lifecycle transition is invalid')
  WHERE EXISTS (SELECT 1 FROM templates WHERE id = OLD.template_id AND workspace_id = OLD.workspace_id AND kind = 'systems')
    -- Reject NULL before SQLite OR REPLACE can substitute the 'draft' default.
    AND (NEW.status IS NULL OR NOT (NEW.status IS OLD.status
      OR (OLD.status = 'draft' AND NEW.status = 'published')
      OR (OLD.status = 'published' AND NEW.status = 'retired')));
  SELECT RAISE(ABORT, 'Systems version publication timestamp is immutable or missing')
  WHERE EXISTS (SELECT 1 FROM templates WHERE id = OLD.template_id AND workspace_id = OLD.workspace_id AND kind = 'systems')
    AND (((OLD.status <> 'draft' OR NEW.status <> 'published') AND NEW.published_at IS NOT OLD.published_at)
      OR (OLD.status = 'draft' AND NEW.status = 'published'
        AND (OLD.published_at IS NOT NULL OR NEW.published_at IS NULL OR typeof(NEW.published_at) <> 'text'
          OR length(NEW.published_at) = 0 OR instr(NEW.published_at, char(0)) > 0)));
  SELECT RAISE(ABORT, 'Systems version update timestamp is required')
  WHERE EXISTS (SELECT 1 FROM templates WHERE id = OLD.template_id AND workspace_id = OLD.workspace_id AND kind = 'systems') AND (NEW.updated_at IS NULL OR typeof(NEW.updated_at) <> 'text'
    OR length(NEW.updated_at) = 0 OR instr(NEW.updated_at, char(0)) > 0);
END;
--> statement-breakpoint
CREATE TRIGGER systems_template_versions_delete_guard
BEFORE DELETE ON template_versions
BEGIN
  SELECT RAISE(ABORT, 'Systems version history is retained')
  WHERE EXISTS (SELECT 1 FROM templates WHERE id = OLD.template_id AND workspace_id = OLD.workspace_id AND kind = 'systems') AND (OLD.status <> 'draft'
    OR EXISTS (SELECT 1 FROM systems_blueprint_generations g
      WHERE g.template_version_id = OLD.id
        OR (g.template_id = OLD.template_id AND g.template_version_number = OLD.version_number)));
END;
--> statement-breakpoint
-- A parent kind/identity change or replacement must not remove Systems guards
-- or adopt pre-existing non-Systems snapshots without their insert validation.
CREATE TRIGGER systems_version_templates_insert_guard
BEFORE INSERT ON templates
BEGIN
  SELECT RAISE(ABORT, 'Systems version Template replacement collision')
  WHERE EXISTS (SELECT 1 FROM templates t
    WHERE (t.kind = 'systems' OR NEW.kind = 'systems')
      AND EXISTS (SELECT 1 FROM template_versions v WHERE v.template_id = t.id AND v.workspace_id = t.workspace_id)
      AND (t.id = NEW.id OR (t.workspace_id = NEW.workspace_id AND t.kind = NEW.kind AND t.slug = NEW.slug)
      OR t.rowid = NEW.rowid));
END;
--> statement-breakpoint
CREATE TRIGGER systems_version_templates_update_guard
BEFORE UPDATE ON templates
BEGIN
  SELECT RAISE(ABORT, 'Systems version Template identity and kind are immutable')
  WHERE (OLD.kind = 'systems' OR NEW.kind = 'systems')
    AND EXISTS (SELECT 1 FROM template_versions v WHERE v.template_id = OLD.id AND v.workspace_id = OLD.workspace_id)
    AND (NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.kind IS NOT OLD.kind);
  SELECT RAISE(ABORT, 'Systems version Template replacement collision')
  WHERE EXISTS (SELECT 1 FROM templates t
    WHERE t.rowid <> OLD.rowid AND (t.kind = 'systems' OR NEW.kind = 'systems')
      AND EXISTS (SELECT 1 FROM template_versions v WHERE v.template_id = t.id AND v.workspace_id = t.workspace_id)
      AND (t.id = NEW.id OR (t.workspace_id = NEW.workspace_id AND t.kind = NEW.kind AND t.slug = NEW.slug)
      OR t.rowid = NEW.rowid));
END;
