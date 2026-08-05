CREATE TABLE `asc_experiment_treatments` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`asc_treatment_id` text NOT NULL,
	`name` text NOT NULL,
	`state` text,
	`raw_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`experiment_id`) REFERENCES `asc_experiments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asc_experiment_treatments_experiment_asc_id` ON `asc_experiment_treatments` (`experiment_id`,`asc_treatment_id`);--> statement-breakpoint
CREATE TABLE `asc_experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`asc_experiment_id` text NOT NULL,
	`name` text NOT NULL,
	`state` text NOT NULL,
	`element_type` text,
	`raw_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asc_experiments_project_asc_id` ON `asc_experiments` (`project_id`,`asc_experiment_id`);--> statement-breakpoint
CREATE TABLE `asc_metadata_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`locale` text NOT NULL,
	`kind` text NOT NULL,
	`name` text,
	`subtitle` text,
	`keywords` text,
	`description` text,
	`promotional_text` text,
	`whats_new` text,
	`version_state` text,
	`raw_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asc_metadata_snapshots_project_locale` ON `asc_metadata_snapshots` (`project_id`,`locale`);