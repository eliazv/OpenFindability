# OpenFindability - Struttura del progetto

## Obiettivo

OpenFindability e' uno strumento open source per monitorare la findability dei propri progetti web e mobile.

Il suo scopo non e' essere una dashboard analytics generica, ma aiutare a capire quali progetti, pagine, query, app e listing meritano attenzione.

La domanda principale a cui deve rispondere e':

```txt
Su cosa devo lavorare questa settimana per migliorare la visibilita' dei miei progetti?
```

Per ora il progetto nasce come strumento personale, self-hosted e open source. Non e' pensato come SaaS nella prima fase.

## Licenza

La licenza scelta e':

```txt
MIT
```

Motivazione:

- e' semplice da capire;
- e' molto permissiva;
- facilita contributi, fork e riuso;
- riduce attrito per chi vuole provarlo;
- va bene per una prima fase in cui l'obiettivo e' costruire uno strumento utile e pubblico.

Non serve impostare subito una strategia commerciale o open core. L'obiettivo iniziale e' creare un prodotto reale, utile per i propri progetti, ben documentato e facile da avviare.

## Posizionamento

Descrizione breve:

```txt
Open-source SEO and ASO intelligence for web and mobile projects.
```

Descrizione estesa:

```txt
OpenFindability is an open-source dashboard for indie developers, freelancers and small teams to monitor how their web and mobile projects are found through Google Search, app stores and analytics sources.
```

Promessa del prodotto:

```txt
Collega i tuoi progetti e scopri quali pagine, query e app meritano attenzione questa settimana.
```

## Target iniziale

Il progetto e' pensato prima di tutto per uso personale, ma deve essere strutturato in modo da poter essere pubblicato e usato anche da altri.

Utenti ideali:

- indie developer con piu' progetti;
- freelance con progetti propri;
- piccoli team;
- sviluppatori che gestiscono siti, app, blog, landing e piccoli SaaS;
- agenzie leggere, in futuro.

Non deve partire come alternativa completa a Semrush, Ahrefs, AppTweak, Sensor Tower o strumenti enterprise.

## Fonti dati

Fonti principali della prima fase:

```txt
Google Search Console
Umami
```

Fonti da aggiungere dopo:

```txt
Google Play Console
App Store Connect
Plausible
Matomo
PostHog
Google Analytics
RevenueCat
Stripe
Lemon Squeezy
Cloudflare Web Analytics
```

La priorita' e' partire da Google Search Console e Umami, perche' coprono bene il caso web e permettono subito di generare opportunita' SEO utili.

## Funzione principale

La funzione piu' importante non e' visualizzare grafici, ma generare priorita' operative.

Esempio:

```txt
Priorita' della settimana

1. VitaRomagna
   /eventi/rimini ha perso il 28% dei click GSC negli ultimi 7 giorni.

2. Immerso nella Pineta
   La query "campeggio pineta cervia" ha 4.200 impression ma CTR 1,1%.

3. Portfolio
   La pagina /servizi riceve traffico, ma non genera conversioni.

4. Scadenzario
   Le installazioni Android sono calate del 18% rispetto ai 28 giorni precedenti.

5. AlloggioPro
   La query "alloggiati web app" e' in crescita e merita una landing dedicata.
```

## MVP

La prima versione deve essere piccola e concreta.

Obiettivo della v0.1:

```txt
Collegare Google Search Console e Umami, importare metriche giornaliere e mostrare opportunita' SEO operative per progetto.
```

Funzioni v0.1:

- gestione progetti;
- connector Google Search Console;
- connector Umami;
- import giornaliero manuale o schedulabile;
- database metriche;
- dashboard progetti;
- vista opportunita' SEO;
- trend 7/28/90 giorni;
- dati demo;
- documentazione base;
- licenza MIT.

Da non fare nella v0.1:

- SaaS hosted;
- billing;
- multi-tenant complesso;
- AI advisor avanzato;
- MCP completo;
- tutti i connector mobile;
- sistema ruoli complesso;
- competitor tracking avanzato.

## Sezioni dell'app

### Dashboard

Vista generale di tutti i progetti.

Contenuti:

- progetti in crescita;
- progetti in calo;
- click GSC;
- impression;
- CTR;
- posizione media;
- visite Umami;
- pageview;
- opportunita' principali;
- variazioni rispetto ai 7/28 giorni precedenti.

### Projects

Gestione e dettaglio dei progetti.

Ogni progetto puo' avere:

- nome;
- slug;
- categoria;
- tipo: web, app, web+app;
- dominio;
- property GSC;
- website ID Umami;
- app ID Android;
- app ID iOS;
- note interne.

### SEO Opportunities

Vista dedicata alle opportunita' SEO.

Regole iniziali:

- query con tante impression e CTR basso;
- query in posizione 5-15;
- pagine in calo;
- pagine in crescita;
- nuove query emerse;
- pagine con impression ma pochi click;
- pagine con traffico Umami ma scarso risultato operativo.

### Analytics

Vista analytics web.

Metriche iniziali:

