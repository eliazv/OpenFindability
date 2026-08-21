import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type", { enum: ["web", "app", "web_app"] }).notNull(),
  category: text("category"),
  websiteUrl: text("website_url"),
  gscProperty: text("gsc_property"),
  umamiWebsiteId: text("umami_website_id"),
  playConsolePackageName: text("play_console_package_name"),
  appStoreTrackId: integer("app_store_track_id"),
  respectAsoAppId: integer("respect_aso_app_id"),
  asoKeywords: text("aso_keywords", { mode: "json" }).$type<string[]>(),
  asoCountries: text("aso_countries", { mode: "json" }).$type<string[]>(),
  revenueCatProjectId: text("revenue_cat_project_id"),
  admobAppId: text("admob_app_id"),
  admobAppIdIos: text("admob_app_id_ios"),
  adsenseSiteDomain: text("adsense_site_domain"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const metricSnapshots = sqliteTable(
  "metric_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    source: text("source", {
      enum: [
        "gsc",
        "umami",
        "play_console",
        "aso",
        "revenuecat",
        "admob",
        "adsense",
        "play_vitals",
        "play_stats",
        "asc_analytics",
      ],
    }).notNull(),
    date: text("date").notNull(),
    clicks: integer("clicks"),
    impressions: integer("impressions"),
    ctr: real("ctr"),
    avgPosition: real("avg_position"),
    visitors: integer("visitors"),
    pageviews: integer("pageviews"),
    avgRating: real("avg_rating"),
    totalReviews: integer("total_reviews"),
    revenue: real("revenue"),
    mrr: real("mrr"),
    activeSubscribers: integer("active_subscribers"),
    activeTrials: integer("active_trials"),
    newCustomers: integer("new_customers"),
    adRequests: integer("ad_requests"),
    currency: text("currency"),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("metric_snapshots_project_source_date").on(table.projectId, table.source, table.date),
  ],
);

export const searchQueries = sqliteTable(
  "search_queries",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    query: text("query").notNull(),
    page: text("page"),
    clicks: integer("clicks").notNull(),
    impressions: integer("impressions").notNull(),
    ctr: real("ctr").notNull(),
    avgPosition: real("avg_position").notNull(),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
  },
  (table) => [
    uniqueIndex("search_queries_project_date_query_page").on(
      table.projectId,
      table.date,
      table.query,
      table.page,
    ),
  ],
);

export const pageMetrics = sqliteTable(
  "page_metrics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    page: text("page").notNull(),
    clicks: integer("clicks").notNull(),
    impressions: integer("impressions").notNull(),
    ctr: real("ctr").notNull(),
    avgPosition: real("avg_position").notNull(),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
  },
  (table) => [uniqueIndex("page_metrics_project_date_page").on(table.projectId, table.date, table.page)],
);

export const gscDimensionBreakdowns = sqliteTable(
  "gsc_dimension_breakdowns",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    rangeStart: text("range_start").notNull(),
    rangeEnd: text("range_end").notNull(),
    dimension: text("dimension", { enum: ["device", "country", "searchAppearance"] }).notNull(),
    key: text("key").notNull(),
    clicks: integer("clicks").notNull(),
    impressions: integer("impressions").notNull(),
    ctr: real("ctr").notNull(),
    avgPosition: real("avg_position").notNull(),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("gsc_dimension_breakdowns_project_range_dimension_key").on(
      table.projectId,
      table.rangeStart,
      table.rangeEnd,
      table.dimension,
      table.key,
    ),
  ],
);

export const gscSitemaps = sqliteTable(
  "gsc_sitemaps",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    type: text("type"),
    lastSubmitted: text("last_submitted"),
    isPending: integer("is_pending", { mode: "boolean" }).notNull(),
    isSitemapsIndex: integer("is_sitemaps_index", { mode: "boolean" }).notNull(),
    warnings: integer("warnings").notNull(),
    errors: integer("errors").notNull(),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("gsc_sitemaps_project_path").on(table.projectId, table.path)],
);

