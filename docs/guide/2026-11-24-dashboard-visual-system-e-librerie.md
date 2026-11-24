# OpenFindability — sistema visuale, componenti analytics e piano di refactor

Data: 24 novembre 2026  
Stato: proposta tecnica, non implementata. Complemento a [audit e riprogettazione](2026-11-24-dashboard-audit-e-riprogettazione.md).
Baseline: master `4d5ab68829a9c4146294d5a27ab6ca2861a846a8`. Analisi statica; nessun browser, DB locale, benchmark o chiamata provider. Tutte le cifre negli esempi sono sintetiche. Non si pubblicano dati di progetti reali.

## 1. Decisione di prodotto

OpenFindability deve essere una console di intelligence operativa multi-progetto, non una replica di GA4 né una collezione di grafici per connettore. Percorso principale: cosa è cambiato → dove → perché potrebbe essere successo → quale intervento verificare → quale esito ha avuto. Per la home preferire densità leggibile e confronto a grandi card decorative. Mantenere architettura, palette neutra calda, accento verde, shadcn Radix, Next.js/SQLite, sync manuale e Store Studio indipendente. Non introdurre account, servizi cloud, scheduler o un secondo design system.

Ordine delle domande:
1. Quali progetti richiedono attenzione? (portfolio)
2. Quali indicatori cambiano? (overview)
3. Quali pagine/query/app/canali spiegano la variazione? (explorer)
4. Cosa conviene fare? (opportunità)
5. Cosa abbiamo fatto e quali evidenze abbiamo? (interventi)
6. Quanto sono affidabili i numeri? (centro dati e metadati contestuali)

## 2. Nuove evidenze nel codice

| File | Evidenza statica | Azione |
|---|---|---|
| [package.json](../../package.json) | Recharts ^2.15.4, Tailwind ^4.2.2, React/Next latest, primitive Radix, nessun TanStack Table | Baseline compatibile da fissare via lockfile; introdurre una tabella headless, migrazione chart isolata |
| [components.json](../../components.json) | new-york, RSC, alias, iconLibrary radix, base zinc | Non reinizializzare shadcn; preservare token personalizzati, uniformare icone con lucide già presente |
| [app/globals.css](../../app/globals.css) | token OKLCH e cinque chart colors, nessun blocco dark visibile | Aggiungere token semantici per confronto, missing, warning; dark dopo verifica del contrasto e preferenza |
| [metric-trend-chart.tsx](../../components/charts/metric-trend-chart.tsx) | area natural, 200px, nessun asse Y, gradient id dal titolo, formatter funzione | Consolidare primitive; useId; format descriptor serializzabile invece di callback da RSC; scala, unità, punti mancanti |
| [admob-revenue-chart.tsx](../../components/charts/admob-revenue-chart.tsx) e [revenuecat-mrr-chart.tsx](../../components/charts/revenuecat-mrr-chart.tsx) | struttura duplicata, gradient id fissi, stessa interpolazione per flusso e gauge | Bar/line per flusso, step solo per snapshot validi; ID univoci; evitare carry-forward implicito |
| [chart.tsx](../../components/ui/chart.tsx) | ResponsiveContainer debounce=2000; fallback tooltip `item.value &&`; rimozione outline su più elementi | Profilare resize, partire da 80–150 ms o default; zero visibile; verificare focus/tastiera e tooltip |
| [lib/insights.ts](../../lib/insights.ts) | TrendPoint = {date,value:number}; serie con giorni presenti, non esplicito null | Nuovo DTO con null e calendario continuo; non modificare contratto CLI/MCP senza necessità |
| [home](../../app/page.tsx) / [progetto](../../app/project/[slug]/page.tsx) | 373/527 righe nel commit analizzato, summary e formattazione nelle pagine, sezioni e shortlist | Componenti di dominio e lettori mirati; non solo spostare il file gigante |
| [layout](../../app/layout.tsx) | readData completo e Project al client | P0: readProjects + proiezione non sensibile; nessuna chiave o rawJson nel payload |

La scala e i gap sono un problema di interpretazione, non solo estetico. Su una XAxis categoriale, date non consecutive possono apparire equidistanti; creare una griglia temporale esplicita per serie giornaliere (oppure asse numerico timestamp con tick coerenti). Non riempire indiscriminatamente di zero. Nei tooltip usare data completa (anno incluso se cambia), valuta, unità e dato non disponibile; verificare i custom formatter già presenti. Le anomalie di resize e accessibilità sono rischi, non problemi riprodotti.

