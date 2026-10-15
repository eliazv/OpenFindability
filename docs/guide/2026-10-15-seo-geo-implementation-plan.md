# Piano di implementazione SEO + GEO in OpenFindability

> Stato: proposta tecnica, **non implementazione**. Data: 15 ottobre 2026.
> Repository analizzato: `eliazv/OpenFindability`, branch base `master`.
> Documento complementare: [strumenti e ricerca](./2026-10-15-seo-geo-tools.md).

## 0. Decisione architetturale

**Estendere OpenFindability, non creare un nuovo prodotto.** Il repository è già un'app Next.js locale con Drizzle/SQLite, sync manuale, dashboard multi-progetto, CLI, report, motore di opportunità e MCP. Ha già integrazioni GSC, GA4, Umami e audit indicizzazione.

Obiettivo: far rispondere OpenFindability a quattro domande:

1. **Trovabilità:** dove otteniamo clic e impression da Google/Bing?
2. **Visibilità AI:** dove abbiamo dati reali su impression AI, citazioni, referral o crawler?
3. **Diagnosi:** quali pagine hanno errori tecnici o frizioni UX?
4. **Priorità:** quale intervento ha migliore impatto atteso, costo e confidenza?

Vincoli: self-hosted, open source, nessun nuovo SaaS o monorepo; connettori opzionali; import in sola lettura; nessun job schedulato obbligatorio; chiavi locali e mai nel repo; provider isolati; valori sconosciuti = `null`, non 0.

## 1. Stato reale del codice e punti d'aggancio

| Elemento già esistente | Percorso | Da riutilizzare |
|---|---|---|
| Entità `Project`, `SourceType`, `AppData`, opportunità | `lib/types.ts` | Nuovi provider e tipi metriche |
| Schemi e indici SQLite | `lib/db/schema.ts`, `drizzle/` | Tabelle dedicate SEO/GEO/UX |
| Lettura/scrittura dati | `lib/store.ts` | Persistenza nuovi dataset |
| Orchestrazione sync | `lib/sync.ts` | Sync per provider con log |
| Catalogo connettori | `lib/connectors/catalog.ts` | Label, category, freshness |
| GSC e GA4 | `lib/connectors/gsc.ts`, `ga4.ts` | Non duplicarli |
| Aggregazioni opportunità | `lib/insights.ts`, `lib/gsc-detail.ts` | Regole cross-source prudenti |
| Snapshot offline | `lib/analytics/growth-snapshot.ts` | Sezione SEO/GEO |
| Report | `lib/report.ts`, `scripts/report.ts` | Sezione SEO/GEO in MD |
| Dashboard | `app/page.tsx`, `app/project/[slug]/page.tsx` | Cards e dettaglio fonte |
| CLI e diagnostica | `scripts/sync.ts`, `lib/doctor.ts` | Comandi e test connessione |
| MCP | `mcp/server.ts` | Query analytics e opportunità |
| Setup progetti | `scripts/add-project.ts`, `scripts/update-project.ts` | Mapping degli account |
| Test offline | `tests/` | Parser, dedupe, limiti API |

**Attenzione 1:** le tabelle `searchQueries` e `pageMetrics` sono GSC-only e prive di un campo source. Non usarle per Bing senza migrazione/namespace: mescolare i risultati corromperebbe insight e trend.

**Attenzione 2:** `metricSnapshots` ha un tipo `SourceType` enumerato, con chiave `(projectId, source, date)`. Funziona per totali giornalieri omogenei; **non** contiene già il modello necessario per citazioni per URL, bot/path/status o monitor UX con finestre temporali diverse.

**Attenzione 3:** `buildOpportunities()` e `getGrowthSnapshot()` sono orientati GSC/monetizzazione. Le nuove regole devono conservare prove e origine; niente score GEO opaco.

**Attenzione 4:** `store.ts` gestisce payload relazionali e scritture/delta. Ogni nuova tabella va aggiunta alla catena completa schema → types → store → sync → report/MCP/test, rispettando le chiavi uniche e le performance per storici grandi.

## 2. Roadmap raccomandata

