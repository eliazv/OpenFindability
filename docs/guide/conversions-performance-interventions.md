# Conversioni, prestazioni e registro degli interventi

Le estensioni usano SQLite e la replica MotherDuck esistenti. Non richiedono un altro server, un abbonamento o pianificazioni automatiche. Le API Google restano soggette a quote; non viene attivato alcun piano a pagamento. GA4 riutilizza il service account esistente; CrUX richiede una chiave API. PageSpeed può rispondere senza chiave, ma la quota condivisa può esaurirsi.

## Conversioni GA4

```powershell
pnpm run sync:ga4-landing
# Finestra diversa: su Windows chiamare lo script direttamente.
pnpm exec tsx scripts/sync.ts ga4_landing 30
```

Il connettore partecipa anche al sync generale manuale. Richiede `ga4PropertyId`, `websiteUrl` e il service account con ruolo Viewer. Non modifica eventi o siti. I progetti senza proprietà e sito vengono saltati.

`ga4_landing_metrics` conserva giorno, hostname, landing senza query string, canale di sessione, sorgente/mezzo, dispositivo, sessioni, sessioni coinvolte, eventi chiave e `sessionKeyEventRate`. Il tasso è quello fornito da Google, non `keyEvents / sessions`. Gli eventi dipendono dalla proprietà: verificarne il significato prima di chiamarli contatti o vendite. Gli eventi chiave possono essere frazionari.

Il report verifica la compatibilità delle dimensioni/metriche ed è filtrato sull'hostname configurato e variante www. Legge tutte le pagine in ordine stabile. Fallimenti, limiti o conteggi incoerenti non cancellano la precedente importazione. Una risposta completa sostituisce l'intera finestra richiesta, anche se vuota. Il massimo è 250.000 righe: oltre, ridurre la finestra.

Sono conservati fuso orario e indicatori di soglia privacy, campionamento e perdita nella riga `(other)`. Dati limitati risultano `partial`. `standard` non garantisce tracciamento esaustivo. Nelle proprietà cross-domain una sessione può comparire su più hostname. Non sommare i dettagli ai totali GA4 del progetto e non unirli direttamente alle query GSC.

Fonti: [Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema), [compatibilità](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/checkCompatibility).

## Prestazioni PageSpeed e CrUX

In `.env` configurare `CRUX_API_KEY` e, consigliata, `PAGESPEED_API_KEY`. Abilitare **Chrome UX Report API** e **PageSpeed Insights API** nel progetto Google Cloud della chiave. Una stessa chiave può essere assegnata alle due variabili se autorizzata per entrambe le API, con restrizioni compatibili con lo script locale. Non vengono riutilizzate automaticamente chiavi di altri servizi.

```powershell
# Anteprima: nessuna chiamata API o salvataggio di osservazioni.
pnpm exec tsx scripts/audit-performance.ts --slug example --limit 3
# Raccolta manuale e salvataggio locale.
pnpm exec tsx scripts/audit-performance.ts --slug example --limit 3 --apply
# Un URL, una fonte, desktop.
pnpm exec tsx scripts/audit-performance.ts --slug example --url https://example.org/ --source pagespeed --device desktop --apply
```

Il campione contiene l'URL principale e le pagine con più impressioni GSC giornaliere negli ultimi 30 giorni. Limite: 1–10 URL per progetto; dispositivo iniziale mobile. CrUX interroga anche l'origine, senza usarla come sostituto silenzioso del singolo URL. Sono ammessi URL pubblici della stessa origine configurata, senza query/fragment. I progetti senza una fonte web attiva sono esclusi. Altri template si possono selezionare con `--url`.

La cache giornaliera evita richieste ripetute per fonte/URL/ambito/dispositivo. `--force` sostituisce l'osservazione della giornata, senza creare storico intragiornaliero. CrUX senza chiave è `skipped`. Un errore HTTP è un fallimento, non uno zero; i successi delle altre richieste vengono mantenuti. Le prestazioni sono opt-in e non rallentano il sync generale.

`web_performance_metrics` distingue:

