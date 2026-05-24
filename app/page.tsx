import { buildOpportunities, summarizeProject } from "@/lib/insights";
import { readData, writeData } from "@/lib/store";

export const dynamic = "force-dynamic";

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
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">OpenFindability v0.1</p>
          <h1>Priorita' operative per SEO e analytics dei tuoi progetti.</h1>
          <p className="lead">
            Versione base self-hosted: progetti, dati demo, sync manuale Google Search Console e Umami, opportunita'
            SEO calcolate dai dati importati.
          </p>
        </div>
        <div className="actions">
          <a className="button" href="/api/doctor">
            Doctor
          </a>
          <a className="button primary" href="/api/sync">
            Sync manuale
          </a>
        </div>
      </header>

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="metric-label">Progetti</span>
          <strong className="metric-value">{data.projects.length}</strong>
        </div>
        <div className="panel span-4 metric">
          <span className="metric-label">Click GSC</span>
          <strong className="metric-value">{totals.clicks.toLocaleString("it-IT")}</strong>
        </div>
        <div className="panel span-4 metric">
          <span className="metric-label">Visitatori Umami</span>
          <strong className="metric-value">{totals.visitors.toLocaleString("it-IT")}</strong>
        </div>

        <div className="panel span-8">
          <div className="section-title">
            <h2>Priorita' della settimana</h2>
            <span className="badge">{totals.opportunities} aperte</span>
          </div>
          <div className="list">
            {topOpportunities.length === 0 ? (
              <p className="muted">
                Nessuna opportunita' ancora. Esegui <span className="code">pnpm seed:demo</span> oppure configura GSC e
                Umami e poi lancia <span className="code">pnpm sync</span>.
              </p>
            ) : (
              topOpportunities.map((opportunity) => {
                const project = data.projects.find((item) => item.id === opportunity.projectId);
                return (
                  <article className="row" key={opportunity.id}>
                    <div className="row-head">
                      <strong>{opportunity.title}</strong>
                      <span className={`badge ${opportunity.severity}`}>{opportunity.severity}</span>
                    </div>
                    <p className="muted">{opportunity.description}</p>
                    <span className="code">{project?.name ?? opportunity.projectId}</span>
                  </article>
                );
              })
            )}
          </div>
        </div>

        <div className="panel span-4">
          <div className="section-title">
            <h2>Ultimi sync</h2>
          </div>
          <div className="list">
            {lastRuns.length === 0 ? (
              <p className="muted">Nessun sync registrato.</p>
            ) : (
              lastRuns.map((run) => (
                <div className="row" key={run.id}>
                  <div className="row-head">
                    <strong>{run.source}</strong>
                    <span className={`badge ${run.status === "failed" ? "high" : "low"}`}>{run.status}</span>
                  </div>
                  <span className="code">{new Date(run.finishedAt).toLocaleString("it-IT")}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel span-12">
          <div className="section-title">
            <h2>Progetti</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Click</th>
                <th>Impression</th>
                <th>Visitatori</th>
                <th>Opportunita'</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((project) => {
                const summary = summarizeProject(data, project.id);
                return (
                  <tr key={project.id}>
                    <td>
                      <strong>{project.name}</strong>
                      <div className="muted">{project.websiteUrl}</div>
                    </td>
                    <td>{project.type}</td>
                    <td>{summary.clicks.toLocaleString("it-IT")}</td>
                    <td>{summary.impressions.toLocaleString("it-IT")}</td>
                    <td>{summary.visitors.toLocaleString("it-IT")}</td>
                    <td>{summary.opportunities}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
