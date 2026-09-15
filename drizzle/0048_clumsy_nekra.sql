-- D1-compatible additive application preserves existing rows and triggers.
ALTER TABLE `client_report_metrics` ADD `import_id` text;
--> statement-breakpoint
ALTER TABLE `client_report_metrics` ADD `source_kind` text DEFAULT 'manual' NOT NULL
CONSTRAINT `client_report_metric_source_ck` CHECK(source_kind IN ('manual','csv') AND (source_kind='manual' OR import_id IS NOT NULL));