## 3. Linguaggio visivo

- Shell desktop: sidebar 248–264 px, header 48–56 px, breadcrumb, project switcher, periodo e sync contestuale. In modalità compatta icone specifiche e tooltip. Mobile drawer; tab di dominio scorrevoli con nome visibile.
- Desktop 12 colonne, gap 16–24 px, margine 24–32 px; su 1024 px due colonne KPI, su 390 px una/due secondo spazio; evitare overflow dell'intera pagina. Contenuto massimo solo dove migliora la leggibilità, tabelle larghe.
- Titoli pagina 24–28, titoli card 14–16, KPI 28–32, numeri tabulari. Card neutre, bordo sottile, raggio esistente 8 px; evitare ombre pesanti, gradienti e badge ovunque. Tabelle compatte con header persistente se utile, righe circa 40–48 px.
- Colore serie stabile per significato all'interno di una vista, precedente grigio tratteggiato, selezione accento. Positivo/negativo dipendono dalla metrica (posizione, crash e LCP migliorano scendendo). Cambiamento neutro se interpretazione ambigua. Rosso/verde solo con segno, testo o icona. Palette categoriale distinguibile, max 5–6 categorie visibili + resto quando additivo. Nessuna decorazione che confonda serie e status.
- ChartFrame: titolo formulato come domanda, KPI principale facoltativo, sorgente/periodo/unità, legenda, menu dati (tabella, CSV), stato missing/stale, area plot 260–340 px in overview e 340–440 in detail. Mini 32–48 px in KPI/tabella, non interattiva se decorativa. Skeleton con altezza finale; un punto mostra dato singolo, non curva finta. Empty/error per singolo pannello, non tutta pagina.
- Dark mode opzionale P2 con token dark e toggle locale, niente nuovo tema globale in fase 1. WCAG 2.2 AA come obiettivo, focus, no hover-only, reduced motion, keyboard test, tabella equivalente e descrizione breve della tendenza. CSV protetto da formula injection sui campi testuali; nessuna esportazione raw/credenziali.

## 4. Schermate e interazioni

### Portfolio
```text
Panoramica                         [28 giorni ▾] [Confronta ▾] [Sync ▾]
2 fonti da verificare · copertura ...                           Centro dati
[Click GSC  Δ  ~~~] [Ricavi ads EUR  Δ ~~~] [MRR EUR  Δ ~~~] [Opportunità]
Progetti                 [Cerca] [Tutti | Web | App] [Colonne]
 WEB  Icona Nome      Click | Δ | trend | stato | azioni
 APP  Icona Nome      Download per store | MRR | Δ | stato | azioni
 ─────────────────────────────────────────────────────────────────────
 Priorità da verificare (max 5)           Variazioni per progetto (barre ±)
 Elemento / evidenza / score / azione     solo metrica e valuta omogenee
```
Rendere app e web due gruppi con colonne pertinenti o un filtro di dominio, non un totale artificiale. Opzioni overview: ultime variazioni, filtro attenzione, preferiti locali se davvero utili. Nessun ranking tra unità differenti. Global MRR totale solo con valuta e copertura valide; indicare quanti progetti inclusi. Nessuna duplicazione tra priorità e feed attività.

### Progetto
```text
[Icona] Progetto esempio / web            [Periodo] [Confronta] [Sync progetto]
Panoramica | Acquisizione | Store* | Ricavi | Salute | Opportunità | Interventi
[Click  Δ ~] [Impression Δ ~] [CTR Δ pp ~] [Posizione Δ ~]
[ Click | Impression | CTR | Posizione ]   Giornaliero / settimanale
                 ┌──────── serie corrente + precedente ────────┐
                 │                    ↑ intervento              │
                 └──────────────────────────────────────────────┘
 [Query con più crescita / calo]           [Pagine / dettaglio]
 [Evidenze e opportunità]                  [Salute e copertura]
```
App: download first-time ASC e Play utenti/eventi distinti; MRR, ads, rating/qualità a seconda delle fonti. Misto: tab Web/App o blocchi distinti. Metadati fonte sempre visibili. Il tab Store non appare su web puro se non applicabile.

### Explorer riutilizzabile
Toolbar sticky locale: periodo, confronto, fonte, dimensione supportata, ricerca, filtri attivi rimovibili, reset, export. Metric toggle sopra il grafico; selezionando una riga aprire Sheet laterale con trend della riga, metriche, evidenze, link e azioni. Se serve drill-down profondo, route dedicata con link condivisibile; back mantiene filtri e scroll dove fattibile. Non far dipendere navigazione da hover. Cross-filter chart → table solo con contratto disponibile, indicare filtro attivo e reset. Mai fingere una join query×pagina se il dataset contiene solo dimensioni separate.

