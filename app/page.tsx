import {
  buildOpportunities,
  getAdmobRevenueTrend,
  getRevenueCatMrrTrend,
  summarizeMonetization,
  summarizeProject,
} from "@/lib/insights";
import { readData, writeData } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdmobRevenueChart } from "@/components/charts/admob-revenue-chart";
import { RevenueCatMrrChart } from "@/components/charts/revenuecat-mrr-chart";

export const dynamic = "force-dynamic";

const severityVariant = {
  high: "destructive",
  medium: "warning",
  low: "success",
} as const;

export default async function HomePage() {
  const data = await readData();
  if (data.opportunities.length === 0 && (data.searchQueries.length > 0 || data.pageMetrics.length > 0)) {
    data.opportunities = buildOpportunities(data);
    await writeData(data);
  }

  const totals = data.projects.reduce(
    (acc, project) => {
      const summary = summarizeProject(data, project.id);
      acc.clicks += summary.clicks;
      acc.impressions += summary.impressions;
      acc.visitors += summary.visitors;
      acc.opportunities += summary.opportunities;
      return acc;
    },
    { clicks: 0, impressions: 0, visitors: 0, opportunities: 0 },
  );

  const topOpportunities = data.opportunities.slice(0, 8);
  const lastRuns = data.connectorRuns.slice(-6).reverse();

  const monetization = summarizeMonetization(data);
  const hasAdmobData = data.metricSnapshots.some((metric) => metric.source === "admob");
  const hasRevenueCatData = data.metricSnapshots.some((metric) => metric.source === "revenuecat");
  const admobRevenueTrend = getAdmobRevenueTrend(data);
  const revenueCatMrrTrend = getRevenueCatMrrTrend(data);
  const adRevenueTrendPercent = trendPercent(monetization.adRevenuePreviousMonth, monetization.adRevenueMonth);
  const mrrTrendPercent = trendPercent(
    revenueCatMrrTrend.at(0)?.value,
    revenueCatMrrTrend.at(-1)?.value,
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-col items-start justify-between gap-6 sm:flex-row">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">OpenFindability v0.1</p>
          <h1 className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">
            Priorita&apos; operative per SEO e analytics dei tuoi progetti.
          </h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            Versione base self-hosted: progetti, dati demo, sync manuale Google Search Console e Umami, opportunita&apos;
            SEO calcolate dai dati importati.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href="/api/doctor">Doctor</a>
          </Button>
          <Button asChild>
            <a href="/api/sync">Sync manuale</a>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="grid gap-1.5">
            <span className="text-sm text-muted-foreground">Progetti</span>
            <strong className="text-3xl font-extrabold">{data.projects.length}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-1.5">
            <span className="text-sm text-muted-foreground">Click GSC</span>
            <strong className="text-3xl font-extrabold">{totals.clicks.toLocaleString("it-IT")}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-1.5">
            <span className="text-sm text-muted-foreground">Visitatori Umami</span>
            <strong className="text-3xl font-extrabold">{totals.visitors.toLocaleString("it-IT")}</strong>
          </CardContent>
        </Card>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>AdMob</CardTitle>
            {hasAdmobData && adRevenueTrendPercent !== undefined && (
              <Badge variant={adRevenueTrendPercent >= 0 ? "success" : "destructive"}>
                {formatTrend(adRevenueTrendPercent)} vs mese scorso
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {!hasAdmobData ? (
              <p className="text-sm text-muted-foreground">
                Nessun dato AdMob ancora. Configura <span className="font-mono text-xs">admobAppId</span> sul progetto
                e le variabili <span className="font-mono text-xs">ADMOB_*</span> nel <span className="font-mono text-xs">.env</span>, poi esegui{" "}
                <span className="font-mono text-xs">pnpm run sync:admob</span>.
              </p>
            ) : (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-sm text-muted-foreground">Ieri</span>
                    <strong className="block text-2xl font-extrabold">
                      {formatCurrency(monetization.adRevenueYesterday, monetization.adCurrency)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Questo mese</span>
                    <strong className="block text-2xl font-extrabold">
                      {formatCurrency(monetization.adRevenueMonth, monetization.adCurrency)}
                    </strong>
                  </div>
                </div>
                {admobRevenueTrend.length > 1 && (
                  <AdmobRevenueChart data={admobRevenueTrend} currency={monetization.adCurrency} />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>RevenueCat</CardTitle>
            {hasRevenueCatData && mrrTrendPercent !== undefined && (
              <Badge variant={mrrTrendPercent >= 0 ? "success" : "destructive"}>
                {formatTrend(mrrTrendPercent)} MRR (30gg)
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {!hasRevenueCatData ? (
              <p className="text-sm text-muted-foreground">
                Nessun dato RevenueCat ancora. Configura <span className="font-mono text-xs">revenueCatProjectId</span>{" "}
                sul progetto e <span className="font-mono text-xs">REVENUECAT_API_KEY</span> nel{" "}
                <span className="font-mono text-xs">.env</span>, poi esegui{" "}
                <span className="font-mono text-xs">pnpm run sync:revenuecat</span>.
              </p>
            ) : (
              <div className="grid gap-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <span className="text-sm text-muted-foreground">MRR</span>
                    <strong className="block text-2xl font-extrabold">
                      {formatCurrency(monetization.mrr, monetization.subscriptionCurrency)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Abbonati attivi</span>
                    <strong className="block text-2xl font-extrabold">
                      {monetization.activeSubscribers.toLocaleString("it-IT")}
                    </strong>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Ricavi ultimi 28 giorni</span>
                    <strong className="block text-2xl font-extrabold">
                      {formatCurrency(monetization.subscriptionRevenue28Days, monetization.subscriptionCurrency)}
                    </strong>
                  </div>
                </div>
                {revenueCatMrrTrend.length > 1 && (
                  <RevenueCatMrrChart data={revenueCatMrrTrend} currency={monetization.subscriptionCurrency} />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Priorita&apos; della settimana</CardTitle>
            <Badge>{totals.opportunities} aperte</Badge>
          </CardHeader>
          <CardContent className="grid gap-3">
            {topOpportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuna opportunita&apos; ancora. Esegui <span className="font-mono text-xs">pnpm seed:demo</span>{" "}
                oppure configura GSC e Umami e poi lancia <span className="font-mono text-xs">pnpm sync</span>.
              </p>
            ) : (
              topOpportunities.map((opportunity, index) => {
                const project = data.projects.find((item) => item.id === opportunity.projectId);
                return (
                  <article key={opportunity.id} className="grid gap-1.5">
                    {index > 0 && <Separator className="mb-1.5" />}
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm">{opportunity.title}</strong>
                      <Badge variant={severityVariant[opportunity.severity]}>{opportunity.severity}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{opportunity.description}</p>
                    <span className="font-mono text-xs text-muted-foreground">
                      {project?.name ?? opportunity.projectId}
                    </span>
                  </article>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ultimi sync</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {lastRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun sync registrato.</p>
            ) : (
              lastRuns.map((run, index) => (
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
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Progetti</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Click</TableHead>
                  <TableHead>Impression</TableHead>
                  <TableHead>Visitatori</TableHead>
                  <TableHead>Ricavi Ads</TableHead>
                  <TableHead>MRR</TableHead>
                  <TableHead>Opportunita&apos;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.projects.map((project) => {
                  const summary = summarizeProject(data, project.id);
                  return (
                    <TableRow key={project.id}>
                      <TableCell>
                        <strong>{project.name}</strong>
                        <div className="text-sm text-muted-foreground">{project.websiteUrl}</div>
                      </TableCell>
                      <TableCell>{project.type}</TableCell>
                      <TableCell>{summary.clicks.toLocaleString("it-IT")}</TableCell>
                      <TableCell>{summary.impressions.toLocaleString("it-IT")}</TableCell>
                      <TableCell>{summary.visitors.toLocaleString("it-IT")}</TableCell>
                      <TableCell>{formatCurrency(summary.adRevenue, summary.adCurrency)}</TableCell>
                      <TableCell>{formatCurrency(summary.mrr ?? 0, summary.subscriptionCurrency)}</TableCell>
                      <TableCell>{summary.opportunities}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </main>
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

function trendPercent(previous: number | undefined, current: number | undefined) {
  if (previous === undefined || current === undefined || previous <= 0) {
    return undefined;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function formatTrend(percent: number) {
  const sign = percent >= 0 ? "+" : "";
  return `${sign}${percent.toLocaleString("it-IT")}%`;
}
