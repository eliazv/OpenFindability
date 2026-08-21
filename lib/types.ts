export type SourceType =
  | "gsc"
  | "umami"
  | "play_console"
  | "aso"
  | "revenuecat"
  | "admob"
  | "adsense"
  | "play_vitals"
  | "play_stats"
  | "asc_analytics";

export type ProjectType = "web" | "app" | "web_app";

export type Project = {
  id: string;
  name: string;
  slug: string;
  type: ProjectType;
  category?: string;
  websiteUrl?: string;
  gscProperty?: string;
  umamiWebsiteId?: string;
  playConsolePackageName?: string;
  appStoreTrackId?: number;
  respectAsoAppId?: number;
  asoKeywords?: string[];
  asoCountries?: string[];
  revenueCatProjectId?: string;
  admobAppId?: string;
  admobAppIdIos?: string;
  adsenseSiteDomain?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type MetricSnapshot = {
  id: string;
  projectId: string;
  source: SourceType;
  date: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  avgPosition?: number;
  visitors?: number;
  pageviews?: number;
  avgRating?: number;
  totalReviews?: number;
  revenue?: number;
  mrr?: number;
  activeSubscribers?: number;
  activeTrials?: number;
  newCustomers?: number;
  adRequests?: number;
  currency?: string;
  rawJson?: unknown;
  createdAt: string;
};

export type SearchQueryMetric = {
  id: string;
  projectId: string;
  date: string;
  query: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  rawJson?: unknown;
};

export type AsoClassification =
  | "sweet_spot"
  | "good_target"
  | "hidden_gem"
  | "high_competition"
  | "moderate"
  | "low_volume"
  | "avoid";

export type AppKeywordMetric = {
  id: string;
  projectId: string;
  date: string;
  keyword: string;
  country: string;
  popularityScore: number;
  difficultyScore: number;
  opportunityScore: number;
  difficultyLabel?: string;
  classification?: AsoClassification | string;
  appRank?: number | null;
  rawJson?: unknown;
  createdAt: string;
};

export type AsoKeywordSnapshot = {
  id: string;
  date: string;
  keyword: string;
  country: string;
  source: "respectaso";
  popularityScore: number;
  difficultyScore: number;
  opportunityScore: number;
  difficultyLabel?: string;
  classification?: AsoClassification | string;
  competitorCount?: number;
  rawJson?: unknown;
  observedAt: string;
  createdAt: string;
};

export type AsoAppRankSnapshot = {
  id: string;
  date: string;
  keyword: string;
  country: string;
  source: "respectaso";
  projectId?: string;
  appId?: number;
  appRank: number | null;
  rawJson?: unknown;
  observedAt: string;
  createdAt: string;
};

export type AscMetadataKind = "pull" | "push";

export type AscMetadataSnapshot = {
  id: string;
  projectId: string;
  locale: string;
  kind: AscMetadataKind;
  name?: string;
  subtitle?: string;
  keywords?: string;
  description?: string;
  promotionalText?: string;
  whatsNew?: string;
  versionState?: string;
  rawJson?: unknown;
  createdAt: string;
};

export type AscExperimentElementType = "appIcon" | "screenshot" | "appPreview";

export type AscExperiment = {
  id: string;
  projectId: string;
  ascExperimentId: string;
  name: string;
  state: string;
  elementType?: AscExperimentElementType | string;
  rawJson?: unknown;
  createdAt: string;
};

export type AscExperimentTreatment = {
  id: string;
  experimentId: string;
  ascTreatmentId: string;
  name: string;
  state?: string;
  rawJson?: unknown;
  createdAt: string;
};

export type AdmobMediationMetric = {
  id: string;
  projectId: string;
  date: string;
  adSourceId?: string;
  adSourceName: string;
  format?: string;
  adRequests?: number;
  matchedRequests?: number;
  matchRate?: number;
  impressions?: number;
  clicks?: number;
  estimatedEarnings?: number;
  observedEcpm?: number;
  currency?: string;
  rawJson?: unknown;
  createdAt: string;
};

export type PlayVitalsMetric = {
  id: string;
  projectId: string;
  date: string;
  crashRate?: number;
  anrRate?: number;
  rawJson?: unknown;
  createdAt: string;
};

export type PlayInstallStat = {
  id: string;
  projectId: string;
  date: string;
  installs?: number;
  uninstalls?: number;
  activeDeviceInstalls?: number;
  rawJson?: unknown;
  createdAt: string;
};

export type AscAnalyticsMetric = {
  id: string;
  projectId: string;
  date: string;
  downloads?: number;
  retentionDay1?: number;
  retentionDay7?: number;
  retentionDay28?: number;
  rawJson?: unknown;
  createdAt: string;
};

export type AppReview = {
  id: string;
  projectId: string;
  reviewId: string;
  date: string;
  rating: number;
  text?: string;
  language?: string;
  appVersionName?: string;
  thumbsUp: number;
  rawJson?: unknown;
  createdAt: string;
};

export type PageMetric = {
  id: string;
  projectId: string;
  date: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  rawJson?: unknown;
};

export type GscDimension = "device" | "country" | "searchAppearance";

export type GscDimensionBreakdown = {
  id: string;
  projectId: string;
  rangeStart: string;
  rangeEnd: string;
  dimension: GscDimension;
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  rawJson?: unknown;
  createdAt: string;
};

export type GscSitemap = {
  id: string;
  projectId: string;
  path: string;
  type?: string;
  lastSubmitted?: string;
  isPending: boolean;
  isSitemapsIndex: boolean;
  warnings: number;
  errors: number;
  rawJson?: unknown;
  createdAt: string;
};

export type GscIndexIssueCode =
  | "indexed"
  | "blocked_by_robots"
  | "blocked_by_noindex"
  | "not_found"
  | "soft_404"
  | "server_error"
  | "access_denied"
  | "redirect_error"
  | "crawled_not_indexed"
  | "discovered_not_indexed"
  | "duplicate_canonical"
  | "redirected"
  | "not_indexed"
  | "inspection_error";

export type GscIndexInspection = {
  id: string;
  projectId?: string;
  siteUrl: string;
  url: string;
  inspectionDate: string;
  inspectedAt: string;
  discoveredFrom: string[];
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  pageFetchState?: string;
  googleCanonical?: string;
  userCanonical?: string;
  lastCrawlTime?: string;
  crawledAs?: string;
  inspectionResultLink?: string;
  issueCode: GscIndexIssueCode;
  severity: "none" | "low" | "medium" | "high";
  rawJson?: unknown;
};

export type OpportunityType =
  | "low_ctr_query"
  | "striking_distance_query"
  | "declining_page"
  | "growing_page"
  | "analytics_spike"
  | "page_two_query"
  | "zero_click_query"
  | "query_cannibalization";

export type Opportunity = {
  id: string;
  projectId: string;
  type: OpportunityType;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  score: number;
  status: "open" | "ignored" | "done";
  detectedAt: string;
  rawJson?: unknown;
};

export type ConnectorSource =
  | SourceType
  | "gsc_index"
  | "asc_metadata"
  | "asc_experiments"
  | "app_discovery"
  | "all";

export type ConnectorRun = {
  id: string;
  source: ConnectorSource;
  projectId?: string;
  status: "success" | "failed" | "skipped";
  startedAt: string;
  finishedAt: string;
  errorMessage?: string;
  stats?: Record<string, unknown>;
};

export type AppData = {
  projects: Project[];
  metricSnapshots: MetricSnapshot[];
  searchQueries: SearchQueryMetric[];
  pageMetrics: PageMetric[];
  opportunities: Opportunity[];
  connectorRuns: ConnectorRun[];
  appReviews: AppReview[];
  appKeywords: AppKeywordMetric[];
  asoKeywordSnapshots: AsoKeywordSnapshot[];
  asoAppRankSnapshots: AsoAppRankSnapshot[];
  gscDimensionBreakdowns: GscDimensionBreakdown[];
  gscSitemaps: GscSitemap[];
  gscIndexInspections: GscIndexInspection[];
  admobMediationMetrics: AdmobMediationMetric[];
  ascMetadataSnapshots: AscMetadataSnapshot[];
  ascExperiments: AscExperiment[];
  ascExperimentTreatments: AscExperimentTreatment[];
  playVitalsMetrics: PlayVitalsMetric[];
  playInstallStats: PlayInstallStat[];
  ascAnalyticsMetrics: AscAnalyticsMetric[];
};

export type SyncOptions = {
  source?: SourceType;
  backfillDays?: number;
};

export type SyncResult = {
  source: SourceType;
  projectId: string;
  status: "success" | "failed" | "skipped";
  message: string;
  inserted: {
    snapshots: number;
    queries: number;
    pages: number;
    reviews?: number;
    keywords?: number;
  };
};
