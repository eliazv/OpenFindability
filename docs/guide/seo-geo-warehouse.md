# MotherDuck, Bing, Cloudflare e Clarity

SQLite rimane il database operativo locale. MotherDuck contiene una replica analitica opzionale interrogabile via SQL e tramite il collegamento MotherDuck di ChatGPT. Google Sheets non è necessario per questo flusso; l'export esistente rimane disponibile.

## Configurazione

Le credenziali si conservano in `.env`, mai nel database remoto:

```env
MOTHERDUCK_API_TOKEN=
MOTHERDUCK_DATABASE=openfindability
BING_WEBMASTER_API_KEY=
CLOUDFLARE_API_TOKEN_2=
MICROSOFT_CLARITY_TOKEN=
```

`CLOUDFLARE_API_TOKEN` è un alias alternativo; `_2` ha precedenza. Occorrono Zone Read per discovery e Analytics Read per le statistiche. La sola gestione DNS non produce dati crawler: le richieste devono attraversare il proxy Cloudflare.

Il token Bing vale per le proprietà verificate dell'account. I token Clarity sono specifici di un progetto: per altri siti aggiungere altre variabili, per esempio `CLARITY_PORTFOLIO_TOKEN`, e configurare il nome della variabile sul progetto locale.

## Individuazione e collegamento dei siti

```powershell
pnpm.cmd run discover:seo-geo
pnpm.cmd exec tsx scripts/discover-seo-geo.ts --apply
```

Il primo comando è un dry-run. Il secondo salva gli abbinamenti locali: Bing usa l'URL esatto restituito dalle proprietà verificate; Cloudflare cerca la zona attiva più specifica; Clarity riconosce il dominio nelle URL dell'export e collega il token globale solo quando corrisponde a un unico progetto locale. Il confronto ammette la variante `www`; non associa domini diversi o applicazioni usando il solo nome commerciale. Le proprietà non associate sono elencate per la revisione.

Gli abbinamenti manuali usano il comando di modifica progetto:

```powershell
pnpm.cmd exec tsx scripts/update-project.ts --slug example --bing https://example.com/
pnpm.cmd exec tsx scripts/update-project.ts --slug example --cloudflare-zone ZONE_ID
pnpm.cmd exec tsx scripts/update-project.ts --slug example --clarity-token-env CLARITY_EXAMPLE_TOKEN
```

`--clarity-project` conserva facoltativamente l'ID del progetto; l'API Data Export autentica il progetto tramite il token, senza un parametro project ID. La API non offre qui una discovery completa dei progetti Clarity. Con zero traffico l'abbinamento da URL può risultare impossibile: impostarlo manualmente.

## Sync delle fonti

```powershell
pnpm.cmd run sync:bing
pnpm.cmd run sync:cloudflare-ai
pnpm.cmd run sync:clarity
```

Le tre fonti partecipano anche al normale `pnpm run sync`. Si tratta di letture delle API con persistenza locale; ogni risultato è registrato in `connector_runs`. I record mantengono `rawJson` in SQLite. Nessun servizio viene installato sui siti, nessuna proprietà viene creata o verificata sui provider e nessun cron viene avviato.

- **Bing:** endpoint JSON REST `GetUserSites`, `GetRankAndTrafficStats`, `GetQueryStats`, `GetPageStats`. Totali giornalieri in `metric_snapshots`, dati e dettagli in `seo_geo_observations`. Il periodo locale predefinito è 30 giorni, applicato alle date restituite; questi metodi non accettano un backfill arbitrario. Le date Microsoft mantengono l'offset del provider. Le query/pagine sono top rows e la loro data non viene interpretata come grana giornaliera: sono `provider_period`. Una risposta vuota indica dati non restituiti, non uno zero misurato. Le API non importano citazioni AI Performance.
- **Cloudflare:** GraphQL `httpRequestsAdaptiveGroups`, ultime 23 ore UTC complete, raggruppate per ora/user-agent/host/path/status HTTP. Il campo `avg.sampleInterval` e il metodo di rilevamento sono conservati. Il limite di 10.000 gruppi produce stato `partial`; le finestre complete sostituiscono i gruppi già importati della stessa finestra, mentre quelle troncate preservano lo storico. Il dominio deve corrispondere al sito del progetto, anche quando più siti condividono una zona. Una osservazione separata di copertura conserva anche l'esito di una finestra senza gruppi. Le richieste sono campionate e il solo user-agent è falsificabile; non sono citazioni AI.
- **Clarity:** un export per sync/progetto con `numOfDays=1&dimension1=URL`, senza retry su 429 per preservare la quota. Le finestre sono mobili delle ultime 24 ore e i confini sono approssimati al momento di richiesta. Le finestre sovrapposte non si sommano. Si importano solo URL del dominio configurato. Nessun replay o identificatore di sessione viene acquisito. Il provider limita a 10 richieste al giorno e 1.000 righe senza paginazione: questi dati non sono un inventario completo e non consentono backfill oltre 3 giorni.

