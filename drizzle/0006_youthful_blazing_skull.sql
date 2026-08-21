CREATE TABLE `asc_analytics_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`downloads` integer,
	`retention_day1` real,
	`retention_day7` real,
	`retention_day28` real,
	`raw_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asc_analytics_metrics_project_date` ON `asc_analytics_metrics` (`project_id`,`date`);--> statement-breakpoint
CREATE TABLE `play_install_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`installs` integer,
	`uninstalls` integer,
	`active_device_installs` integer,
	`raw_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `play_install_stats_project_date` ON `play_install_stats` (`project_id`,`date`);--> statement-breakpoint
CREATE TABLE `play_vitals_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`crash_rate` real,
	`anr_rate` real,
	`raw_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `play_vitals_metrics_project_date` ON `play_vitals_metrics` (`project_id`,`date`);