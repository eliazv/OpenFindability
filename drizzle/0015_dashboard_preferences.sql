CREATE TABLE `project_dashboard_preferences` (
 `project_id` text PRIMARY KEY NOT NULL,
 `favorite` integer DEFAULT false NOT NULL,
 `archived` integer DEFAULT false NOT NULL,
 `primary_metrics` text DEFAULT '[]' NOT NULL,
 `goal_metric` text,
 `goal_target` real,
 `goal_currency` text,
 `updated_at` text NOT NULL
);
