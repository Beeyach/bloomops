-- Additive compatibility baseline: old Content, links and immutable history stay in place.
-- Drizzle's generated table rebuild is deliberately replaced with supported ADD COLUMN operations.
ALTER TABLE `content_items` ADD COLUMN `production_area` text DEFAULT 'social' NOT NULL
  CONSTRAINT `content_items_production_area_chk` CHECK (production_area IN ('social','ads'));
--> statement-breakpoint
ALTER TABLE `content_items` ADD COLUMN `ads_project_id` text REFERENCES `projects`(`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
  CONSTRAINT `content_items_production_context_chk` CHECK ((production_area='social' AND ads_project_id IS NULL) OR (production_area='ads' AND ads_project_id IS NOT NULL));
--> statement-breakpoint
CREATE INDEX `content_items_ws_area_created_idx` ON `content_items` (`workspace_id`,`production_area`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `content_items_ws_ads_project_created_idx` ON `content_items` (`workspace_id`,`ads_project_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER content_items_production_context_immutable BEFORE UPDATE ON content_items
WHEN NEW.production_area IS NOT OLD.production_area OR NEW.ads_project_id IS NOT OLD.ads_project_id
BEGIN SELECT RAISE(ABORT, 'Content production context is immutable'); END;
--> statement-breakpoint
DROP TRIGGER content_items_social_service;
--> statement-breakpoint
CREATE TRIGGER content_items_social_service BEFORE INSERT ON content_items
WHEN NEW.production_area='social' AND NEW.service_engagement_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM service_engagements se
  JOIN service_types st ON st.workspace_id=se.workspace_id AND st.id=se.service_type_id
  JOIN departments d ON d.workspace_id=st.workspace_id AND d.id=st.department_id
  WHERE se.workspace_id=NEW.workspace_id AND se.client_id=NEW.client_id
    AND se.id=NEW.service_engagement_id AND d.slug='social'
)
BEGIN SELECT RAISE(ABORT, 'Content requires a Social service'); END;
--> statement-breakpoint
CREATE TRIGGER content_items_ads_project BEFORE INSERT ON content_items
WHEN NEW.production_area='ads' AND NOT EXISTS (
  SELECT 1 FROM projects p
  JOIN service_engagements se ON se.workspace_id=p.workspace_id AND se.client_id=p.client_id AND se.id=p.service_engagement_id
  JOIN service_types st ON st.workspace_id=se.workspace_id AND st.id=se.service_type_id
  JOIN departments d ON d.workspace_id=st.workspace_id AND d.id=st.department_id
  WHERE p.id=NEW.ads_project_id AND p.workspace_id=NEW.workspace_id AND p.client_id=NEW.client_id
    AND p.service_engagement_id=NEW.service_engagement_id AND d.slug='ads'
)
BEGIN SELECT RAISE(ABORT, 'Ads Content requires its exact Ads Project parent'); END;
--> statement-breakpoint
CREATE TRIGGER projects_ads_content_identity_immutable BEFORE UPDATE ON projects
WHEN (NEW.workspace_id IS NOT OLD.workspace_id OR NEW.client_id IS NOT OLD.client_id OR NEW.service_engagement_id IS NOT OLD.service_engagement_id)
  AND EXISTS (SELECT 1 FROM content_items c WHERE c.ads_project_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'An Ads Content Project parent is immutable'); END;
--> statement-breakpoint
-- REPLACE is delete+insert, so UPDATE guards alone cannot protect context.
-- Ads also preserves all original immutable identity fields. Keep same-context
-- Social conflict behavior compatible with the E1 INSERT ... DO NOTHING shape.
CREATE TRIGGER content_items_production_context_insert_guard BEFORE INSERT ON content_items
WHEN EXISTS (
  SELECT 1 FROM content_items c
  WHERE (c.id=NEW.id OR (c.workspace_id=NEW.workspace_id AND c.client_id=NEW.client_id AND c.creation_request_id=NEW.creation_request_id))
    AND (c.production_area IS NOT NEW.production_area OR c.ads_project_id IS NOT NEW.ads_project_id
      OR (c.production_area='ads' AND (c.id IS NOT NEW.id OR c.workspace_id IS NOT NEW.workspace_id
        OR c.client_id IS NOT NEW.client_id OR c.service_engagement_id IS NOT NEW.service_engagement_id
        OR c.creation_request_id IS NOT NEW.creation_request_id OR c.created_at IS NOT NEW.created_at)))
)
BEGIN SELECT RAISE(ABORT, 'Content production context is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER projects_ads_content_insert_guard BEFORE INSERT ON projects
WHEN EXISTS (
  SELECT 1 FROM content_items c WHERE c.ads_project_id=NEW.id
    AND (c.workspace_id IS NOT NEW.workspace_id OR c.client_id IS NOT NEW.client_id OR c.service_engagement_id IS NOT NEW.service_engagement_id)
)
BEGIN SELECT RAISE(ABORT, 'An Ads Content Project parent is immutable'); END;
