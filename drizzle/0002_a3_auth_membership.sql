ALTER TABLE `workspace_invitations` ADD `invitee_name` text;--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invitations_pending_uq` ON `workspace_invitations` (`workspace_id`,`email`) WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account` (`issuer`,`account_id`);