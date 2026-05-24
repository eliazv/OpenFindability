# Prima versione open source

Questo documento chiarisce cosa mettere davvero nella prima versione pubblicabile di OpenFindability.

L'obiettivo resta semplice:

```txt
GSC + Umami + progetti + opportunita' operative SEO + demo data + docs chiare.
```

## Cosa integrare subito

### Next.js

Gia' presente.

Motivo:

- app locale semplice;
- route handler per API minime;
- facile da pubblicare e far provare;
- non richiede monorepo.

### pnpm

Gia' presente.

Comandi base:

```bash
pnpm install
pnpm seed:demo
pnpm dev
pnpm run doctor
pnpm run sync
pnpm typecheck
pnpm build
```

### Google Search Console API

Gia' presente come connector base.

Da portare dagli script esistenti:

- CTR opportunity con CTR atteso per posizione;
- query in posizione 5-15;
- query in pagina 2;
- query con impression e zero click;
- possibile cannibalizzazione query su piu' URL;
- confronto corrente vs periodo precedente, nella fase report.

### Umami API

Gia' presente come connector base.

Da aggiungere progressivamente:

- top pages;
- referrer;
- country;
- device;
- cross-check con GSC: pagine viste molto su Umami ma deboli in organico, o viceversa.

### Demo data

Gia' presente.

Fondamentale per open source perche' permette di provare il progetto senza credenziali.

### MIT

Gia' presente.

Scelta corretta per questa fase: poca frizione, facile riuso, semplice da capire.

### AGENTS.md e CLAUDE.md

Gia' presenti.

Servono a tenere Codex, Claude Code e altri agenti dentro il perimetro giusto:

- niente SaaS;
- niente monorepo per ora;
- niente cron complessi;
- focus su GSC, Umami e opportunita' operative.

## Cosa usare solo come ispirazione per ora

### Metabase

Non integrarlo nella v0.1.

Utile come riferimento per:

- tabelle filtrabili;
- query esplorative;
- dashboard su metriche.

Potrebbe diventare una guida opzionale piu' avanti: "collega Metabase al DB".

### Grafana

Non integrarlo nella v0.1.

Utile come riferimento per:

- time-series;
- alert;
- pannelli metriche.

Troppo tecnico per il core iniziale.

### RespectASO

Non integrarlo nella v0.1.

Da tenere come riferimento per la futura parte ASO:

- keyword app store;
- competitor;
- paesi;
- trend;
- difficolta' keyword.

La v0.1 deve restare web-first.

### app-store-scraper / google-play-scraper

Non integrarli subito.

Sono utili quando si aggiungera':

- store listing;
- recensioni;
- rating;
- metadata app;
- ranking base.

Prima serve rendere solida la parte GSC/Umami.

### Fumadocs

Non integrarlo subito.

Per ora bastano `README.md`, `AGENTS.md`, `CLAUDE.md` e docs markdown.

Lo valuterei quando la documentazione cresce davvero.

### Scalar / OpenAPI

Non integrarlo subito.

Prima stabilizzare API e dati. OpenAPI ha senso dopo che gli endpoint sono meno provvisori.

### MCP

Non integrarlo subito.

Molto coerente col progetto, ma solo dopo avere:

- dati reali;
- opportunita' affidabili;
- API interne stabili;
- report settimanale utile.

### n8n

Non integrarlo subito.

Puo' diventare un'integrazione opzionale per automazioni e notifiche, ma non deve condizionare il prodotto.

## Cosa non mettere nella prima versione

- Supabase/Postgres obbligatorio;
- monorepo;
- shadcn/ui obbligatorio;
- Fumadocs;
- Scalar;
- MCP;
- Google Play;
- App Store Connect;
- billing;
- auth complessa;
- scheduler interno;
- cron automatici;
- AI advisor avanzato;
- competitor tracking;
- keyword research SEO/ASO completa.

## Cosa aggiungere alla v0.1 prima di pubblicarla

Priorita' reale:

1. Pagina Projects con elenco e dettaglio.
2. Pagina Opportunities filtrabile per progetto/tipo/severita'.
3. Report markdown settimanale generabile da comando `pnpm run report`.
4. Configurazione progetti piu' comoda, anche solo JSON documentato.
5. Top pages Umami.
6. Top queries GSC.
7. Periodo corrente vs periodo precedente.
8. Screenshot demo nel README.
9. `CONTRIBUTING.md`.
10. `ROADMAP.md`.

## Sintesi

Per la prima versione open source, gli unici "pezzi esterni" davvero da mettere sono:

```txt
Next.js
pnpm
Google Search Console API
Umami API
MIT license
Markdown docs agent-ready
```

Tutto il resto deve restare reference o roadmap.

La v0.1 deve dimostrare una cosa sola:

```txt
Collego GSC e Umami ai miei progetti e ottengo priorita' SEO utili.
```
