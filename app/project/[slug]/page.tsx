import Link from "next/link";
import { notFound } from "next/navigation";

import { getProjectMetricTrend, summarizeProject } from "@/lib/insights";
import { aggregatePagesByUrl, aggregateQueriesByText } from "@/lib/report";
import { readData } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdmobRevenueChart } from "@/components/charts/admob-revenue-chart";
import { RevenueCatMrrChart } from "@/components/charts/revenuecat-mrr-chart";
import { MetricTrendChart } from "@/components/charts/metric-trend-chart";

export const dynamic = "force-dynamic";

const severityVariant = {
  high: "destructive",
  medium: "warning",
  low: "success",
} as const;

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await readData();
  const project = data.projects.find((item) => item.slug === slug);

  if (!project) {
    notFound();
  }

  const summary = summarizeProject(data, project.id);

  const gscSnapshots = data.metricSnapshots.filter((m) => m.projectId === project.id && m.source === "gsc");
  const umamiSnapshots = data.metricSnapshots.filter((m) => m.projectId === project.id && m.source === "umami");
  const admobSnapshots = data.metricSnapshots.filter((m) => m.projectId === project.id && m.source === "admob");
  const revenuecatSnapshots = data.metricSnapshots.filter((m) => m.projectId === project.id && m.source === "revenuecat");
  const playConsoleSnapshots = data.metricSnapshots.filter(
    (m) => m.projectId === project.id && m.source === "play_console",
  );
  const queries = data.searchQueries.filter((row) => row.projectId === project.id);
  const pages = data.pageMetrics.filter((row) => row.projectId === project.id);
  const reviews = data.appReviews
    .filter((row) => row.projectId === project.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const keywords = data.appKeywords.filter((row) => row.projectId === project.id);
  const opportunities = data.opportunities.filter((row) => row.projectId === project.id).slice(0, 8);
  const connectorRuns = data.connectorRuns
    .filter((run) => run.projectId === project.id)
    .slice(-6)
    .reverse();

  const clicksTrend = getProjectMetricTrend(data, project.id, "gsc", "clicks");
  const visitorsTrend = getProjectMetricTrend(data, project.id, "umami", "visitors");
  const admobTrend = getProjectMetricTrend(data, project.id, "admob", "revenue");
  const mrrTrend = getProjectMetricTrend(data, project.id, "revenuecat", "mrr");

  const topPages = aggregatePagesByUrl(pages).slice(0, 10);
  const topQueries = aggregateQueriesByText(queries).slice(0, 10);

  const latestPlayConsole = playConsoleSnapshots.reduce(
    (latest, current) => (!latest || current.date > latest.date ? current : latest),
    playConsoleSnapshots[0],
  );

  const latestKeywordDate = keywords.reduce<string | undefined>(
    (latest, row) => (!latest || row.date > latest ? row.date : latest),
    undefined,
  );
  const latestKeywords = keywords
    .filter((row) => row.date === latestKeywordDate)
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Tutti i progetti
      </Link>

      <header className="mt-2 mb-8 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">{project.type}</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{project.name}</h1>
          {project.websiteUrl && (
            <a
              href={project.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-sm text-muted-foreground hover:underline"
            >
              {project.websiteUrl}
            </a>
          )}
        </div>
        <Badge>{summary.opportunities} opportunita&apos; aperte</Badge>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {gscSnapshots.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Google Search Console</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-sm text-muted-foreground">Click</span>
                  <strong className="block text-2xl font-extrabold">{summary.clicks.toLocaleString("it-IT")}</strong>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Impression</span>
                  <strong className="block text-2xl font-extrabold">
                    {summary.impressions.toLocaleString("it-IT")}
                  </strong>
                </div>
              </div>
              {clicksTrend.length > 1 && <MetricTrendChart data={clicksTrend} label="Click" color="var(--chart-1)" />}
            </CardContent>
          </Card>
        )}

        {umamiSnapshots.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Umami</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-sm text-muted-foreground">Visitatori</span>
                  <strong className="block text-2xl font-extrabold">
                    {summary.visitors.toLocaleString("it-IT")}
                  </strong>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Pageview</span>
                  <strong className="block text-2xl font-extrabold">
                    {summary.pageviews.toLocaleString("it-IT")}
                  </strong>
                </div>
              </div>
              {visitorsTrend.length > 1 && (
                <MetricTrendChart data={visitorsTrend} label="Visitatori" color="var(--chart-3)" />
              )}
            </CardContent>
          </Card>
        )}

        {admobSnapshots.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>AdMob</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Ricavi totali</span>
                <strong className="block text-2xl font-extrabold">
                  {formatCurrency(summary.adRevenue, summary.adCurrency)}
                </strong>
              </div>
              {admobTrend.length > 1 && <AdmobRevenueChart data={admobTrend} currency={summary.adCurrency} />}
            </CardContent>
          </Card>
        )}

        {revenuecatSnapshots.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>RevenueCat</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="text-sm text-muted-foreground">MRR</span>
                  <strong className="block text-2xl font-extrabold">
                    {formatCurrency(summary.mrr ?? 0, summary.subscriptionCurrency)}
                  </strong>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Abbonati attivi</span>
                  <strong className="block text-2xl font-extrabold">
                    {(summary.activeSubscribers ?? 0).toLocaleString("it-IT")}
                  </strong>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Ricavi 28gg</span>
                  <strong className="block text-2xl font-extrabold">
                    {formatCurrency(summary.subscriptionRevenue28Days ?? 0, summary.subscriptionCurrency)}
                  </strong>
                </div>
              </div>
              {mrrTrend.length > 1 && <RevenueCatMrrChart data={mrrTrend} currency={summary.subscriptionCurrency} />}
            </CardContent>
          </Card>
        )}

        {topPages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pagine principali (GSC)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pagina</TableHead>
                    <TableHead>Click</TableHead>
                    <TableHead>Impression</TableHead>
                    <TableHead>CTR</TableHead>
                    <TableHead>Pos. media</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPages.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="max-w-[260px] truncate font-mono text-xs">{row.key}</TableCell>
                      <TableCell>{row.clicks.toLocaleString("it-IT")}</TableCell>
                      <TableCell>{row.impressions.toLocaleString("it-IT")}</TableCell>
                      <TableCell>{(row.ctr * 100).toFixed(1)}%</TableCell>
                      <TableCell>{row.avgPosition.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {topQueries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Query principali (GSC)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead>Click</TableHead>
                    <TableHead>Impression</TableHead>
                    <TableHead>CTR</TableHead>
                    <TableHead>Pos. media</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topQueries.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="max-w-[260px] truncate">{row.key}</TableCell>
                      <TableCell>{row.clicks.toLocaleString("it-IT")}</TableCell>
                      <TableCell>{row.impressions.toLocaleString("it-IT")}</TableCell>
                      <TableCell>{(row.ctr * 100).toFixed(1)}%</TableCell>
                      <TableCell>{row.avgPosition.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {latestKeywords.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>ASO - keyword principali</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead>Paese</TableHead>
                    <TableHead>Popolarita&apos;</TableHead>
                    <TableHead>Difficolta&apos;</TableHead>
                    <TableHead>Opportunita&apos;</TableHead>
                    <TableHead>Rank</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestKeywords.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.keyword}</TableCell>
                      <TableCell>{row.country.toUpperCase()}</TableCell>
                      <TableCell>{row.popularityScore}</TableCell>
                      <TableCell>{row.difficultyLabel ?? row.difficultyScore}</TableCell>
                      <TableCell>{row.opportunityScore}</TableCell>
                      <TableCell>{row.appRank == null ? "-" : `#${row.appRank}`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {(latestPlayConsole || reviews.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle>Play Store</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {latestPlayConsole && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-sm text-muted-foreground">Rating medio</span>
                    <strong className="block text-2xl font-extrabold">
                      {(latestPlayConsole.avgRating ?? 0).toFixed(1)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Recensioni totali</span>
                    <strong className="block text-2xl font-extrabold">
                      {(latestPlayConsole.totalReviews ?? 0).toLocaleString("it-IT")}
                    </strong>
                  </div>
                </div>
              )}
              {reviews.length > 0 && (
                <div className="grid gap-3">
                  {reviews.slice(0, 5).map((review, index) => (
                    <div key={review.id} className="grid gap-1">
                      {index > 0 && <Separator className="mb-1" />}
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant={review.rating >= 4 ? "success" : review.rating <= 2 ? "destructive" : "warning"}>
                          {review.rating}/5
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">{review.date}</span>
                      </div>
                      {review.text && <p className="text-sm text-muted-foreground">{review.text}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {opportunities.length > 0 && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Opportunita&apos;</CardTitle>
              <Badge>{summary.opportunities} aperte</Badge>
            </CardHeader>
            <CardContent className="grid gap-3">
              {opportunities.map((opportunity, index) => (
                <article key={opportunity.id} className="grid gap-1.5">
                  {index > 0 && <Separator className="mb-1.5" />}
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm">{opportunity.title}</strong>
                    <Badge variant={severityVariant[opportunity.severity]}>{opportunity.severity}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{opportunity.description}</p>
                </article>
              ))}
            </CardContent>
          </Card>
        )}

        {connectorRuns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Ultimi sync</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {connectorRuns.map((run, index) => (
                <div key={run.id} className="grid gap-1.5">
                  {index > 0 && <Separator className="mb-1.5" />}
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm">{run.source}</strong>
                    <Badge variant={run.status === "failed" ? "destructive" : "success"}>{run.status}</Badge>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(run.finishedAt).toLocaleString("it-IT")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function formatCurrency(amount: number, currency?: string) {
  if (!currency) {
    return amount.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  try {
    return amount.toLocaleString("it-IT", { style: "currency", currency });
  } catch {
    return `${amount.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}