Se non si esegue manualmente il sync con sufficiente frequenza, Clarity e Cloudflare hanno buchi di copertura. L'assenza di righe non prova assenza di traffico.

## Replica MotherDuck

```powershell
pnpm.cmd run sync:warehouse
pnpm.cmd exec tsx scripts/sync-warehouse.ts --verify-local
pnpm.cmd exec tsx scripts/sync-warehouse.ts --apply
```

Il comando predefinito crea soltanto uno snapshot temporaneo coerente SQLite, mostra tabelle/colonne/conteggi e lo rimuove. Non contatta MotherDuck. `--verify-local` esegue la replica completa e costruisce le viste in DuckDB in memoria, sempre senza rete, per verificare anche i tipi e gli aggregati su dati reali. `--apply` crea il database cloud indicato e trasferisce i dati. Usa il driver Node DuckDB distribuito come dipendenza del progetto; non serve un server aggiuntivo.

Sono incluse 20 tabelle: progetti (campi pubblicabili selezionati), metriche giornaliere, query/pagine GSC, opportunità, stato sync, breakdown GSC, sitemap, audit indicizzazione, mediazione AdMob, Play vitals/installazioni, download iOS, keyword/rank ASO, osservazioni SEO/GEO, conversioni GA4 per landing/canale, prestazioni CrUX/PageSpeed e registro degli interventi. Le query/pagine GSC legacy aggregate sono escluse; resta tutto lo storico realmente giornaliero. Per le nuove fonti vedere [conversioni, prestazioni e interventi](conversions-performance-interventions.md).

Non vengono trasferiti `raw_json`, chiavi dei progetti, note private, percorsi locali, token mapping, testi recensioni, copy degli store, errori sync o payload diagnostici dei run. Query, URL, importi, metriche e contenuti delle opportunità restano dati privati e sono parte del trasferimento autorizzato.

La replica calcola hash SHA-256 per tabella/progetto/mese su uno snapshot SQLite coerente. Ricarica soltanto le partizioni cambiate, verifica i conteggi e aggiorna il relativo manifest nella stessa transazione remota. Rimuove anche righe/partizioni eliminate dalla sorgente. Ogni tabella si pubblica atomicamente; un errore può lasciare tabelle aggiornate in momenti diversi. La successiva esecuzione riprende dai manifest già completati. La lettura e l'hashing locale esaminano comunque l'intero dataset: è incrementale il trasferimento, non la scansione locale.

`warehouse_runs` mostra stato e tempi del caricamento; `warehouse_sync_state` contiene hash, conteggi e snapshot per partizione. Un database remoto preesistente con tabelle estranee viene rifiutato prima di modificarle. Lo schema remoto è versione 3, con proprietà registrata in `warehouse_metadata` e migrazioni additive versionate. Le partizioni aggiornate conservano gli ID tramite MERGE e rimuovono solo le righe obsolete, evitando conflitti dei vincoli unici durante cancellazioni/reinserimenti. Il warehouse è una replica selettiva, non sostituisce `db:backup`.

