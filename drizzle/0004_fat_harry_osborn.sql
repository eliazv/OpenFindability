CREATE TABLE `gsc_index_inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`site_url` text NOT NULL,
	`url` text NOT NULL,
	`inspection_date` text NOT NULL,
	`inspected_at` text NOT NULL,
	`discovered_from` text NOT NULL,
	`verdict` text,
	`coverage_state` text,
	`robots_txt_state` text,
	`indexing_state` text,
	`page_fetch_state` text,
	`google_canonical` text,
	`user_canonical` text,
	`last_crawl_time` text,
	`crawled_as` text,
	`inspection_result_link` text,
	`issue_code` text NOT NULL,
	`severity` text NOT NULL,
	`raw_json` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gsc_index_inspections_site_url_date_url` ON `gsc_index_inspections` (`site_url`,`inspection_date`,`url`);--> statement-breakpoint
CREATE INDEX `gsc_index_inspections_project_date` ON `gsc_index_inspections` (`project_id`,`inspection_date`);