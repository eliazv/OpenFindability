# Google Search Console → Google Sheets → OpenFindability (Apps Script giornaliero)

> **Stato aggiornato (2026-10-11):** implementati il codice Apps Script (`integrations/google-sheets-gsc/Code.gs`), il manifest e l\u0027esportatore `OF_*` nel branch `feat/ga4-gsc-sheets-incremental-2026-10-11`. **Autorizzazione e trigger Google non ancora attivati**: istruzioni operative in [`google-sheets-live-setup.md`](google-sheets-live-setup.md). Questo documento conserva le decisioni architetturali di partenza.  
> **Data:** 2026-10-11  
> **Obiettivo:** accedere da ChatGPT Mobile ai dati SEO di tutti i siti, senza Windsor.ai o abbonamenti, mantenendo una futura integrazione pulita con OpenFindability.  
> **Decisione consigliata:** Google Sheets privato, alimentato direttamente da Search Console con Apps Script ogni giorno; OpenFindability lo legge opzionalmente quando è in esecuzione. **Non** rendere la sincronizzazione del foglio dipendente dall'accensione del PC.

## TL;DR / Decisioni

1. **Google Search Console è la fonte primaria**. Un unico Google Sheet raccoglie ogni giorno metriche aggregate, pagine e query, separate per proprietà e giorno.
2. **Google Apps Script è lo scheduler**: trigger giornaliero intorno alle **06:00 Europe/Rome** (orario indicativo, i time-driven trigger possono variare). Autenticazione OAuth dell'account che possiede/può leggere le proprietà GSC; nessuna chiave JSON nel foglio o nello script.
3. **Google Sheets è il livello di consultazione e storico per ChatGPT Mobile**, attraverso il collegamento Google Drive/Sheets già disponibile. Non è un database operativo né un MCP remoto.
4. **OpenFindability rimane local-first su SQLite**. Aggiungere dopo un importatore read-only da Google Sheets che riusa le tabelle e gli upsert esistenti. Lasciare il connettore GSC diretto e il MCP locale disponibili.
5. **Niente GitHub Actions, server 24/7, Vercel Cron, SaaS, Windsor.ai o pagamenti.** Apps Script gira lato Google anche a PC spento.
6. **Mai sommare proprietà sovrapposte**: la domain property `sc-domain:vitaromagna.it` e la property `https://www.vitaromagna.it/` non sono due siti indipendenti. Il foglio conserva un identificativo canonico e una property scelta come primaria.

## Verifica dello stato attuale del repository (branch `master` al 2026-10-11)

| File reale | Situazione | Implicazione |
| --- | --- | --- |
| `lib/connectors/gsc.ts` | Usa `googleapis`, `GoogleAuth` con `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_SERVICE_ACCOUNT_FILE`, `webmasters.readonly` e `syncGscProject()`. | Autenticazione e tipi da riutilizzare per l'import Sheet, non per il job Apps Script. |
| `lib/connectors/gsc.ts` | Interroga `[date]`, `[query,page]`, `[page]`, device, country, searchAppearance e sitemap. Imposta `rowLimit: 25000` e `startRow: 0` senza paginazione. | Sui siti grandi tronca i risultati; non confondere le top row con il totale GSC. |
| `lib/connectors/gsc.ts` | Le query e le pagine sono aggregate sull'intero intervallo `startDate..endDate`, ma salvate entrambe con `date: endDate`. | **Incompatibilità semantica** con uno storico veramente giornaliero: correggere o tenere le granularità distinte prima di importare. |
| `lib/sync.ts`, `scripts/sync.ts` | Sync manuale; GSC usa default ultimi 30 giorni fino a D-2; upsert per progetto/data, progetto/data/query/pagina, progetto/data/pagina. | Non è uno scheduler affidabile quando il computer è spento. Chiavi di upsert riutilizzabili solo dopo aver allineato la granularità. |
| `lib/db/schema.ts`, `lib/types.ts` | Tabelle `metricSnapshots`, `searchQueries`, `pageMetrics`, `gscDimensionBreakdowns`, `connectorRuns`, `projects.gscProperty`. | È possibile importare nel DB esistente senza introdurre Supabase, PostgreSQL o nuove tabelle obbligatorie. |
| `mcp/server.ts` | MCP locale con query live GSC; README documenta tool quali `get_gsc_stats`, `compare_periods`, `get_page_keywords`. | Non risolve il solo accesso ChatGPT Mobile; resti operativo da Claude Code/CLI. |
| `README.md`, `AGENTS.md` | Progetto local-first SQLite, credenziali in `secrets/google/`, reports privati ignorati, niente segreti nel git. | Non introdurre un backend remoto solo per il foglio. |