- **PageSpeed:** test di laboratorio Lighthouse; LCP/FCP/TBT in millisecondi, CLS senza unità e punteggio 0–1. Non misura INP reale: TBT non viene rinominato INP. Conserva versione e URL finale quando disponibili.
- **CrUX:** percentili p75 sul campo, dispositivo, ambito URL/origine e periodo di raccolta restituito dal provider. Le finestre mobili non sono sommabili tra date.
- **`no_data`:** CrUX non dispone di quel record; valori `NULL`, senza giudizio negativo sulle prestazioni. Anche singoli percentili possono mancare.

Ogni richiesta effettiva è registrata in `connector_runs`. I payload originali restano locali. Nessuna API scrive sul sito.

Fonti: [CrUX, chiavi e quote](https://developer.chrome.com/docs/crux/api/), [PageSpeed e uso senza chiave](https://developers.google.com/speed/docs/insights/v5/get-started).

## Registro degli interventi

```powershell
# Anteprima; aggiungere --apply per salvare localmente.
pnpm exec tsx scripts/interventions.ts add --slug example --date 2026-10-15 --kind title --title "Titolo landing aggiornato" --url https://example.org/
pnpm exec tsx scripts/interventions.ts list --slug example
pnpm exec tsx scripts/interventions.ts report --slug example --id intervention_ID --days 28
```

`--id` permette aggiornamenti dello stesso record. Senza URL il confronto riguarda il progetto; con URL riguarda origine e percorso esatti, senza query string, senza corrispondenze per prefisso. `--reference` e `--notes` conservano contesto privato: restano locali e sono esclusi da MotherDuck. Il titolo è metadato analitico esportato. Nessun intervento reale viene inventato all'installazione.

Il confronto esclude il giorno della modifica e usa finestre di uguale durata (1–90 giorni). Espone giorni con righe, qualità GA4 e interventi concomitanti. Periodi incompleti non producono verdetti di crescita o estrapolazioni. Assenza di righe non significa zero; variazioni relative rispetto a zero restano mancanti. Si tratta di confronti descrittivi: stagionalità, ritardi, fusi orari e altri cambiamenti impediscono di attribuire automaticamente causalità.

## Report, MCP e MotherDuck

```powershell
pnpm exec tsx scripts/growth-evidence-report.ts --slug example
pnpm run sync:warehouse
pnpm exec tsx scripts/sync-warehouse.ts --apply
```

Il report locale è salvato in `project/<slug>/reports/<data>-growth-evidence.md`, escluso da git. Il tool MCP **`get_growth_evidence`** restituisce dati memorizzati per landing/canale/dispositivo, ultime prestazioni e confronti degli interventi. Non avvia chiamate live e non restituisce payload, note o riferimenti privati.

La replica aggiunge tre tabelle e le viste `ga4_landing_daily`, `ga4_landing_monthly`, `web_performance_latest`, `intervention_windows`, `intervention_daily_metrics`, `intervention_summary`. Le viste degli interventi usano 28 giorni fissi; lo script locale consente altre durate. L'aggregazione mensile GA4 pesa il tasso sulle sessioni e mantiene hostname, dispositivo e fuso orario. `source_coverage` e `data_freshness` includono le nuove fonti. Lo schema warehouse passa alla versione 3 in modo additivo.

```sql
SELECT hostname, landing_page, channel, sessions, key_events,
       session_key_event_rate, quality_limited
FROM openfindability.main.ga4_landing_monthly
WHERE project_id = 'PROJECT_ID' AND report_month = '2026-10'
ORDER BY sessions DESC LIMIT 20;

SELECT source, url, scope, device, status, measurement_kind,
       lcp_ms, inp_ms, cls, performance_score, period_end, age_days
FROM openfindability.main.web_performance_latest
WHERE project_id = 'PROJECT_ID';

SELECT * FROM openfindability.main.intervention_summary
WHERE intervention_id = 'INTERVENTION_ID';
```

Le prestazioni mostrate sono le ultime disponibili, indipendenti dalla finestra GA4 del report. Per collegare GSC e GA4 aggregare prima su chiavi e periodi compatibili. Non sommare KPI giornalieri, dettagli landing, percentili e punteggi come una sola misura.