| Fase | Contenuto | Valore | Complessità | Condizione di completamento |
|---|---|---|---|---|
| 0 | Audit configurazione siti, CTA, fonti e tipologie | Molto alto | Bassa | Mappa dominio→proprietà verificata |
| 1 | **Bing SEO REST** + nuove opportunità comparate | Molto alto | Media | Clic/impression Bing disponibili e isolati da GSC |
| 2 | **Cloudflare AI Crawl Control** + AI referrals GA4/Umami | Alto | Media | Bot e referral in sezioni distinte, con fonte/coverage |
| 3 | **Google AI reports + Bing AI Performance** import supportato | Alto | Media | Dati GEO reali, senza API inventate |
| 4 | **Clarity** UX aggregata, PSI/CrUX e audit tecnico | Alto | Media | Segnali diagnostici collegabili a pagina |
| 5 | Dashboard SEO/GEO, report e MCP; score azionabile | Molto alto | Media | Priorità leggibili senza interpretazioni fuorvianti |
| 6 | Opzionali: Ahrefs CSV, Screaming Frog CSV, competitor/GEO test panel | Medio | Variabile | Solo se il flusso manuale crea domanda |

La sequenza ottimale non è “tutti i connector prima dell'interfaccia”. Integrare **un provider per volta end-to-end**, comprensivo di test, report e diagnostica, per evitare un database pieno di righe non utilizzabili.

## 3. Fase 0 — Inventario e qualità degli input

Per ogni `Project` web/web_app censire:

- `websiteUrl` e dominio canonico effettivo (www/non-www, sottodomini, pathname).
- `gscProperty` già configurata e siteUrl Bing **esatto**, senza derivarlo automaticamente da GSC.
- Eventuale `ga4PropertyId` / `umamiWebsiteId`: verificare che il monitoraggio non sia duplicato.
- Cloudflare `zoneId` e conferma di **proxy attivo**, non solo nameserver.
- `clarityProjectId` con token di accesso per progetto; attivare soltanto sui siti utili.
- CTA reali e conversioni: download Play/App Store, email/contact form, acquisti, iscrizioni.
- Pagina iniziale, principali landing, guide ed esempi URL di contenuti dinamici.
- Data di validità per eventi e articoli: non proporre ottimizzazioni su eventi conclusi o rimossi.

Configurazione proposta in `Project` (opzionale, senza obbligare chi usa solo GSC):

```ts
type SeoGeoSettings = {
  bingSiteUrl?: string;
  cloudflareZoneId?: string;
  clarityProjectId?: string;
  enableAiCrawlerAnalytics?: boolean;
  enableConversionDiagnostics?: boolean;
};
```

Meglio colonne nullable se servono query semplici; un `projectIntegrations` normalizzato può essere valutato solo se i provider/parametri aumentano molto. **Segreti mai nei campi Project:** token Bing/Cloudflare/Clarity in `.env` / `secrets/`, referenziati con chiavi logiche e non conservati nei report/rawJson.

## 4. Fase 1 — Bing Webmaster Tools SEO

### Connector

Nuovo: `lib/connectors/bing.ts`.

- Autenticazione con API key/OAuth conforme alla **REST API attuale**; non usare SOAP/POX deprecati.
- Metodi minimi: test connessione/proprietà, time series clic/impression, query importanti dove supportato, diagnostiche URL/sitemap solo dove documentate.
- Salvataggio di **data timezone/finestra**, provider, metrica, risposta originale, fetch timestamp e limiti/coverage.
- Retry su rate-limit (429), backoff, paginazione dove applicabile, errori per singolo sito senza bloccare gli altri.
- Idempotenza per `projectId + source + date`; attenzione ai totali o verticali differenti da GSC.
- Non sommare clic Bing e Google sotto l'etichetta “Google Search”: un eventuale totale multi-search va etichettato chiaramente.

### Persistenza

Opzione preferita: usare `metricSnapshots` per **Bing daily totals** aggiungendo `bing_webmaster` a `SourceType` e all'enum della tabella. Per query e URL Bing creare `bingSearchQueries` / `bingPageMetrics` oppure una nuova struttura provider-aware con migrazione esplicita dei dati GSC se il refactor è giustificato.

