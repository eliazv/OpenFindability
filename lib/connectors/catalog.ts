import type { SourceType } from "@/lib/types";

export type ConnectorDescriptor = {
  label: string;
  category: "seo" | "web_analytics" | "mobile" | "monetization" | "aso";
  /** Native provider time grain; never infer daily earnings from a rolling snapshot. */
  grain: "daily" | "rolling_snapshot" | "events" | "mixed";
  /** Typical natural delay before a provider makes its reporting data available. */
  typicalLagDays: number;
  /** How long without a successful sync before the Doctor should flag it. */
  staleAfterDays: number;
  /** Read-only analytic import; separate write workflows are not automated by sync. */
  syncSafety: "read_only";
  docs: string;
};

export const CONNECTOR_CATALOG = {
  ga4_landing: { label: "GA4 landing conversions", category: "web_analytics", grain: "daily", typicalLagDays: 2, staleAfterDays: 4, syncSafety: "read_only", docs: "docs/guide/conversions-performance-interventions.md" },
  pagespeed: { label: "PageSpeed Lighthouse", category: "seo", grain: "mixed", typicalLagDays: 0, staleAfterDays: 30, syncSafety: "read_only", docs: "docs/guide/conversions-performance-interventions.md" },
  crux: { label: "CrUX field experience", category: "seo", grain: "rolling_snapshot", typicalLagDays: 2, staleAfterDays: 30, syncSafety: "read_only", docs: "docs/guide/conversions-performance-interventions.md" },
  bing_webmaster: {
    label: "Bing Webmaster", category: "seo", grain: "mixed", typicalLagDays: 3,
    staleAfterDays: 7, syncSafety: "read_only", docs: "docs/guide/seo-geo-warehouse.md",
  },
  cloudflare_ai: {
    label: "Cloudflare AI crawlers", category: "seo", grain: "mixed", typicalLagDays: 0,
    staleAfterDays: 1, syncSafety: "read_only", docs: "docs/guide/seo-geo-warehouse.md",
  },
  clarity: {
    label: "Microsoft Clarity", category: "web_analytics", grain: "rolling_snapshot", typicalLagDays: 0,
    staleAfterDays: 1, syncSafety: "read_only", docs: "docs/guide/seo-geo-warehouse.md",
  },
  gsc: {
    label: "Google Search Console", category: "seo", grain: "daily",
    typicalLagDays: 2, staleAfterDays: 4, syncSafety: "read_only", docs: "docs/guide/gsc-google-sheets-appscript-integration.md",
  },
  ga4: {
    label: "Google Analytics 4", category: "web_analytics", grain: "daily",
    typicalLagDays: 2, staleAfterDays: 4, syncSafety: "read_only", docs: "docs/guide/ga4-setup.md",
  },
  umami: {
    label: "Umami", category: "web_analytics", grain: "daily",
    typicalLagDays: 1, staleAfterDays: 3, syncSafety: "read_only", docs: "docs/guide/struttura-progetto.md",
  },
  play_console: {
    label: "Google Play reviews", category: "mobile", grain: "events",
    typicalLagDays: 1, staleAfterDays: 7, syncSafety: "read_only", docs: "docs/guide/operating-playbook.md",
  },
  aso: {
    label: "RespectASO", category: "aso", grain: "events",
    typicalLagDays: 1, staleAfterDays: 14, syncSafety: "read_only", docs: "docs/guide/aso-workflow.md",
  },
  revenuecat: {
    label: "RevenueCat", category: "monetization", grain: "rolling_snapshot",
    typicalLagDays: 1, staleAfterDays: 3, syncSafety: "read_only", docs: "docs/guide/monetization-workflow.md",
  },
  admob: {
    label: "AdMob", category: "monetization", grain: "daily",
    typicalLagDays: 2, staleAfterDays: 4, syncSafety: "read_only", docs: "docs/guide/admob-setup.md",
  },
  adsense: {
    label: "AdSense", category: "monetization", grain: "daily",
    typicalLagDays: 2, staleAfterDays: 4, syncSafety: "read_only", docs: "docs/guide/adsense-setup.md",
  },
  play_vitals: {
    label: "Google Play vitals", category: "mobile", grain: "daily",
    typicalLagDays: 2, staleAfterDays: 5, syncSafety: "read_only", docs: "docs/guide/operating-playbook.md",
  },
  play_stats: {
    label: "Google Play install exports", category: "mobile", grain: "daily",
    typicalLagDays: 3, staleAfterDays: 7, syncSafety: "read_only", docs: "docs/guide/operating-playbook.md",
  },
  asc_analytics: {
    label: "App Store Connect analytics", category: "mobile", grain: "mixed",
    typicalLagDays: 2, staleAfterDays: 5, syncSafety: "read_only", docs: "docs/guide/appstoreconnect-workflow.md",
  },
} as const satisfies Record<SourceType, ConnectorDescriptor>;

export function sourceLabel(source: SourceType): string {
  return CONNECTOR_CATALOG[source].label;
}