export const gscIndexInspections = sqliteTable(
  "gsc_index_inspections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    siteUrl: text("site_url").notNull(),
    url: text("url").notNull(),
    inspectionDate: text("inspection_date").notNull(),
    inspectedAt: text("inspected_at").notNull(),
    discoveredFrom: text("discovered_from", { mode: "json" }).$type<string[]>().notNull(),
    verdict: text("verdict"),
    coverageState: text("coverage_state"),
    robotsTxtState: text("robots_txt_state"),
    indexingState: text("indexing_state"),
    pageFetchState: text("page_fetch_state"),
    googleCanonical: text("google_canonical"),
    userCanonical: text("user_canonical"),
    lastCrawlTime: text("last_crawl_time"),
    crawledAs: text("crawled_as"),
    inspectionResultLink: text("inspection_result_link"),
    issueCode: text("issue_code", {
      enum: [
        "indexed",
        "blocked_by_robots",
        "blocked_by_noindex",
        "not_found",
        "soft_404",
        "server_error",
        "access_denied",
        "redirect_error",
        "crawled_not_indexed",
        "discovered_not_indexed",
        "duplicate_canonical",
        "redirected",
        "not_indexed",
        "inspection_error",
      ],
    }).notNull(),
    severity: text("severity", { enum: ["none", "low", "medium", "high"] }).notNull(),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
  },
  (table) => [
    uniqueIndex("gsc_index_inspections_site_url_date_url").on(table.siteUrl, table.inspectionDate, table.url),
    index("gsc_index_inspections_project_date").on(table.projectId, table.inspectionDate),
  ],
);

export const opportunities = sqliteTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: [
        "low_ctr_query",
        "striking_distance_query",
        "declining_page",
        "growing_page",
        "analytics_spike",
        "page_two_query",
        "zero_click_query",
        "query_cannibalization",
      ],
    }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: text("severity", { enum: ["low", "medium", "high"] }).notNull(),
    score: real("score").notNull(),
    status: text("status", { enum: ["open", "ignored", "done"] }).notNull(),
    detectedAt: text("detected_at").notNull(),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
  },
  (table) => [index("opportunities_project_id").on(table.projectId)],
);

export const connectorRuns = sqliteTable(
  "connector_runs",
  {
    id: text("id").primaryKey(),
    source: text("source", {
      enum: [
        "gsc",
        "gsc_index",
        "umami",
        "play_console",
        "aso",
        "revenuecat",
        "admob",
        "adsense",
        "asc_metadata",
        "asc_experiments",
        "play_vitals",
        "play_stats",
        "asc_analytics",
        "app_discovery",
        "all",
      ],
    }).notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["success", "failed", "skipped"] }).notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at").notNull(),
    errorMessage: text("error_message"),
    stats: text("stats", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (table) => [index("connector_runs_project_id").on(table.projectId)],
);

export const appReviews = sqliteTable(
  "app_reviews",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    reviewId: text("review_id").notNull(),
    date: text("date").notNull(),
    rating: integer("rating").notNull(),
    reviewText: text("text"),
    language: text("language"),
    appVersionName: text("app_version_name"),
    thumbsUp: integer("thumbs_up").notNull(),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("app_reviews_project_review").on(table.projectId, table.reviewId)],
);

export const appKeywords = sqliteTable(
  "app_keywords",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    keyword: text("keyword").notNull(),
    country: text("country").notNull(),
    popularityScore: real("popularity_score").notNull(),
    difficultyScore: real("difficulty_score").notNull(),
    opportunityScore: real("opportunity_score").notNull(),
    difficultyLabel: text("difficulty_label"),
    classification: text("classification"),
    appRank: integer("app_rank"),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("app_keywords_project_date").on(table.projectId, table.date)],
);