Per la prima implementazione eviterei il refactor generale di `searchQueries`: creare due nuove tabelle snelle e mantenere gli insight GSC invariati.

### Integrazione UX

- Scheda “Ricerca organica”: filtri Google/Bing e confronto 7/28/90 giorni con finestre allineate su giorni comuni **finalizzati**.
- Opportunità: query in forte crescita solo su Bing; pagina ben posizionata su Google ma debole su Bing; errore indicizzazione Bing contro GSC.
- Niente “posizione media globale” ottenuta mediando posizioni tra motori.

### Test

Fixture API e contratti, parsing date, retry, upsert, 0 vs missing, sito non configurato, matching URL canonical.

Documentazione API: https://learn.microsoft.com/en-us/bingwebmaster/

## 5. Fase 2 — Cloudflare crawler AI + referral verificabili

### Cloudflare

Nuovo: `lib/connectors/cloudflare-ai.ts`; GraphQL Analytics API ufficiale.

Dati minimi: `zoneId`, data/ora bucket, crawler identificato, `userAgent`/detection method, request count, status 2xx/3xx/4xx/5xx, path e host se disponibili, traffico bot vs client. Conservare i dettagli della query e il campionamento.

Punti delicati:

1. Usare filtri documentati `httpRequestsAdaptiveGroups`; la disponibilità di detection ID verificati dipende dal piano. Un parser su `userAgent` è **probabilistico**.
2. Free: analytics con finestra di 24h. Senza scheduler richiesto, il comando manuale importa solo l'ultimo giorno disponibile; non promettere storico affidabile se la raccolta non è frequente.
3. Non chiamare GraphQL per ogni URL di un sito enorme. Prima aggregates per crawler/status, poi top path con limite e opzionalità.
4. Registrare `coverageStart`, `coverageEnd`, `detectionMethod`, `isSampled`, `planLimited`; disabilitare alert di calo su finestre incomplete.
5. Se la zona non è proxata, restituire `skipped` con motivazione, non metriche a zero.

Esempi di classi di bot: `GPTBot`, `OAI-SearchBot`, `ChatGPT-User` (scopi diversi), `ClaudeBot`, `PerplexityBot` dove riconoscibili, crawler search classici. Non equipararli né attribuire citazioni a un bot particolare senza conferma.

### Referral AI

Prima di introdurre un ulteriore connettore, recuperare referrer/source/medium dagli strumenti già configurati:

- GA4 via report dedicato (eventi/sessioni e landing page), **senza cambiare il significato degli attuali `MetricSnapshot` GA4**.
- Umami via API referrer, se il progetto è configurato e lo schema disponibile.
- Regole mantenute in `lib/analytics/ai-referrers.ts`: domini di provenienza identificabili e lista testata (ChatGPT, Perplexity, Copilot, Claude, Gemini e altri se realmente distinguibili).
- Classificazione `known_ai_referral` / `unknown`; non riclassificare `direct` come AI e non usare i referral come proxy di citazioni.
- Comparare il numero di sessioni per singolo provider (GA4 vs Umami) ma **non sommarle**; evitare double counting.

Documentazione:
- https://developers.cloudflare.com/ai-crawl-control/reference/graphql-api/
- https://developers.cloudflare.com/ai-crawl-control/get-started/

## 6. Fase 3 — Impression e citazioni AI: provenienza verificata

### Google GSC generative AI

I nuovi report sono disponibili nell'interfaccia GSC dal 2026, ma **non assumere che Search Analytics API esponga la distinzione AI**.

- Primo passo: provare un export ufficiale da un sito con report disponibile; documentare colonne, delimitatore, date, dimensioni e regole di aggregazione.
- Implementare parser `lib/importers/gsc-ai-report.ts` e CLI `scripts/import-gsc-ai.ts` con `--file`, `--slug`, `--dry-run`, `--apply`. Validare sempre domini, metriche non negative e periodo.
- Se la UI non espone export utilizzabile per quella proprietà, lasciare stato “non supportato/no data”. Nessun scraping autenticato.
- Solo dopo verifica documentata di API ufficiale: `lib/connectors/gsc-ai.ts`.