**Problema da risolvere prima dell'import:** la riga `pageMetrics.date=2026-10-09` potrebbe rappresentare nel codice attuale una pagina aggregata su 30 giorni, *non* i clic di quella sola data. La nuova sincronizzazione diretta scrive date giornaliere vere con marker `_openfindability.grain=day`. Le vecchie righe aggregate restano archiviate nel DB, ma sono escluse dalle analisi giornaliere tramite `lib/gsc-detail.ts`. L\x27import futuro da Sheets deve mantenere lo stesso contratto di granularità e non mescolare i due formati.

## Architettura di destinazione

```text
                     Google Search Console API
                             |
                OAuth account Google (sola lettura GSC)
                             |
                  Google Apps Script (cloud)
                  trigger 1 volta al giorno
                             |
                 Google Sheet PRIVATO
          Properties / Daily / Pages / Queries
             Overview / Opportunities / SyncLog
                      /           \
                     /             \
         ChatGPT Mobile         OpenFindability (PC)
         Google Drive app       Sheets API read-only
         lettura dei tab        importa in SQLite
                                  |
                             dashboard / CLI
                             MCP locale / report
```

Il flusso è **GSC → Sheet → lettori**. Nella prima fase il repository continua a usare anche il suo connettore GSC diretto: questo non crea duplicati se *non* si esegue un'importazione Sheet nello stesso dataset prima di sistemare le granularità. Non pianificare due job indipendenti che scrivono contemporaneamente le stesse metriche.

## Foglio unico: contratto dati v1

Creare un Google Sheet privato chiamato per esempio `SEO — Search Console (OpenFindability)`, con queste schede **a nomi stabili**, intestazioni stabili e schema versionato. I valori qui sotto sono nomi di colonna, non statistiche reali.

### `Properties` (configurazione manuale/semiautomatica)

`property | site_key | project_slug | label | enabled | primary | search_type | last_ok_date | notes`

- `property`: identificatore API **esatto**, ad es. `sc-domain:vitaromagna.it`.
- `site_key`: dominio canonico o id stabile del sito; usato per le aggregazioni e per il dedup.
- `project_slug`: slug del progetto OpenFindability, se esistente.
- `enabled`: consente di escludere proprietà non desiderate senza eliminare lo storico.
- `primary`: una sola proprietà primaria per `site_key + search_type`. Le property URL-prefix sovrapposte rimangono disabilitate/esplorabili, **non vengono sommate**.
- `search_type`: `web` nell'MVP; `image`, `video`, `news`, `discover` solo se abilitate e supportate dalla singola proprietà.

La prima volta lo script può usare l'endpoint `sites.list` per proporre i siti accessibili dall'account Google. **Non attivare automaticamente tutte le proprietà**: verificare la selezione e l'associazione degli slug, specialmente sottodomini, duplicati URL-prefix e siti clienti. Le 13 proprietà precedentemente visibili su Windsor.ai sono un indizio utile, non la prova delle autorizzazioni dell'account che eseguirà Apps Script.

### `Daily` (totali canonici per giorno e proprietà)

`site_key | property | date | search_type | clicks | impressions | ctr | position | aggregation | fetched_at | is_final`

- Chiave univoca logica: `property + date + search_type + aggregation`.
- Per il report principale preferire aggregazione **per proprietà**, coerente tra giorni. `ctr` in decimale (es. `0.035` = 3,5%), `position` media GSC.
- Totali ricavati con richiesta separata dimensione `date` (non somma di `Pages` o `Queries`).
- Mai scrivere una riga tutta zero per un giorno non ancora disponibile: distingue **nessun dato** da **zero reali**.

### `Pages` (landing per giorno)

`site_key | property | date | search_type | page | clicks | impressions | ctr | position | fetched_at | coverage`

Chiave: `property + date + search_type + page`. `coverage` = `complete` / `top_rows_only` a seconda della paginazione/cap. Gli aggregati per pagina possono seguire regole di calcolo diverse dai totali per proprietà: **non presentare la somma Pages come traffico totale**.

### `Queries` (query per giorno)

`site_key | property | date | search_type | query | clicks | impressions | ctr | position | fetched_at | coverage`

Chiave: `property + date + search_type + query`. Le query anonime/limitate non sono tutte restituite dall'API. Conservarle per opportunità e ranking, non per ricostruire i totali.

**Nota:** non includere inizialmente tutte le combinazioni `date + query + page + country + device`: cardinalità enorme, maggiore costo API, esaurimento righe e peggioramento dell'esperienza ChatGPT. L'analisi per singola pagina con query può rimanere live in OpenFindability oppure essere aggiunta più avanti, con filtro, cap e tab dedicato.