Esempio URL (proposta): /project/demo/acquisition?from=2026-10-01&to=2026-10-28&compare=previous&source=gsc&view=queries&sort=clicks.desc&page=1. Validare searchParams con Zod, whitelist metriche/colonne e limiti pagina. Reset page su filtro/sort. Preferenze visive (densità, colonne) locali e versionate per vista; niente builder drag/drop prima di validare il bisogno. Ricerca globale Cmd/Ctrl+K P2 per progetti, strumenti e route (non query private indicizzate in un servizio esterno).

## 5. Atlante delle visualizzazioni per dominio

| Vista | Componente / encoding | Dati, vincoli e drill-down |
|---|---|---|
| GSC ricerca | KPI con spark; linea corrente/precedente; barre orizzontali delta click; tabella con mini barre | metricSnapshots, searchQueries, pageMetrics. CTR = click/impression; posizione ponderata impression; diff CTR in punti percentuali; non sommare query come totale sito |
| GSC opportunità | scatter X posizione (1 migliore), Y CTR, dimensione impression; filtri min impression/posizione | query aggregate daily, non attribuire causalità AI Overview. Tooltip query, valori, score; link dettaglio. Limite campione esplicito e tabella completa. Non disegnare una curva CTR attesa senza baseline |
| GSC segmenti | barre orizzontali device/paese, composizione se additiva | gscDimensionBreakdowns ha rangeStart/rangeEnd, non righe daily: mostra solo range disponibile, non sommare finestre sovrapposte; searchAppearance può sovrapporsi |
| GA4 / Umami | linea sessioni/pageview separate per fonte, bar list landing/canale, tabella key events | ga4LandingMetrics e snapshot; niente funnel senza eventi ordinati di stessa popolazione, no somma utenti tra fonti |
| Bing / Cloudflare / Clarity | trend solo quando grain day/hour, altrimenti card finestra e ranking | seoGeoObservations: windowStart/end, grain, scope, coverage. AI crawler non equivale a citazione, visita umana o conversione. Heatmap oraria solo con granularità coerente |
| Indicizzazione | stacked bar esiti univoci, coverage meter e tabella problemi | ultima ispezione per URL, denominatore URL ispezionati, non intero indice Google; sito non mappato visibile in Centro dati |
| Play / ASC | colonne installazioni/disinstallazioni per definizione omogenea, download ASC; linea activeDeviceInstalls | playInstallStats separa users/events/devices; ASC first-time, warning pre 2025-09-21. Non calcolare install base dai flussi. Coorti retention solo dopo parser validato |
| ASO | rank line con Y invertito, scatter popolarità/difficoltà, colore score, top keyword table | asoKeywordSnapshots, asoAppRankSnapshots; rank null = non osservato/non classificato secondo fonte, mai zero; filtro paese, keyword e progetto |
| Recensioni | distribuzione 1–5 stelle, volume recensioni nel tempo, inbox filtrata per versione/lingua | appReviews; denominatore recensioni importate, rating snapshot globale separato. Non inventare sentiment o rating ASC |
| AdMob / AdSense | colonne ricavi giornalieri; barre per formato/ad source; eCPM/match rate separati | AdMob mediazione prioritaria, AdSense separato; eCPM ponderato con denominatori disponibili e valuta, match rate matched/requests; no average semplice dei rate |
| RevenueCat | line/step MRR e subscribers, KPI ultimo rolling revenue | snapshot, niente somma temporale, gap senza misure; churn/coorti non disponibili senza dati aggiuntivi |
| Salute app | linee crash/ANR e threshold se fonte/definizione verificata | playVitalsMetrics; ritardi dati, confronto stesso perimetro; niente alert su soglie arbitrarie |
| Salute web | small multiples LCP/INP/CLS, categoria soglia e tabella | webPerformanceMetrics, device/URL-origine/lab-field; CrUX rolling non trattato come misura giornaliera indipendente. Soglie configurate solo secondo documentazione corrente |
| Schede / esperimenti | timeline versioni, tabella variant status e risultati | ascMetadataSnapshots/experiments/treatments; non dichiarare winner senza supporto statistico/provider |
| Interventi | annotation su serie, tabella prima/dopo, timeline | growth-evidence/interventions; finestre comparabili e confondenti; causalità non dimostrata |
| Centro dati | tracker giornaliero status + matrice progetto×fonte | connectorRuns, data coverage: esecuzione ≠ data ultima misura; più run/giorno riassunti con policy esplicita, dettaglio accessibile |
| Release / strumenti | timeline stati e preflight checklist | operazioni esplicite, nessuna chiamata remota automatica, non visualizzare segreti |

