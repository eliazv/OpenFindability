CREATE TABLE `gsc_dimension_breakdowns` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`range_start` text NOT NULL,
	`range_end` text NOT NULL,
	`dimension` text NOT NULL,
	`key` text NOT NULL,
	`clicks` integer NOT NULL,
	`impressions` integer NOT NULL,
	`ctr` real NOT NULL,
	`avg_position` real NOT NULL,
	`raw_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gsc_dimension_breakdowns_project_range_dimension_key` ON `gsc_dimension_breakdowns` (`project_id`,`range_start`,`range_end`,`dimension`,`key`);--> statement-breakpoint
CREATE TABLE `gsc_sitemaps` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`type` text,
	`last_submitted` text,
	`is_pending` integer NOT NULL,
	`is_sitemaps_index` integer NOT NULL,
	`warnings` integer NOT NULL,
	`errors` integer NOT NULL,
	`raw_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gsc_sitemaps_project_path` ON `gsc_sitemaps` (`project_id`,`path`);