### `Overview` e `Opportunities` (viste leggere per ChatGPT)

- `Overview`: una riga per sito con `last_complete_date`, click/impression 7 e 28 giorni, periodi precedenti, delta percentuali, CTR ponderato, posizione media ponderata, stato aggiornamento. Meglio valori materializzati da script/formule semplici, **non query di decine di migliaia di celle ad ogni lettura**.
- `Opportunities`: fino a 10–30 righe per sito, 28 giorni vs 28 giorni precedenti: query con tante impression/CTR basso, query con posizione 5–15, pagine in calo, pagine in crescita. Applicare soglie minime e includere fonte, finestra, numeri a supporto, `generated_at`. Separare opportunità *calcolate dal foglio* da quelle del motore OpenFindability.
- CTR di periodo = `SUM(clicks) / SUM(impressions)`. Posizione di periodo = `SUM(position * impressions) / SUM(impressions)` **solo con righe della stessa granularità e aggregazione**; mai media semplice di CTR o posizione e mai sommare le posizioni.
- Comparazioni 28 vs 28 e 7 vs 7 devono usare **finestre complete equivalenti**, agganciate all'ultimo giorno finalizzato comune; se lo storico è insufficiente indicare `insufficient_history`.

### `SyncLog` (telemtria)

`run_id | started_at | finished_at | property | target_dates | status | daily_rows | page_rows | query_rows | partial | error_code | error_excerpt`

Aggiungere in `Overview` un indicatore visibile `LAST_SYNC_OK` e `DATA_FRESHNESS_DAYS`. Errori di una proprietà non devono cancellare i dati precedenti o bloccare tutte le altre.

## Frequenza e recupero storico

**Trigger Apps Script:** `timeBased().atHour(6).everyDays(1).inTimezone('Europe/Rome')`; attenzione: l'esecuzione non è garantita alle 06:00 esatte.

**MVP giornaliero suggerito:**

1. Per ogni proprietà primaria abilitata, richiedere `Daily` per gli ultimi **10 giorni** (una query con dimensione `date`), `type=web`, `dataState=final`.
2. Definire il giorno utile più recente presente nella risposta; in prima battuta aspettarsi D-2/D-3 ma **non assumere** che un giorno sia completo se l'API non lo restituisce.
3. Recuperare `Pages` e `Queries` per **1 giorno finalizzato nuovo** e correggere eventuali giorni recenti che risultano incompleti, limitando il lavoro per esecuzione (es. max 2–3 giorni per property e cap di righe configurabile).
4. **Upsert idempotente** per chiave, non `append` cieco. Se cambia una riga, sovrascrivere quella chiave. Eliminare solo le righe *della specifica property/data/granularità* dopo che il nuovo dataset è stato ricevuto e validato; non azzerare il tab in caso di errore.
5. Se una proprietà è indietro, registrare in `SyncLog` il backlog e proseguirlo nei trigger successivi (checkpoint via `PropertiesService`). Retries con exponential backoff per 429/5xx.
6. Validare il tempo residuo ed uscire pulitamente prima del limite di Apps Script (attualmente 6 minuti/esecuzione). Usare `LockService` per evitare job concorrenti e `setValues` a blocchi, evitando `appendRow` per ogni risultato.
7. Mantenere il tab Overview aggiornato solo da dati finali, indicando esplicitamente freschezza e copertura.

**Backfill iniziale:** separato dal trigger giornaliero. Partire con 90 giorni di `Daily` per tutte le property primarie; popolare `Pages`/`Queries` a blocchi (es. ultimi 28 giorni, poi espandere) con checkpoint per riprendere senza timeout. Non tentare 16 mesi × tutte le property × query/pagine in una singola esecuzione.

**Limiti da rispettare:** `searchanalytics.query` permette `rowLimit <= 25000` e `startRow`, ma la piattaforma **non garantisce tutte le righe**: massimo documentato 50.000 righe al giorno per tipo di ricerca. Queries+Pages sono breakdown parziali; le query più onerose (query+page) vanno evitate di default. Monitorare sia quote GSC sia quote Apps Script. Per grandi siti usare un massimo configurabile per dettaglio, con segnalazione `top_rows_only` e non chiamare il dataset “completo”.

## Accesso a ChatGPT Mobile

