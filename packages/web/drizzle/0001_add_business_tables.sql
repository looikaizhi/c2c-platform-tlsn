CREATE TABLE `fiat_bank_accounts` (
	`id` integer NOT NULL,
	`wallet_address` text NOT NULL,
	`method_id_fk` integer NOT NULL,
	`currency` text NOT NULL,
	`account_holder_name` text NOT NULL,
	`account_number_hash` blob NOT NULL,
	`account_last4` text NOT NULL,
	`bank_verified` integer DEFAULT false NOT NULL,
	`create_time` integer NOT NULL,
	PRIMARY KEY(`id`, `wallet_address`),
	FOREIGN KEY (`wallet_address`) REFERENCES `userdata`(`wallet_address`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`method_id_fk`) REFERENCES `payment_method`(`method_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fiat_bank_accounts_account_number_hash_unique` ON `fiat_bank_accounts` (`account_number_hash`);--> statement-breakpoint
CREATE INDEX `idx_fiat_user` ON `fiat_bank_accounts` (`wallet_address`);--> statement-breakpoint
CREATE TABLE `order_contract` (
	`id` integer NOT NULL,
	`wallet_address` text NOT NULL,
	`fiat_asset_name` text NOT NULL,
	`crypto_asset_name` text NOT NULL,
	`fiat_to_crypto` integer NOT NULL,
	`contract_address` text NOT NULL,
	`create_time` integer NOT NULL,
	PRIMARY KEY(`id`, `wallet_address`),
	FOREIGN KEY (`wallet_address`) REFERENCES `userdata`(`wallet_address`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_contract_contract_address_unique` ON `order_contract` (`contract_address`);--> statement-breakpoint
CREATE UNIQUE INDEX `uk_order` ON `order_contract` (`wallet_address`,`fiat_asset_name`,`crypto_asset_name`,`fiat_to_crypto`);--> statement-breakpoint
CREATE TABLE `order_index` (
	`wallet_address` text NOT NULL,
	`order_id` integer NOT NULL,
	`bank_id` integer NOT NULL,
	FOREIGN KEY (`order_id`,`wallet_address`) REFERENCES `order_contract`(`id`,`wallet_address`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`bank_id`,`wallet_address`) REFERENCES `fiat_bank_accounts`(`id`,`wallet_address`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_order_index_wallet` ON `order_index` (`wallet_address`);--> statement-breakpoint
CREATE INDEX `idx_order_index_order` ON `order_index` (`order_id`,`wallet_address`);--> statement-breakpoint
CREATE INDEX `idx_order_index_bank` ON `order_index` (`bank_id`,`wallet_address`);--> statement-breakpoint
CREATE TABLE `payment_method` (
	`method_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`method_name` text NOT NULL,
	`icon_url` text,
	`url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_method_method_name_unique` ON `payment_method` (`method_name`);--> statement-breakpoint
CREATE TABLE `support_crypto_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`crypto_id` integer NOT NULL,
	`token_symbol` text NOT NULL,
	`token_address` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`edit_time` integer NOT NULL,
	`created_time` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_crypto_assets_crypto_id_unique` ON `support_crypto_assets` (`crypto_id`);--> statement-breakpoint
CREATE TABLE `support_fiat_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fiat_id` integer NOT NULL,
	`fiat_name` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`edit_time` integer NOT NULL,
	`created_time` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_fiat_assets_fiat_id_unique` ON `support_fiat_assets` (`fiat_id`);--> statement-breakpoint
CREATE TABLE `userdata` (
	`wallet_address` text PRIMARY KEY NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`close_rate` real DEFAULT 0 NOT NULL,
	`trading_volume` integer DEFAULT 0 NOT NULL,
	`close_rate_binance` real DEFAULT 0 NOT NULL,
	`trading_volume_binance` integer DEFAULT 0 NOT NULL,
	`user_level` integer DEFAULT 0 NOT NULL,
	`minimum_amount` integer DEFAULT 50 NOT NULL,
	`maximum_amount` integer DEFAULT 100 NOT NULL,
	`create_time` integer NOT NULL,
	`update_time` integer NOT NULL
);