Le quote e i costi dipendono dal piano MotherDuck. Consultare [prezzi correnti](https://motherduck.com/product/pricing/); il token di esportazione deve poter creare/scrivere il database. Per GPT preferire un accesso con permessi di sola lettura al warehouse.

## Interrogare da GPT

Dopo il caricamento, usare il collegamento MotherDuck già configurato per interrogare `openfindability.main`. La variabile locale autentica lo script di esportazione: non configura né modifica automaticamente il collegamento ChatGPT.

Se la sessione ChatGPT era già collegata durante il caricamento e non vede le nuove tabelle, eseguire `REFRESH DATABASES` prima delle query: aggiorna il catalogo della sessione dopo modifiche effettuate da un altro client.

Viste:

| Vista | Uso |
|---|---|
| `search_performance` | Totali giornalieri Google/Bing, con progetto e motore |
| `bing_details` | Top query/pagine con grana e copertura provider |
| `ai_crawler_requests` | Richieste crawler per ora/host/path/status |
| `clarity_latest` | Ultimo export per progetto, senza URL vecchie recuperate da snapshot precedenti |
| `daily_ad_revenue` | Mediazione AdMob, fallback network solo nei giorni privi di mediazione, AdSense separato |
| `revenuecat_latest` | Ultimo snapshot rolling/MRR per progetto |
| `metric_dictionary` | Definizioni e vincoli per interpretare le metriche |
| `project_daily_kpis` | KPI giornalieri in formato lungo, con sorgente/metrica/unità/valuta/grana |
| `project_latest_kpis` | Ultimo valore per metrica, con snapshot RevenueCat esplicitamente distinti |
| `data_freshness` | Configurazione attuale, ultimo esito sync, ultima data metrica e stato |
| `source_coverage` | Date con righe e limiti di copertura, anche per fonti disattivate |
| `app_store_daily_quality` | Download affidabili e disponibilità retention, mantenendo gli originali |
| `gsc_page_monthly` / `gsc_query_monthly` | Aggregazioni per progetto/pagina/query/mese prima dei join |
| `index_audit_latest` | Ultima ispezione per proprietà/URL ed età dell'audit |
| `ai_crawler_daily` | Aggregato giornaliero per crawler/status con ore osservate |
| `warehouse_integrity` | Controlli sui riferimenti e storico iOS non affidabile |

`project_daily_kpis` usa righe `(project_id, source, date, metric, value, unit, currency, grain)`: non sommare metriche/unità/valute diverse. La retention mancante resta `NULL`; i download anteriori al 21 settembre 2025 restano nell'originale ma non entrano nei KPI affidabili. Le colonne GA4 `sessions` e `key_events` sono esplicite nella replica.

Non fare un join fra le righe grezze query e pagine GSC: moltiplicherebbe le misure. Prima aggregare ciascuna fonte alle stesse chiavi e allo stesso periodo, oppure usare le viste mensili. Un mese parziale non va confrontato con uno intero. Anche i campi posizione e CTR richiedono aggregazioni pesate, non medie semplici.

`project_source_configuration` replica solo booleani di configurazione, senza segreti. `configured=false` non significa che l'app non sia pubblicata: significa che OpenFindability non la sta raccogliendo su quella fonte. Le date storiche rimangono consultabili. Categorie mancanti e stato di pubblicazione non vengono inventati.

Una guida privata MotherDuck nel topic `openfindability` documenta queste regole per gli agenti. La versione mantenibile è [warehouse-ai-guide.md](./warehouse-ai-guide.md); le colonne e le tabelle ricevono commenti SQL durante il sync.

Lo schema cloud versione 2 aggiunge `sessions` e `key_events` con migrazione additiva tracciata in `warehouse_schema_migrations`. Le insert nominano le colonne, quindi non dipendono dall'ordine fisico dopo un ALTER. Indici unici su `id` prevengono duplicati; prima del trasferimento si controllano ID null/duplicati e riferimenti a progetti inesistenti. I riferimenti nullable degli audit realmente non associabili restano ammessi. Non si applicano FK cloud che impedirebbero il refresh indipendente delle partizioni: l'integrità relazionale viene verificata esplicitamente, mentre SQLite conserva le proprie FK.

Per recuperare associazioni GSC e colonne GA4 dai payload già conservati:

```powershell
pnpm.cmd run repair:analytics
pnpm.cmd run db:backup
pnpm.cmd exec tsx scripts/repair-analytics-data.ts --apply
```

Il comando non fa richieste esterne. Ricollega solo audit senza progetto con abbinamento univoco, non sovrascrive valori GA4 già presenti e mantiene `rawJson`. Il normale sync e l'audit riconciliano anche le associazioni GSC pregresse.

Esempi di richieste: «Leggi prima metric_dictionary e warehouse_runs, poi confronta le pagine GSC negli ultimi due periodi completi di 28 giorni»; «Per VitaRomagna trova URL visitate dai crawler AI con errori HTTP e confrontale con l'audit GSC».

```sql
SELECT * FROM openfindability.main.metric_dictionary;
SELECT * FROM openfindability.main.warehouse_runs ORDER BY started_at DESC LIMIT 5;
SELECT slug, source, sum(clicks) clicks, sum(impressions) impressions
FROM openfindability.main.search_performance
WHERE date BETWEEN '2026-09-01' AND '2026-09-28'
GROUP BY slug, source;
```

Per i ricavi raggruppare sempre per valuta; i totali con valuta mancante restano non riconciliati. Le daily users GA4/Umami non diventano utenti unici sul periodo. Query/pagine/totali GSC rappresentano viste sovrapposte: non sommarle insieme.

## Report e diagnostica locale

```powershell
pnpm.cmd exec tsx scripts/seo-geo-report.ts vitaromagna
pnpm.cmd run doctor
pnpm.cmd run test:seo-geo
```

Il report datato viene scritto in `project/<slug>/reports/` e contiene copertura e campione di righe dell'ultimo import. Il tool MCP locale `get_seo_geo_snapshot` espone gli stessi dati conservati, senza API live. Doctor mostra credenziali configurate e freschezza degli import.

Fonti tecniche: [Bing accesso API](https://learn.microsoft.com/en-us/bingwebmaster/getting-access), [Clarity Data Export](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api), [Cloudflare GraphQL AI Crawl Control](https://developers.cloudflare.com/ai-crawl-control/reference/graphql-api/).
