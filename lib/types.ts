export type SourceType = "gsc" | "umami";

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
  };
};
