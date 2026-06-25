CREATE TABLE `app_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`keyword` text NOT NULL,
	`country` text NOT NULL,
	`popularity_score` real NOT NULL,
	`difficulty_score` real NOT NULL,
	`opportunity_score` real NOT NULL,
	`difficulty_label` text,
	`classification` text,
	`app_rank` integer,
	`raw_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_keywords_project_date` ON `app_keywords` (`project_id`,`date`);--> statement-breakpoint
CREATE TABLE `app_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`review_id` text NOT NULL,
	`date` text NOT NULL,
	`rating` integer NOT NULL,
	`text` text,
	`language` text,
	`app_version_name` text,
	`thumbs_up` integer NOT NULL,
	`raw_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_reviews_project_review` ON `app_reviews` (`project_id`,`review_id`);--> statement-breakpoint
CREATE TABLE `aso_app_rank_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`keyword` text NOT NULL,
	`country` text NOT NULL,
	`source` text NOT NULL,
	`project_id` text,
	`app_id` integer,
	`app_rank` integer,
	`raw_json` text,
	`observed_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `aso_app_rank_snapshots_project_date` ON `aso_app_rank_snapshots` (`project_id`,`date`);--> statement-breakpoint
CREATE TABLE `aso_keyword_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`keyword` text NOT NULL,
	`country` text NOT NULL,
	`source` text NOT NULL,
	`popularity_score` real NOT NULL,
	`difficulty_score` real NOT NULL,
	`opportunity_score` real NOT NULL,
	`difficulty_label` text,
	`classification` text,
	`competitor_count` integer,
	`raw_json` text,
	`observed_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `aso_keyword_snapshots_keyword_country_date` ON `aso_keyword_snapshots` (`keyword`,`country`,`date`);--> statement-breakpoint
CREATE TABLE `connector_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`project_id` text,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	`error_message` text,
	`stats` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `connector_runs_project_id` ON `connector_runs` (`project_id`);--> statement-breakpoint
CREATE TABLE `metric_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source` text NOT NULL,
	`date` text NOT NULL,
	`clicks` integer,
	`impressions` integer,
	`ctr` real,
	`avg_position` real,
	`visitors` integer,
	`pageviews` integer,
	`avg_rating` real,
	`total_reviews` integer,
	`revenue` real,
	`mrr` real,
	`active_subscribers` integer,
	`active_trials` integer,
	`new_customers` integer,
	`ad_requests` integer,
	`currency` text,
	`raw_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metric_snapshots_project_source_date` ON `metric_snapshots` (`project_id`,`source`,`date`);--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`severity` text NOT NULL,
	`score` real NOT NULL,
	`status` text NOT NULL,
	`detected_at` text NOT NULL,
	`raw_json` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `opportunities_project_id` ON `opportunities` (`project_id`);--> statement-breakpoint
CREATE TABLE `page_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`page` text NOT NULL,
	`clicks` integer NOT NULL,
	`impressions` integer NOT NULL,
	`ctr` real NOT NULL,
	`avg_position` real NOT NULL,
	`raw_json` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_metrics_project_date_page` ON `page_metrics` (`project_id`,`date`,`page`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`type` text NOT NULL,
	`category` text,
	`website_url` text,
	`gsc_property` text,
	`umami_website_id` text,
	`play_console_package_name` text,
	`app_store_track_id` integer,
	`respect_aso_app_id` integer,
	`aso_keywords` text,
	`aso_countries` text,
	`revenue_cat_project_id` text,
	`admob_app_id` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `search_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`query` text NOT NULL,
	`page` text,
	`clicks` integer NOT NULL,
	`impressions` integer NOT NULL,
	`ctr` real NOT NULL,
	`avg_position` real NOT NULL,
	`raw_json` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_queries_project_date_query_page` ON `search_queries` (`project_id`,`date`,`query`,`page`);