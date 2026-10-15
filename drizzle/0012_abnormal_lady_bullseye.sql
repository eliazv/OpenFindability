CREATE TABLE `ga4_landing_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`hostname` text NOT NULL,
	`landing_page` text NOT NULL,
	`channel` text NOT NULL,
	`source_medium` text NOT NULL,
	`device` text NOT NULL,
	`sessions` integer NOT NULL,
	`engaged_sessions` integer NOT NULL,
	`key_events` real NOT NULL,
	`session_key_event_rate` real NOT NULL,
	`time_zone` text,
	`quality` text NOT NULL,
	`raw_json` text,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ga4_landing_identity` ON `ga4_landing_metrics` (`project_id`,`date`,`hostname`,`landing_page`,`channel`,`source_medium`,`device`);--> statement-breakpoint
CREATE TABLE `project_interventions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`target_url` text,
	`reference` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interventions_project_date` ON `project_interventions` (`project_id`,`date`);--> statement-breakpoint
CREATE TABLE `web_performance_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source` text NOT NULL,
	`url` text NOT NULL,
	`scope` text NOT NULL,
	`device` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`period_start` text,
	`period_end` text,
	`lcp_ms` real,
	`inp_ms` real,
	`cls` real,
	`fcp_ms` real,
	`tbt_ms` real,
	`performance_score` real,
	`final_url` text,
	`version` text,
	`raw_json` text,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `web_performance_identity` ON `web_performance_metrics` (`project_id`,`source`,`url`,`scope`,`device`,`date`);