- visitatori;
- pageview;
- pagine migliori;
- referrer;
- paese;
- device, se disponibile;
- confronto 7/28/90 giorni.

### Apps

Sezione futura per app mobile.

Metriche possibili:

- installazioni;
- disinstallazioni;
- rating;
- review;
- crash;
- ANR;
- revenue;
- conversione listing;
- paesi principali.

### Reports

Report generati dal sistema.

Prima versione:

- report settimanale in markdown;
- elenco priorita';
- trend principali;
- opportunita' SEO;
- progetti da controllare.

### Settings

Configurazione:

- connector;
- credenziali;
- variabili ambiente;
- workspace locale;
- preferenze report;
- demo mode.

## Architettura v0.1

Per la prima versione non si parte con un monorepo. La struttura deve restare semplice, per arrivare prima a uno strumento utile.

```txt
openfindability/
  app/
  lib/
    connectors/
    db/
  scripts/
  docs/
    guide/
    operations/
    projects/
  private-notes/  # appunti privati locali, ignorati da git
  data/
```

Stack v0.1:

```txt
Next.js
TypeScript
file JSON locale per i dati iniziali
pnpm
```

Il monorepo con `apps/` e `packages/` puo' arrivare in v0.2 o v0.3, quando sara' chiaro cosa separare davvero.

## Modello dati iniziale

Entita' principali:

```txt
Project
DataSource
MetricSnapshot
SearchQuery
PageMetric
Opportunity
Report
ConnectorRun
```

Schema concettuale:

```txt
projects
- id
- name
- slug
- type
- website_url
- category
- notes
- created_at
- updated_at

data_sources
- id
- project_id
- type
- external_id
- config_json
- enabled
- created_at
- updated_at

metric_snapshots
- id
- project_id
- source
- date
- clicks
- impressions
- ctr
- avg_position
- visitors
- pageviews
- installs
- revenue
- raw_json
- created_at

search_queries
- id
- project_id
- source
- date
- query
- page
- country
- device
- clicks
- impressions
- ctr
- avg_position
- raw_json

opportunities
- id
- project_id
- type
- title
- description
- severity
- score
- status
- detected_at
- resolved_at
- raw_json

connector_runs
- id
- source
- project_id
- status
- started_at
- finished_at
- error_message
- stats_json
```

Regola importante:

```txt
Conservare sempre raw_json quando si importano dati da API esterne.
```

Questo permette di non perdere informazioni se il modello dati cambia.

## Connector

Ogni fonte dati deve essere implementata come connector indipendente.

Interfaccia concettuale:

```ts
interface Connector {
  id: string
  name: string
  source: "gsc" | "umami" | "google_play" | "app_store"

  testConnection(): Promise<ConnectorCheckResult>

  syncProject(params: SyncParams): Promise<SyncResult>
}
```

Regole:

- nessun connector deve scrivere direttamente nella UI;
- i connector devono salvare dati normalizzati e raw payload;
- ogni connector deve avere test minimi;
- ogni connector deve documentare env var richieste;
- ogni connector deve supportare una modalita' debug;
- errori e sync devono essere tracciati in `connector_runs`.

## API

L'app dovrebbe avere una API interna documentata.

Endpoint iniziali:

```txt
GET /api/projects
GET /api/projects/:id
GET /api/projects/:id/summary
GET /api/projects/:id/metrics
GET /api/projects/:id/opportunities
GET /api/opportunities
POST /api/sync/:source
GET /api/reports/weekly
```

L'API serve a:

- separare dashboard e dati;
- rendere piu' semplice il futuro MCP;
- rendere piu' facile il lavoro degli agenti;
- permettere una CLI piu' pulita;
- documentare bene il comportamento del sistema.

## Sync v0.1

La prima versione usa solo sync manuale.

```txt
v0.1: sync manuale da script o route handler
v0.2: GitHub Actions nightly + CLI sync
v0.3: scheduler interno, solo se serve davvero
```

Google Search Console deve supportare un backfill iniziale. Di default la v0.1 importa gli ultimi 30 giorni e termina due giorni prima della data corrente, perche' i dati GSC arrivano con ritardo.

Quando si aggiungera' un backfill piu' ampio, si potra' arrivare fino a 16 mesi di storico GSC, gestendo batch, retry e limiti API.

## CLI

La CLI deve essere minimale.

Comandi iniziali:

```bash
openfindability doctor
openfindability seed demo
openfindability sync all
openfindability sync gsc
openfindability sync umami
openfindability report weekly
```

Il comando piu' importante e':

```bash
openfindability doctor
```

Deve controllare:

- variabili `.env`;
- connessione database;
- migrazioni;
- credenziali connector;
- presenza dati demo;
- ultimo sync;
- errori recenti nei connector.

Nella v0.1 il doctor deve gia' esistere, perche' serve durante lo sviluppo e durante il primo setup locale.

## MCP

MCP non e' prioritario nella prima versione, ma va previsto.

Quando il core sara' stabile, si puo' aggiungere un server MCP read-only per permettere ad agenti AI di interrogare i dati.

Tool MCP futuri:

