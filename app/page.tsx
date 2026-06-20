import { buildOpportunities, summarizeProject } from "@/lib/insights";
import { readData, writeData } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
