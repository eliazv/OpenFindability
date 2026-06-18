export type SourceType = "gsc" | "umami" | "play_console" | "aso";

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

export type ConnectorRun = {
  id: string;
  source: SourceType | "all";
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
