CREATE TABLE `admin_action_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admin_wallet` text NOT NULL,
	`target_wallet` text NOT NULL,
	`action` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`admin_wallet`) REFERENCES `user_profile`(`wallet_address`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_wallet`) REFERENCES `user_profile`(`wallet_address`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_profile` (
	`wallet_address` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'buyer' NOT NULL,
	`granted_by` text,
	`granted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verify_attempt_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`caller_wallet` text NOT NULL,
	`order_key` text NOT NULL,
	`role` text NOT NULL,
	`onchain_commit` text NOT NULL,
	`result` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallet_payment_binding` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_address` text NOT NULL,
	`platform_id` text NOT NULL,
	`plaintext_name` text NOT NULL,
	`plaintext_handle` text NOT NULL,
	`salt` text NOT NULL,
	`name_commit` text NOT NULL,
	`id_commit` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`superseded_at` integer,
	FOREIGN KEY (`wallet_address`) REFERENCES `user_profile`(`wallet_address`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_payment_binding_name_commit_unique` ON `wallet_payment_binding` (`name_commit`);--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_payment_binding_id_commit_unique` ON `wallet_payment_binding` (`id_commit`);--> statement-breakpoint
CREATE UNIQUE INDEX `uk_binding_active` ON `wallet_payment_binding` (`wallet_address`,`platform_id`) WHERE "wallet_payment_binding"."status" = 'active';--> statement-breakpoint
CREATE INDEX `idx_binding_lookup` ON `wallet_payment_binding` (`wallet_address`,`platform_id`,`status`);