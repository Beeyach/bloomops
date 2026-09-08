-- Add current workflow context without rebuilding Content or dropping C1's
-- identity/Social-parent triggers. Historical C1 rows remain valid with NULL.
ALTER TABLE `content_items` ADD `stage_context` text CONSTRAINT `content_items_stage_context_chk` CHECK (stage_context IS NULL OR (stage IN ('waiting_for_recording','revision_requested') AND length(trim(stage_context)) BETWEEN 1 AND 2000));
--> statement-breakpoint
CREATE INDEX `content_items_ws_stage_created_idx` ON `content_items` (`workspace_id`,`stage`,`created_at`,`id`);
