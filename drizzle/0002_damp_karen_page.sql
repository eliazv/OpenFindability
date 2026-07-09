CREATE TABLE `admob_mediation_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`ad_source_id` text,
	`ad_source_name` text NOT NULL,
	`format` text,
	`ad_requests` integer,
	`matched_requests` integer,
	`match_rate` real,
	`impressions` integer,
	`clicks` integer,
	`estimated_earnings` real,
	`observed_ecpm` real,
	`currency` text,
	`raw_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admob_mediation_metrics_project_date_source_format` ON `admob_mediation_metrics` (`project_id`,`date`,`ad_source_id`,`format`);--> statement-breakpoint
ALTER TABLE `projects` ADD `admob_app_id_ios` text;