```txt
get_projects
get_project_summary
get_seo_opportunities
get_weekly_priorities
compare_projects
get_declining_pages
get_low_ctr_queries
```

Esempi di domande:

```txt
Quali progetti sono calati negli ultimi 28 giorni?
Quali pagine SEO devo aggiornare?
Quali query hanno piu' potenziale?
Generami un piano operativo per questa settimana.
```

## Documentazione agent-ready

Il repository deve essere facile da capire per Codex, Claude Code, Cursor e altri agenti.

File consigliati:

```txt
AGENTS.md
CLAUDE.md
docs/ai-agents.md
docs/architecture.md
docs/data-model.md
docs/connectors.md
docs/development.md
docs/tasks/add-connector.md
docs/tasks/add-dashboard-widget.md
docs/tasks/debug-sync.md
docs/tasks/add-opportunity-rule.md
```

`AGENTS.md` deve spiegare:

- scopo del progetto;
- struttura repo;
- comandi;
- convenzioni;
- regole sui secret;
- come aggiungere connector;
- come aggiungere widget;
- come aggiungere regole di opportunita';
- come verificare il lavoro.

`CLAUDE.md` puo' contenere istruzioni simili, ottimizzate per Claude Code.

## Open source setup

File necessari prima della pubblicazione:

```txt
README.md
LICENSE
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
ROADMAP.md
CHANGELOG.md
AGENTS.md
CLAUDE.md
.env.example
.github/
  ISSUE_TEMPLATE/
  PULL_REQUEST_TEMPLATE.md
  workflows/
```

Il README deve spiegare:

- cos'e' OpenFindability;
- per chi e';
- cosa supporta;
- screenshot o demo;
- setup rapido;
- uso con dati demo;
- roadmap;
- licenza MIT;
- come contribuire.

## Dati demo

Il progetto deve poter partire senza API reali.

Comandi utili:

```bash
pnpm seed:demo
pnpm dev:demo
```

I dati demo devono includere:

- 3-5 progetti finti;
- metriche GSC finte;
- metriche Umami finte;
- opportunita' SEO finte;
- report settimanale finto.

Questo e' importante per:

- sviluppo locale;
- screenshot;
- contributi open source;
- test;
- onboarding di nuovi utenti.

## Sicurezza

Non devono mai essere committati:

- token Google Search Console;
- token Umami;
- service account Google;
- chiavi App Store Connect;
- dati reali dei propri progetti;
- dati clienti;
- metriche private;
- file `.env` reali.

Nel repository devono esserci solo:

- `.env.example`;
- fixture anonime;
- dati demo;
- screenshot con dati finti.

## Roadmap

### v0.1 - Web Core

- gestione progetti;
- Google Search Console connector;
- Umami connector;
- import manuale;
- dashboard base;
- opportunita' SEO;
- dati demo;
- MIT license.

### v0.2 - Open Source Ready

- README completo;
- documentazione setup;
- AGENTS.md;
- CLAUDE.md;
- CONTRIBUTING.md;
- ROADMAP.md;
- CLI `doctor`;
- GitHub Actions;
- issue template;
- PR template.

### v0.3 - Reports

- report settimanale;
- priorita' operative;
- export markdown;
- scoring opportunita';
- storico report.

### v0.4 - Mobile

- Google Play connector;
- App Store Connect connector;
- installazioni;
- rating;
- review;
- crash/ANR.

### v0.5 - Agent Integration

- API piu' stabile;
- OpenAPI;
- MCP read-only;
- query naturali sui dati;
- documentazione per agenti.

### v1.0 - Self-hosted Stable

- installazione documentata;
- Docker;
- scheduler;
- auth semplice;
- backup;
- test solidi;
- UI stabile.

## Cosa evitare all'inizio

Per non allargare troppo il progetto, evitare nella prima fase:

- SaaS hosted;
- pagamenti;
- billing;
- team complessi;
- white label;
- AI advisor troppo avanzato;
- competitor tracking completo;
- ricerca keyword SEO stile Semrush;
- ricerca ASO stile AppTweak;
- troppe integrazioni contemporaneamente.

La priorita' e' creare uno strumento utile, stabile e usabile.

## Definizione di done per la prima versione

La prima versione e' pronta quando:

- si possono creare progetti;
- si puo' collegare almeno GSC;
- si puo' collegare almeno Umami;
- si possono importare dati;
- si vedono trend 7/28 giorni;
- si vedono opportunita' SEO;
- esiste un report settimanale base;
- il progetto parte con dati demo;
- il README permette a un altro sviluppatore di provarlo;
- non ci sono secret nel repo;
- la licenza MIT e' presente.

## Sintesi

OpenFindability deve partire come strumento personale, open source e self-hosted.

La prima fase deve essere concentrata su:

```txt
Google Search Console + Umami + progetti + opportunita' SEO + report settimanale
```

Tutto il resto puo' arrivare dopo.

La direzione migliore e':

```txt
Prima utile per me.
Poi pulito per altri.
Poi estendibile con connector.
Poi interrogabile da agenti.
```

Il valore del progetto non e' raccogliere dati, ma trasformarli in decisioni operative.