### Bing AI Performance

Le citazioni aggregate e le grounding queries sono esposte nella UI in public preview. Al momento dell'analisi non risulta documentato un endpoint pubblico specifico per AI Performance.

- Non confondere le API Bing SEO con l'API delle citazioni AI.
- Consentire **import di export realmente disponibili**; in assenza di export ufficiale, un inserimento manuale opzionale e chiaramente marcato con origine `manual` e timestamp.
- Non creare un “connettore API Bing AI” basato su URL interni, scraping del portale o reverse engineering di endpoint privati.
- Conservare URL citati, citazioni, periodo, fonte e grounding queries campionate senza dedurre la domanda esatta dell'utente.

### Modello GEO comune

Preferire nuove tabelle:

```ts
type AiVisibilityObservation = {
  projectId: string;
  provider: "google_gsc_ai" | "bing_ai_performance";
  metric: "impressions" | "citations" | "avg_cited_pages";
  startDate: string; endDate: string;
  pageUrl?: string; // NULL per totale property-level
  value: number; // unità e granularità dichiarate
  ingestion: "api" | "official_export" | "manual";
  fetchedAt: string;
  rawJson?: unknown;
};

type AiCrawlerObservation = {
  projectId: string;
  date: string;
  crawler: string;
  requestCount: number;
  httpStatusGroup?: string;
  pagePath?: string;
  detectionMethod: "user_agent" | "verified_bot_id";
  coverageStart: string; coverageEnd: string;
  rawJson?: unknown;
};
```

**Vincolo di unicità:** su SQLite i campi nullable nelle unique key richiedono attenzione: per i totali e i dettagli per pagina usare chiavi stabili basate su `scope` + `normalizedPageKey` (vuota esplicitamente quando non presente), oppure tabelle separate. Per aggiornamenti ricorrenti distinguere revisioni di un report e versione dei dati. La metrica “avg cited pages” è una media su periodo, **non sommabile** tra giorni/report.

**La regola del dashboard:** quattro carte separate, mai un unico “GEO score” che combini crawler, citazioni, impression e referral.

Fonti:
- https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
- https://support.google.com/webmasters/answer/16984139?hl=en
- https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/

## 7. Fase 4 — Clarity, performance, audit

### Clarity

Nuovo: `lib/connectors/clarity.ts`.

La Data Export API documentata espone `numOfDays=1|2|3` e dimensioni come URL/source. Fare un **snapshot periodico** delle metriche aggregate, per URL quando possibile: dead clicks, rage clicks, quickback, script errors, scroll depth, engagement.

- Se non esegui sync per >3 giorni, rimane un **buco di copertura**, non ricostruirlo artificialmente.
- Gli aggregati su finestre sovrapposte non vanno sommati: memorizzare `windowStart`, `windowEnd` e la specifica metrica; oppure snapshot quotidiani non sovrapposti verificati.
- Minimo privilege su API token. Nessun dato personale, session replay o cookie importato nel DB.
- Mostrare un deep link alla heatmap/recording in Clarity invece di replicarne l'interfaccia.
- Non associare registrazioni Clarity a utenti/campagne individuali in OpenFindability.

### PageSpeed e CrUX

Nuovo: `lib/connectors/pagespeed.ts`; `lib/connectors/crux.ts` se utile.

- Controllare URL **a campione** (homepage, landing principali, template evento/articolo).
- Mobile/desktop separati, stessa URL canonical, timestamp dell'esecuzione e versione strumento.
- Confrontare lab score Lighthouse su più misurazioni, non trattare il punteggio singolo come una verità.
- Per field data p75 preferire **CrUX API/History API** (Google annuncia la futura rimozione dei dati CrUX dal payload PSI).
- Calcolare opportunità: LCP/INP/CLS problematici su landing ad alto traffico, 404, canonical errata, pagina lenta con conversioni elevate.
- Il markup schema.org va testato per validità ma il test non garantisce rich results.

### Crawl locale vs Ahrefs/Screaming Frog

