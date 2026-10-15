CREATE TABLE `seo_geo_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`record_key` text NOT NULL,
	`window_start` text NOT NULL,
	`window_end` text NOT NULL,
	`grain` text NOT NULL,
	`scope` text NOT NULL,
	`metrics` text NOT NULL,
	`coverage` text NOT NULL,
	`raw_json` text,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seo_geo_source_project_kind_key` ON `seo_geo_observations` (`source`,`project_id`,`kind`,`record_key`);--> statement-breakpoint
CREATE INDEX `seo_geo_project_source_window` ON `seo_geo_observations` (`project_id`,`source`,`window_end`);--> statement-breakpoint
ALTER TABLE `projects` ADD `bing_site_url` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `cloudflare_zone_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `clarity_project_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `clarity_token_env` text;