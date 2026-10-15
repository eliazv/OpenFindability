# OpenFindability: istruzioni di analisi per AI

Database: `openfindability.main`. Leggere `metric_dictionary`, `warehouse_runs`, `data_freshness` e `source_coverage` prima delle analisi. SQLite è la fonte operativa; MotherDuck è una replica selettiva con aggiornamento manuale.

## Scelta delle viste

Usare `project_daily_kpis` per periodi e `project_latest_kpis` per l'ultima misura. Il formato lungo conserva progetto, fonte, metrica, valore, unità, valuta e grana. Queste dimensioni non si possono eliminare quando si sommano importi o confrontano misure. La data dell'ultimo KPI può differire tra metriche e fonti.

`project_source_configuration.configured` descrive cosa raccogliamo adesso. Lo storico resta dopo la disattivazione; una vecchia riga non prova che la fonte sia ancora attiva. La configurazione non è una prova di pubblicazione sugli store. Non inventare categorie o collegamenti sito/app.

## SEO

GSC query e pagine contengono top rows giornaliere, non un inventario esaustivo. Non fare join diretti fra `search_queries` e `page_metrics`: si genera una relazione molti-a-molti che moltiplica conteggi e costi. Aggregare prima ciascun dataset alle stesse chiavi, per esempio progetto/pagina/giorno; per analisi esplorative usare `gsc_page_monthly` e `gsc_query_monthly`. Non sommare query, pagine e totali della proprietà.

CTR = somma clic / somma impressioni. Posizione media = somma(posizione × impressioni) / somma impressioni. Google e Bing sono fonti separate; i dettagli Bing hanno grana `provider_period` e non vanno promossi a giornalieri. Confrontare finestre finalizzate di pari durata e mesi parziali allineati.

`index_audit_latest` espone `inspection_date` e `audit_age_days`. Un'ispezione vecchia non dimostra lo stato attuale; la freschezza del traffico GSC non aggiorna l'ispezione. Gli audit manuali sono progressivi e a budget, non una scansione esaustiva dell'indice Google.

## Ricavi

`daily_ad_revenue` usa mediazione AdMob come totale completo e network come fallback solo nei giorni senza mediazione. Non aggiungere la tabella network al totale della mediazione. Raggruppare per valuta; una valuta sconosciuta non equivale a EUR o USD.

`revenuecat_latest.revenue` è rolling 28 giorni: non sommare le date. MRR, abbonati e trial sono snapshot. Non sommare rolling RevenueCat e ricavi pubblicitari giornalieri in un KPI generico. `project_latest_kpis` conserva esplicitamente queste grane.

## Analytics e app

GA4 e Umami sono misure indipendenti. La somma degli utenti giornalieri è utenti-giorno, non utenti unici sul periodo. GA4 `sessions` e `key_events` sono colonne esplicite; gli eventi chiave dipendono dalla configurazione della proprietà e non sono un tasso di conversione.

`app_store_daily_quality.trusted_downloads` esclude dalla misura i download noti gonfiati prima del 21 settembre 2025; l'originale resta per audit. I download contano prime acquisizioni, non aggiornamenti o reinstallazioni. I campi D1/D7/D28 non hanno ancora un contratto cohort/unità implementato: `NULL` significa non disponibile, mai zero. Il report App Sessions non equivale alla retention.

## GEO e UX

Cloudflare misura richieste HTTP proxate campionate e rilevate tramite user-agent falsificabili. Non sono citazioni AI. `ai_crawler_daily` conserva le ore osservate: non presume copertura di tutta la giornata. Clarity misura finestre mobili di 24 ore, limitate a top rows: non sommare finestre sovrapposte; usare `clarity_latest` per l'ultimo export del progetto. Le API Bing SEO non espongono qui le citazioni AI Performance.

## SQL iniziale

```sql
SELECT slug, source, freshness_status, last_date
FROM openfindability.main.data_freshness WHERE configured;

SELECT slug, source, metric, unit, currency, sum(value) AS value
FROM openfindability.main.project_daily_kpis
WHERE date BETWEEN '2026-09-01' AND '2026-09-28'
GROUP BY slug, source, metric, unit, currency;

SELECT * FROM openfindability.main.warehouse_integrity;
```

Le finestre dell'esempio sono illustrative: scegliere quelle compatibili con i dati effettivamente disponibili. I giorni mancanti non si riempiono a zero. Consultare copertura e stato delle fonti prima di formulare conclusioni.