Regole: barre con baseline zero per confronto quantità; linee non necessariamente zero ma scala dichiarata e costante nel confronto; massimo due serie nella vista di default; no doppio asse di default, no pie a molte categorie, no 3D. Heatmap: scala sequenziale e missing distinto; colore non unico canale. Barre divergenti per variazioni, non per volumi negativi impossibili. Ranking e percentuali non si sommano. Niente mappe geografiche se una top list paese risponde meglio.

## 6. Librerie e componenti già pronti (fonti consultate il 24/11)

| Soluzione | Uso e decisione | Rischio/costo |
|---|---|---|
| [shadcn chart Radix](https://ui.shadcn.com/docs/components/radix/chart), [dashboard blocks](https://ui.shadcn.com/blocks/dashboard) | Adottare layout dashboard-01 come riferimento e chart examples line/bar/composed, sidebar, sheet, dropdown, tabs, calendar/popover, command, table | Documentazione corrente chart usa Recharts v3; non sovrascrivere primitive v2 del repo. Verificare variante Radix e dipendenze, copiare solo componenti utili |
| [Recharts](https://github.com/recharts/recharts/wiki/3.0-migration-guide) | Unico motore principale. Prima correggere semantica con 2.15; poi branch/spike v3 per wrapper e tooltip/legend, accessibilityLayer, ReferenceLine, syncId | Migrazione breaking, API/tipi e comportamento resize cambiano. Non mischiare esempi v2/v3. Pin versione verificata nel lockfile |
| [Tremor Raw](https://www.tremor.so/docs/getting-started/about), [repo/licenza](https://github.com/tremorlabs/tremor) | Copy-paste mirato: [SparkChart](https://www.tremor.so/docs/visualizations/spark-chart), [BarList](https://www.tremor.so/docs/visualizations/barlist), [Tracker](https://www.tremor.so/docs/visualizations/tracker), [CategoryBar](https://www.tremor.so/docs/visualizations/category-bar) | Apache-2.0: preservare licenza/notice per codice importato. Adattare token, Radix, lucide e utility; non installare l'intero @tremor/react né il suo tema. Alcuni esempi importano Remix icons/utility Recharts v2; controllare singolarmente |
| [dashboardcn](https://dashboardcn.com/docs/components), [blocks](https://dashboardcn.com/docs/blocks) | Ottimo candidato per accelerare KPI Card, Metric List, Distribution Bar, Heatmap Chart, ranked list e chart card. [KPI](https://dashboardcn.com/docs/components/kpi-card), [heatmap](https://dashboardcn.com/docs/components/heatmap-chart) | Sito ufficiale dichiara MIT e distribuzione copy-paste shadcn; verificare LICENSE effettivo del commit e registry manifest prima di import. Usa Recharts/shadcn e dichiara TanStack Table v9: non importare tutto prima di decidere versioni |
| [TanStack Table](https://tanstack.com/table/v8/docs/guide/pagination), [shadcn data table](https://ui.shadcn.com/docs/components/radix/data-table) | Aggiungere @tanstack/react-table; partire da API v8 stabili note se compatibili con React installato, o v9 dopo spike separato. DataTable con controlled sorting, column visibility, facets, pagination | Headless, UI resta shadcn. Manual server sort/filter/page per GSC/ASO, non ordinare solo pagina corrente. No duplicate state manager. Non copiare ricetta v9 se si sceglie v8 |
| [TanStack Virtual](https://tanstack.com/virtual/latest) | Solo se benchmark mostra necessità di scroll su centinaia/migliaia di righe effettivamente caricate | Paginazione server prima; virtualizzare non elimina costo query. Test focus/row height |
| [Apache ECharts](https://echarts.apache.org/en/cheat-sheet.html) | Riserva: heatmap densa, scatter enorme, zoom/brush o canvas se Recharts non basta | Secondo runtime e adapter React, lifecycle/dispose, SSR/hydration, token e accessibilità. Non adottare inizialmente |
| [TanStack Charts](https://tanstack.com/charts/latest) | Osservare/spike solo se Recharts non soddisfa esigenze, non necessaria ora | Nuovo motore e riscrittura, nessun benchmark locale |
| [shadcn blocks community](https://www.dashboardblocks.com/docs/components/data-table) | Ispirazione per inline bars/trends e toolbar | Licenze free/pro e dipendenze da verificare per singolo blocco; non usare materiale commerciale senza autorizzazione |

Raccomandazione netta: shadcn Radix + Recharts + TanStack Table + pochi componenti copiati (dashboardcn/Tremor Raw). Niente costi ricorrenti o servizi esterni per render. Registry è sorgente eseguibile: ispezionare JSON, path, dipendenze e diff prima del CLI. Usare copia locale di versione verificata; non fetch runtime/CDN. Conservare attribuzioni, registrare URL/tag/commit e file modificati in docs/reference/ quando si implementa; package license compatibilità verificata su effettivo lockfile. Non installare componenti concorrenti che duplicano Card/Tooltip/Select.

### Ordine di import
1. Prototype KpiCard, Sparkline, BarList, DeltaBadge, SourceStatus, ChartFrame (adattare, non copiare ogni variante).
2. shadcn Tabs/Select/DropdownMenu/Popover/Calendar/Sheet/Command/Empty/Pagination se mancanti; scegliere ricetta Radix compatibile. Filtri URL lato server.
3. Table su una sola vista GSC queries, replica poi pages/keywords/reviews; colonna trend solo su pagina corrente e se dati disponibili.
4. Recharts v3 spike con test del wrapper e tre grafici legacy; aggiornare lockfile e note. Se fallisce restare v2 per prima consegna.
5. Heatmap/Tracker, rank scatter, annotazioni. ECharts soltanto con problema misurato; valutare import modulari.

## 7. Architettura proposta (nomi indicativi)

```text
lib/dashboard/
  metrics.ts          # registry semantico, unità e direzione favorevole
  period.ts           # inclusive date range + confronto + timezone provider
  coverage.ts         # stato e date, confrontabilità
  queries.ts          # lettori SQLite e query/filter whitelist
  format.ts           # formatter condiviso server/client (solo presentazione)
  portfolio.ts        # read model aggregato
  acquisition.ts      # read model per dominio
components/analytics/
  page-toolbar.tsx, period-picker.tsx, source-status.tsx
  metric-card.tsx, delta.tsx, chart-frame.tsx
  ranked-list.tsx, data-table.tsx, row-detail.tsx
components/charts/
  time-series.tsx, sparkline.tsx, comparison-bars.tsx
  distribution.tsx, rank-trend.tsx, scatter.tsx
app/project/[slug]/layout.tsx  # header/tab progetto
app/project/[slug]/acquisition/page.tsx
... store, revenue, health, opportunities, interventions, settings
```

Server prepara DTO minimi; client riceve valori/label e stato, nessuna aggregazione di business o callback non serializzabile dal Server Component. Non creare una generic dashboard DSL. Estrarre primitive solo se condivise da casi reali; separare rendering, calcolo e lettura. Esempio contratto indicativo:

```ts
type MetricUnit = "count" | "percent" | "rank" | "currency" | "ms" | "score";
type MetricState = "available" | "partial" | "stale" | "unconfigured" | "pending" | "error" | "not_applicable";
type DateRange = { from: string; to: string };
type MetricDatum = {
  key: string; label: string; value: number | null;
  unit: MetricUnit; currency?: string; source: string;
  grain: "day" | "snapshot" | "provider_period" | "rolling_window";
  range: DateRange; latestDataDate?: string; lastSyncAt?: string;
  state: MetricState;
  coverage?: { observed: number; expected?: number; unit: string };
  comparison?: { range: DateRange; value: number | null; comparable: boolean; reason?: string; delta?: number; deltaPercent?: number; deltaPoints?: number };
};
type ChartPoint = { date: string; current: number | null; previous: number | null; previousDate?: string };
```

Specificare in registry additive/snapshot/ratio/rank, scala percent (es. 0–1 interno), direction (higher/lower/neutral), precisione e valuta obbligatoria per currency. ChartPoint previous allineato per indice nella finestra e data reale nel tooltip, stessa lunghezza; calendario coerente con granularità provider. Missing null, zero valido; percent change non definita con previous=0; show delta assoluto. Settimane parziali segnalate; periodi default ultimi 28 giorni completi per fonte con cutoff comune quando confrontabile, altrimenti separati. Non perdere l'ultimo dato vecchio dopo errore; visualizzare anche stato sync separato (non comprimere tutto in singolo enum nella versione finale). Nessun cambio schema richiesto per MVP.

Prestazioni: misura query count, payload RSC, TTFB, bundle client e resize prima/dopo su fixture demo; layout non legge dataset completo, query SQL aggregate prima di paginare, indici solo dopo EXPLAIN QUERY PLAN. Evitare N+1 per sparkline e per-riga, usare query batch su ID della pagina. Su serie lunghe raggruppare lato server per settimana/mese con semantica corretta; non decimare perdendo picchi o calcolare KPI dalla serie campionata. Lazy load chart costosi per route; loading.tsx/Suspense solo dove utile, no global client state salvo necessario. Nessuna dipendenza persistente da servizi esterni.

## 8. Backlog e accettazione

| Priorità | Ticket | Accettazione |
|---|---|---|
| P0 | Contratti metrica/periodo/valuta/missing + DTO shell | Test synthetic coverage, null/zero, snapshot, valute e same-window; nessun secret/raw in props |
| P0 | Fix chart legacy | Tooltip zero, gradient useId, asse Y/unità, date gaps, interpolazione lineare, resize test; non cambiare risultati numerici |
| P1 | Shell e portfolio | Icone, sidebar persistita, progetto attivo, periodo URL, home gruppi web/app, status discreto, Studio raggiungibile |
| P1 | ChartFrame / MetricCard / Delta / Sparkline | Tre fixture complete, partial, missing; theme e keyboard coerenti |
| P1 | Explorer GSC query/pages | Filtri e sort server prima di paginare, conteggio, row detail, export safe, compare period |
| P1 | Acquisizione app e monetizzazione | ASC/Play separati; MRR gauge, ads flow, breakdown e valute coerenti |
| P1 | Centro dati e opportunità | Ultimo dato vs sync, tracker, stato esplicito, filtri e azioni contestuali; nessuna sync implicita |
| P2 | GA4 landing, SEO/GEO, ASO, salute, interventi | Chart atlas e drilldown; no grafici senza parser/coverage |
| P2 | Recharts v3, dark mode, command palette e saved view locali | Spike indipendente, regressioni zero, scelta versioni e licenze documentata |
| P3 | Cohort/funnel, custom dashboard builder, mappe, secondo motore | Solo se emerge esigenza, dati e benchmark; altrimenti non implementare |

Sequenza reale: P0 → shell + un vertical slice GSC con dati demo → review utente → estensione per dominio. Migrazione v3 può precedere slice grafico se spike piccolo, ma non bloccarlo. Nessun redesign Studio in questa fase.

Verifica minima: pnpm typecheck; pnpm run test:gsc; pnpm run test:reliability; pnpm run test:integrations; pnpm run test:growth-evidence; pnpm run test:seo-geo; pnpm test:dashboard. Aggiungere test unitari node:test dei DTO, query e formattazione; UI smoke locale con fixture sintetica in DB separato, mai seed sul DB reale. Verificare isolamento via config effettiva prima di eseguire seed; screenshot di fixture, no dati veri. Browser a carico dell'utente secondo audit esistente: 1440×900, 1024×768, 390×844, sidebar collapse, light/dark se introdotto, tastiera e reduced motion, navigation back, loading, errore, URL lunga, zero, null, giorno mancante, serie monovalore, molti progetti, valuta mista, sparse MRR, fonte stale e finestre diverse. E2E Playwright/axe come opzione in fase implementativa, non dipendenza aggiunta ora. Obiettivo prestazioni proposto: nessun full read per shell, no N+1, misurare prima di fissare SLA; no overflow globale e no attesa artificiale di 2 s per resize.

## 9. Decisioni aperte

- Versione effettiva Recharts e TanStack Table: verificare peer dependencies con lockfile e test; non si è installato nulla.
- Preferenza grafica dark e densità compatta: validazione utente dopo vertical slice, non blocca P0.
- Sincronizzazione globale o per fonte/progetto: estendere API come audit precedente, preservando protezioni; nessuna esecuzione implicita.
- Le metriche non alimentate (coorti, funnel, attribuzione AI, query×page joint) restano future, non mock in produzione.
- Benchmark e verifica visiva non effettuati; nessuna certezza su popolamento, distribuzione o prestazioni DB reale.
- Riferimenti visuali di prodotto: shadcn dashboard-01 per struttura; Tremor/dashboardcn per componenti; GSC per selezione metriche e confronto, Umami/Plausible per densità, RevenueCat per MRR, PostHog per drill-down. Ispirazione, non copia di prodotti o assets.