export const asoKeywordSnapshots = sqliteTable(
  "aso_keyword_snapshots",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    keyword: text("keyword").notNull(),
    country: text("country").notNull(),
    source: text("source", { enum: ["respectaso"] }).notNull(),
    popularityScore: real("popularity_score").notNull(),
    difficultyScore: real("difficulty_score").notNull(),
    opportunityScore: real("opportunity_score").notNull(),
    difficultyLabel: text("difficulty_label"),
    classification: text("classification"),
    competitorCount: integer("competitor_count"),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    observedAt: text("observed_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("aso_keyword_snapshots_keyword_country_date").on(table.keyword, table.country, table.date)],
);

export const asoAppRankSnapshots = sqliteTable(
  "aso_app_rank_snapshots",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    keyword: text("keyword").notNull(),
    country: text("country").notNull(),
    source: text("source", { enum: ["respectaso"] }).notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    appId: integer("app_id"),
    appRank: integer("app_rank"),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    observedAt: text("observed_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("aso_app_rank_snapshots_project_date").on(table.projectId, table.date)],
);

export const ascMetadataSnapshots = sqliteTable(
  "asc_metadata_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    kind: text("kind", { enum: ["pull", "push"] }).notNull(),
    name: text("name"),
    subtitle: text("subtitle"),
    keywords: text("keywords"),
    description: text("description"),
    promotionalText: text("promotional_text"),
    whatsNew: text("whats_new"),
    versionState: text("version_state"),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("asc_metadata_snapshots_project_locale").on(table.projectId, table.locale)],
);

export const ascExperiments = sqliteTable(
  "asc_experiments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    ascExperimentId: text("asc_experiment_id").notNull(),
    name: text("name").notNull(),
    state: text("state").notNull(),
    elementType: text("element_type"),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("asc_experiments_project_asc_id").on(table.projectId, table.ascExperimentId)],
);

export const ascExperimentTreatments = sqliteTable(
  "asc_experiment_treatments",
  {
    id: text("id").primaryKey(),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => ascExperiments.id, { onDelete: "cascade" }),
    ascTreatmentId: text("asc_treatment_id").notNull(),
    name: text("name").notNull(),
    state: text("state"),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("asc_experiment_treatments_experiment_asc_id").on(table.experimentId, table.ascTreatmentId)],
);

export const admobMediationMetrics = sqliteTable(
  "admob_mediation_metrics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    adSourceId: text("ad_source_id"),
    adSourceName: text("ad_source_name").notNull(),
    format: text("format"),
    adRequests: integer("ad_requests"),
    matchedRequests: integer("matched_requests"),
    matchRate: real("match_rate"),
    impressions: integer("impressions"),
    clicks: integer("clicks"),
    estimatedEarnings: real("estimated_earnings"),
    observedEcpm: real("observed_ecpm"),
    currency: text("currency"),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("admob_mediation_metrics_project_date_source_format").on(
      table.projectId,
      table.date,
      table.adSourceId,
      table.format,
    ),
  ],
);

export const playVitalsMetrics = sqliteTable(
  "play_vitals_metrics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    crashRate: real("crash_rate"),
    anrRate: real("anr_rate"),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("play_vitals_metrics_project_date").on(table.projectId, table.date)],
);

export const playInstallStats = sqliteTable(
  "play_install_stats",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    installs: integer("installs"),
    uninstalls: integer("uninstalls"),
    activeDeviceInstalls: integer("active_device_installs"),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("play_install_stats_project_date").on(table.projectId, table.date)],
);

export const ascAnalyticsMetrics = sqliteTable(
  "asc_analytics_metrics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    downloads: integer("downloads"),
    retentionDay1: real("retention_day1"),
    retentionDay7: real("retention_day7"),
    retentionDay28: real("retention_day28"),
    rawJson: text("raw_json", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("asc_analytics_metrics_project_date").on(table.projectId, table.date)],
);

export const schema = {
  projects,
  metricSnapshots,
  searchQueries,
  pageMetrics,
  opportunities,
  connectorRuns,
  appReviews,
  appKeywords,
  asoKeywordSnapshots,
  asoAppRankSnapshots,
  gscDimensionBreakdowns,
  gscSitemaps,
  gscIndexInspections,
  admobMediationMetrics,
  ascMetadataSnapshots,
  ascExperiments,
  ascExperimentTreatments,
  playVitalsMetrics,
  playInstallStats,
  ascAnalyticsMetrics,
};
