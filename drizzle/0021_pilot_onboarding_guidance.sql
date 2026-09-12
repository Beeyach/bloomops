-- Additive runtime guidance: preserve every item, submission, FK and snapshot.
ALTER TABLE onboarding_items ADD COLUMN guidance_instructions text;
--> statement-breakpoint
ALTER TABLE onboarding_items ADD COLUMN action_type text NOT NULL DEFAULT 'unconfigured' CONSTRAINT onboarding_items_action_type_chk CHECK(action_type IN ('unconfigured','confirmation','agreement','upload','booking','access','link'));
--> statement-breakpoint
ALTER TABLE onboarding_items ADD COLUMN action_url text;
--> statement-breakpoint
ALTER TABLE onboarding_items ADD COLUMN guidance_revision integer NOT NULL DEFAULT 0 CONSTRAINT onboarding_items_guidance_revision_chk CHECK(guidance_revision BETWEEN 0 AND 2147483647);