1. Conservare il Google Sheet nel proprio Google Drive **privato** (eventuale cartella `ChatGPT`).
2. Continuare a usare il collegamento Google Drive/Sheets di ChatGPT già autorizzato: quando si chiede un report, leggere principalmente `Overview`, `Opportunities` e range selezionati di `Daily`/`Pages`/`Queries`.
3. Prompt possibile: “Leggi il foglio SEO — Search Console (OpenFindability). Confronta gli ultimi 28 giorni finalizzati di VitaRomagna con i 28 precedenti; trova 10 URL o query con opportunità misurabili, distinguendo dati completi e top rows”.
4. **Limite esplicito:** il collegamento Drive legge lo snapshot sincronizzato, non è una Search Console API arbitraria in tempo reale e l'accesso alla singola tab/range dipende dalle azioni disponibili nella connessione ChatGPT. Validare con un report reale da Android.
5. I siti clienti devono essere presenti solo se si hanno i relativi permessi e se i dati possono essere letti nella propria area ChatGPT. Non condividere il foglio “chiunque abbia il link”.

## Collegamento OpenFindability, senza duplicare pipeline

### Fase 1 (foglio funzionante, nessuna modifica al runtime OpenFindability)

- Versionare Apps Script nel repo come **codice**, non pubblicare credenziali né l'ID del foglio personale.
- Percorso da aggiungere: `integrations/google-sheets-gsc/appsscript.json` + `Code.gs` (+ README); installazione manuale come script associato al foglio oppure con clasp in futuro.
- `appsscript.json`: scope minimi `spreadsheets.currentonly` (se bound e sufficiente), `script.external_request`, `webmasters.readonly` e scope relativi alla gestione trigger ove richiesti. Verificare effettivamente i permessi alla prima esecuzione.
- Usare `ScriptApp.getOAuthToken()` e `UrlFetchApp.fetch('https://www.googleapis.com/webmasters/v3/sites/.../searchAnalytics/query', ...)` con il Bearer token; **non** trasferire il service account di OpenFindability dentro Apps Script.
- Manifestare nei metadati `schema_version=1`, fuso `Europe/Rome`, data ultimo sync e provenienza dati.

### Fase 2 (importatore Google Sheets → SQLite)

File proposti:

- `lib/connectors/gsc-sheets.ts`: Sheets API read-only con `GOOGLE_SERVICE_ACCOUNT_FILE` o `GOOGLE_SERVICE_ACCOUNT_JSON`, scope `spreadsheets.readonly`, schema/headers validation, lettura a range.
- `scripts/gsc-sheet-import.ts`: CLI opt-in `pnpm run gsc:sheet:import`, supporto `--dry-run`, `--slug`, `--from`, `--to`.
- `lib/sync.ts`: riuso degli upsert dopo normalizzazione giornaliera corretta; registrare con `connectorRuns` origine `sheet` nei metadati, oppure introdurre una fonte `gsc_sheet` **solo se** si decide di conservarla distinta senza cambiare i conteggi di default.
- `.env.example`: `GSC_SHEET_ID=` (non segreto ma privato) e flag opzionale `GSC_SHEET_IMPORT_ENABLED=false`. Non confondere `GSC_SHEET_ID` con l'ID del progetto Google Cloud.
- `docs/guide/`: una guida di setup riproducibile, diagnostica e checklist permessi.

**Setup accesso:** Google Sheet condiviso soltanto con l'email del service account già usato da OpenFindability (ruolo Lettore). Apps Script usa l'OAuth dell'utente proprietario; OpenFindability usa la propria credenziale in lettura per lo stesso file. Verificare che l'account personale che esegue lo script abbia accesso a **tutte le property selezionate**, che può differire dai permessi del service account.

**Regola di conflitto:** per progetto scegliere esplicitamente *una* sorgente di importazione persistente, `direct_gsc` (default attuale) **oppure** `sheet`. Non eseguire `syncGscProject` con range aggregato e `gsc-sheet-import` sulle medesime serie mischiandone i record. Il MCP può continuare a leggere GSC live senza scrivere sul DB. Solo quando la granularità è stata corretta/normalizzata scegliere una strategia di import predefinita.

**Import delle schede:**

- `Daily` → `metricSnapshots` (projectId mappato esattamente da `Projects.gscProperty`/tab `Properties`, `source='gsc'`, `date` reale).
- `Queries` → `searchQueries` (date reale, `query`, senza `page` se non presente; se serve breakdown query+page estendere schema, non inventare `page`).
- `Pages` → `pageMetrics` (date reale).
- I dati GSC device/country/searchAppearance e sitemaps **restano al connettore diretto**; il foglio MVP non li replica.
- `rawJson` può includere `{ origin:'gsc_sheet', property, fetched_at, coverage, schema_version }` senza credenziali.
- Se un `project_slug` non esiste nel DB oppure due property corrispondono allo stesso progetto, **skip con errore esplicito**; niente auto-creazione di progetti o somma.