Prima di clonare crawler commerciali, estendere l'index audit GSC con un controllo HTTP leggero sulle URL principali e sitemap:

- HTTP status, redirect chain, canonical, title, description, heading H1, robots/noindex, structured data JSON-LD sintattico e URL collegati.
- Rate limit e rispetto robots.txt; non crawlare automaticamente tutte le date/sitemap di VitaRomagna.
- Permettere import CSV da Screaming Frog/Ahrefs come diagnostica **opzionale** se esiste un export autorizzato.
- Non usare API Ahrefs presumibilmente gratuite: il piano gratuito garantisce audit nel prodotto, non un endpoint open per l'integrazione.

Riferimenti:
- https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
- https://developers.google.com/speed/docs/insights/v5/get-started/
- https://ahrefs.com/webmaster-tools/

## 8. Schema dati, storicizzazione e migrazioni

Tabelle candidate (nomi indicativi):
- `bing_search_queries` e `bing_page_metrics` — giornaliere, chiavi canoniche e provider implicitamente Bing;
- `ai_visibility_observations` — impression/citazioni/medie con metrica, finestra, page scope, ingestion;
- `ai_crawler_observations` — bot/path/status + copertura + metodo rilevamento;
- `ux_diagnostic_observations` — Clarity aggregato e periodo effettivo;
- `technical_audits` — URL, device, punteggio/metriche/finding, audit timestamp;
- `ai_referral_metrics` — source analytics, categoria/referrer, landing page e periodo;
- eventuale `external_imports` — hash file, mapping, importedAt, schemaVersion e provenienza per dedupe.

I totali giornalieri Bing possono vivere in `metric_snapshots` con source dedicata. Non mettere metriche con unità e grana diverse nei campi generici `clicks`/`impressions` senza provider e definizione.

Ogni riga importante deve conservare: `projectId`, `source/provider`, `metric definition`, `unit`, `date or window`, `fetchedAt`, `rawJson`, `coverage` quando necessario.

Per modifiche al DB:
1. `pnpm run db:backup` su installazioni reali, **prima** delle migrazioni.
2. Modificare `lib/db/schema.ts` + `lib/types.ts`.
3. `pnpm run db:generate` e commit migration in `drizzle/`, senza editare migrazioni applicate.
4. Aggiornare `lib/store.ts` e i layer CLI/MCP/report.
5. Testare upgrade su copia di SQLite popolata e nuovo DB vuoto.
6. Verificare duplicazioni cross-provider e comportamento di reinstall/risync.

## 9. Dashboard, report e priorità operative

### Dashboard per progetto

Sezioni consigliate:

1. **SEO** — tab Google/Bing, confronto periodi con stessa finestra, pagine/query e indicizzazione.
2. **AI Visibility** — card distinte per Google AI impression, citazioni Bing AI, AI referrals, AI crawler requests; per ogni card sorgente/ultimo aggiornamento/coverage.
3. **Salute** — Lighthouse/CrUX, errori indicizzazione/crawl, stato sitemap, schema.
4. **Conversioni/UX** — landing, eventi CTA GA4 e frizioni Clarity.
5. **To do** — massimo 5-10 interventi, ordini per valore atteso e confidenza.

Il confronto 7/28/90 giorni deve usare **finestre compatibili**, mostrare il ritardo naturale dei provider e distinguere “nessun dato”, “non configurato”, “errore sync”, “dato non disponibile nel piano”.

### Motore di opportunità

Nuovi tipi in `OpportunityType` con output che contiene sempre `evidence` (provider, URL/query, finestra, baseline, delta, coverage) e `recommendedAction`.

Esempi di regole verificabili:

- **Cross-engine gap:** query/pagina con impression Google significative e bassa visibilità Bing, solo se dati sufficienti; prima analizzare sitemap e indicizzazione, senza promettere miglioramento ranking.
- **AI citation growth/decline:** usare solo citazioni ufficiali Bing in due periodi compatibili e con coverage sufficiente.
- **AI referral conversion:** landing con sessioni da referrer AI misurato ma CTA inferiore al benchmark delle altre sorgenti; mostrare dimensione campione.
- **Crawler 4xx/5xx:** richieste bot AI su pagine strategiche che ricevono errori; evitare di usare user-agent non verificati come prova forte.
- **Technical x demand:** pagine con impression alte e LCP/INP/CLS scarsi, oppure broken canonical/structured data su pagine importanti.
- **UX frictions:** pagine con traffico significativo + dead/rage clicks, senza dedurre causalità automatica.
- **Freshness events:** URL evento non indicizzate in prossimità dell'inizio; rispetto a pagine scadute non suggerire continui aggiornamenti per ranking.

Assegnare priorità **per progetto** per evitare che VitaRomagna monopolizzi gli output, come già fa l'attuale `buildOpportunities()`.

### Report e MCP

- In `lib/report.ts`: `SEO & GEO` con fonti, stati sync, confronto coerente e 5 azioni.
- In `lib/analytics/growth-snapshot.ts`: aggiungere `bingSeo`, `aiVisibility`, `aiCrawling`, `aiReferrals`, `technicalHealth` come oggetti opzionali; non rompere il contratto corrente.
- In `mcp/server.ts`: `get_seo_geo_snapshot`, `get_ai_visibility`, `get_technical_opportunities` read-only, usando dati già importati.
- La CLI generale resta manuale; evitare cron e automazioni operative non richieste.

## 10. Interfacce CLI proposte (non ancora presenti)

Esempi di UX desiderata, **non comandi esistenti**:

```bash
pnpm run sync:bing
pnpm run sync:cloudflare-ai
pnpm run sync:clarity
pnpm run audit:pagespeed -- --slug vitaromagna --limit 25
pnpm run seo:geo -- --slug vitaromagna --days 28
pnpm run import:gsc-ai -- --slug vitaromagna --file ./export.csv
pnpm run import:gsc-ai -- --slug vitaromagna --file ./export.csv --apply
pnpm run import:bing-ai -- --slug vitaromagna --file ./export.csv --apply
```

Per gli import manuali mantenere il comportamento del progetto: parsing e **dry-run di default**, persistenza solo con `--apply`. Lo stesso vale per qualunque futura azione di invio IndexNow/sitemap: essa scrive all'esterno e richiede consenso esplicito.

Nomi environment *proposti*, da finalizzare dopo verifica auth:

```env
BING_WEBMASTER_API_KEY=...           # secret, non in Project
CLOUDFLARE_API_TOKEN=...            # Analytics: scope minimo
CLARITY_API_TOKEN=...               # se token per progetto: mapping locale privato
PAGESPEED_API_KEY=...               # opzionale
```

Aggiornare `.env.example` senza valori reali; eventuali credenziali multi-account usare un file JSON **ignorato da git**, con mapping esplicito tra progetti e riferimenti secret.

## 11. Casi d'uso e benchmark per progetto

### VitaRomagna

Contenuti dinamici, soprattutto sagre, eventi e guide. Le valutazioni devono tenere conto della data dell'evento e della naturale stagionalità.

- IndexNow lato publisher quando un evento viene creato, aggiornato sostanzialmente o rimosso; batching/debounce e nessun invio per semplici view/crawl. Il protocollo **notifica** URL, non garantisce ranking o indicizzazione.
- Check sitemap, canonical e schema Event sui template di evento.
- Monitorare 404/errori su richieste dei crawler AI e Googlebot/Bingbot.
- Scegliere pagine tecniche da campionare: una landing città, una sagra, un articolo, una guida, un evento recente.

### Portfolio

- Misurare query commerciali per freelance/sviluppo web, le pagine servizi e conversioni contatto.
- Preferire Bing SEO, GSC, PageSpeed e Clarity leggero: Cloudflare AI solo se ha dati utili.

### Scadenzario

- Funnel keyword → landing → click store → install/download ove disponibili.
- Analizzare attriti UX con Clarity e performance mobile.
- Separare SEO della landing da ASO e dai dati dello store già presenti in OpenFindability.

### Altre landing/app

- Configurazione leggera; evitare installazioni di tracker duplicati e audit intensivi su siti con pochissimo traffico.

## 12. Privacy, affidabilità e costi

- Token e account fuori da Git; log redatti e `rawJson` senza header/auth/cookie.
- API read-only, rate-limit, timeout, retry bounded, backoff su 429; nessun crawling aggressivo.
- Input import validato (mime, schema, dimensioni, project matching, URL fuori dominio, encoding CSV).
- Dati da analytics e browser: privacy policy, consenso ove dovuto, niente PII/sessioni individuali in DB.
- Distinguere user-agent spoofabile da bot verificato, referrer assente da sessioni direct, dato sconosciuto da zero.
- Dimensionare lo storico: evitare salvare milioni di richieste bot singole in SQLite; preferire aggregazioni per giorno/bot/status e top path.
- Non inviare contenuto riservato a API AI terze per un punteggio GEO artificiale.
- Un piano Free non implica automaticamente accesso gratuito e completo a tutte le API o a tutte le retention.
- **No cloud billing nuovo richiesto** per il MVP: solo servizi che già usiamo, piani free e audit manuali.

## 13. Test di accettazione

- [ ] Progetto senza nuovi connector: dashboard, report e sync attuali invariati.
- [ ] Bing e GSC separati anche in caso di stesse query/pagine/date.
- [ ] Data mancante/null vs zero e stato “non configurato” sempre distinguibili.
- [ ] Cloudflare Free con 24h di coverage non produce falsi trend 28 giorni.
- [ ] Bing AI assente non compare come “zero citazioni”; ingresso manuale marcato come tale.
- [ ] Import CSV rifiuta URL fuori dalla proprietà e duplicati, persistenza solo con `--apply`.
- [ ] Re-sync non duplica totali e import sovrapposti non vengono sommati.
- [ ] Fonte, unità, finestra e freshness visualizzate in UI, report, MCP.
- [ ] Calcolo opportunità gestisce stagionalità e date evento.
- [ ] CLI `pnpm typecheck`, `pnpm build`, test offline e suite regressione attuali passano.
- [ ] Nessun secret/PII nei commit, log, snapshot di test e output MCP.
- [ ] Upgrade SQLite con backup e migrazioni verificate.

## 14. Ordine delle PR consigliato

1. **PR1 — Bing SEO end-to-end:** settings progetto, connettore REST, schema/migrazione, doctor, sync, UI, test. Valore rapido.
2. **PR2 — AI crawling/referrals:** Cloudflare GraphQL + referrer GA4/Umami + UI separata, con limiti di piano.
3. **PR3 — Import GEO verificato:** GSC AI + Bing AI con formati ufficialmente disponibili, parser ed evidenze. Niente API inventate.
4. **PR4 — Clarity + PSI/CrUX:** strumenti diagnostici e campionamento controllato.
5. **PR5 — Intelligence e MCP:** nuove opportunità, report e snapshot coordinati, prove e confidenza.

**Non implementerei adesso:** ranking artificiale ChatGPT tramite prompt periodici, integrazione Ahrefs API commerciale non richiesta, SEO spider completo, scheduler, database separato, sistema di “GEO score universale” o blocchi automatici AI in Cloudflare.

## 15. Fonti di riferimento e verifica prima di sviluppare

- Bing Webmaster REST API: https://learn.microsoft.com/en-us/bingwebmaster/
- Bing AI Performance: https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/
- GSC AI Performance: https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
- GSC Search Analytics API: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Cloudflare AI GraphQL: https://developers.cloudflare.com/ai-crawl-control/reference/graphql-api/
- Cloudflare Free limits: https://developers.cloudflare.com/ai-crawl-control/get-started/
- Clarity Data Export API: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
- PSI: https://developers.google.com/speed/docs/insights/v5/get-started/
- Ahrefs Free: https://help.ahrefs.com/en/articles/13002606-what-can-i-use-for-free-in-ahrefs

**Prossima azione suggerita:** attivare/verificare Bing sui domini effettivi, iniziare PR1 e usare il primo report multi-engine per decidere se Cloudflare e Clarity producono abbastanza segnali da giustificare gli step successivi.