### Fase 3 (opzionale, NON necessaria al primo rilascio)

Aggiungere `pnpm run gsc:sheet:publish-opportunities` per scrivere nel tab `OpenFindability_Opportunities` risultati generati dal motore locale, **solo su richiesta dell'utente quando il PC è acceso**, con permesso Sheets di scrittura limitato al documento. Non promettere pubblicazione quotidiana da un ambiente locale. In alternativa, mantenere le opportunità materializzate da Apps Script e lasciare OpenFindability come motore indipendente: meno complessità.

## Test e criteri di accettazione

- [ ] `sites.list`: elenca solo proprietà realmente accessibili dall'account Apps Script; selezione manuale delle primarie.
- [ ] Allineamento: su almeno 3 property diverse, click e impression del tab `Daily` coincidono con GSC UI/API per gli stessi giorni, stesso tipo ricerca e stessa aggregazione (tenendo conto di eventuali differenze di definizione).
- [ ] Duplicati: domain property e URL-prefix sovrapposte non vengono sommate in `Overview`.
- [ ] Un secondo sync dello stesso intervallo non aggiunge righe duplicate e aggiorna i valori modificati.
- [ ] Una proprietà con permessi mancanti/errore 429 o 5xx non azzera lo storico delle altre.
- [ ] Recovery: job interrotto per timeout riprende da checkpoint, e `SyncLog` espone eventuali parzialità.
- [ ] Backfill 90 giorni `Daily`; ultimi 28 giorni di pagine/query per i siti selezionati, rispettando quote e limiti.
- [ ] Periodi 7/28 giorni e CTR/posizione ponderati calcolati correttamente, senza sommare `Pages`/ `Queries` ai totali.
- [ ] Test ChatGPT da Android: legge effettivamente `Overview`/`Opportunities` tramite il connettore Drive, riporta `last_complete_date`.
- [ ] Prima di attivare `gsc:sheet:import`: test di import sulle stesse date di uno snapshot GSC verificato, assenza di record misti “range aggregato attribuito a endDate” vs giornaliero; backup SQLite locale.
- [ ] Nessun JSON service account, token OAuth, dato SEO reale di clienti, URL privato del foglio o chiave copiati nel git; nessun workflow GitHub Action.

## Ordine di implementazione consigliato

| Priorità | Passo | Criterio “finito” |
| --- | --- | --- |
| **P0** | Script Apps Script + tab `Properties`/`Daily`/`SyncLog` e trigger | I totali arrivano ogni giorno in Sheet, anche a PC spento. |
| **P0** | `Overview` per sito + collegamento ChatGPT Mobile | Puoi confrontare tutti i siti da smartphone con dati e freschezza esposti. |
| **P1** | `Pages`/`Queries` + `Opportunities`, backfill, limiti per property | 28 giorni di analisi SEO operativa senza timeout o falsa completezza. |
| **P1** | Sistemazione granularità `lib/connectors/gsc.ts` e test di regressione | Dati daily separati da aggregati di intervallo, nessuna storia falsata. |
| **P2** | Import read-only Sheets → OpenFindability, CLI opt-in | Lo stesso dato giornaliero entra in SQLite con mapping e upsert sicuri. |
| **P3** | Publish opzionale delle opportunità OpenFindability | Disponibile manualmente, solo se ne emerge un vantaggio concreto. |

Non è necessario rifare la dashboard OpenFindability, installare Fastlane, introdurre Supabase/cloud DB, o costruire un MCP remoto per questo caso d'uso. **Primo valore concreto:** leggere tutti i siti da ChatGPT Mobile sul foglio aggiornato ogni giorno.

## Riferimenti ufficiali (verificati ottobre 2026)

- Google Search Console Search Analytics API: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Query all your search traffic (limiti 50k righe/giorno/tipo e paginazione): https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data
- Search Console API usage quotas: https://developers.google.com/webmaster-tools/limits
- Apps Script token OAuth per altre Google API: https://developers.google.com/apps-script/reference/script/script-app#getoauthtoken
- Apps Script trigger giornalieri: https://developers.google.com/apps-script/reference/script/clock-trigger-builder
- Apps Script quote/6 minuti per esecuzione: https://developers.google.com/apps-script/guides/services/quotas

## Fuori scope

Questa è **solo un'analisi/decisione architetturale**, non una funzionalità già implementata: nessun Google Sheet creato, nessun Apps Script pubblicato, nessun trigger avviato, nessuna modifica al database e nessun workflow GitHub Actions eseguito in questo intervento.
