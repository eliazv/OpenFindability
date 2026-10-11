# Google Sheets e Apps Script per OpenFindability / ChatGPT Mobile

Stato: **codice pronto nel repo, autorizzazioni Google e trigger da attivare sull'account proprietario**. Non sono richiesti GitHub Actions, un server sempre acceso o un piano Windsor.ai.

## Architettura senza confondere proprietari dei dati

- **Apps Script → GSC:** indipendente dal PC, usa l'account Google che apre il foglio; scrive solo `Properties`, `Daily`, `TopPages`, `TopQueries`, `SEO_Overview` e `SyncLog`.
- **OpenFindability locale → lo stesso foglio:** dopo un sync locale esporta i KPI non-GSC sulle schede `OF_Projects`, `OF_DailyMetrics`, `OF_Revenue`, `OF_AppMetrics`, `OF_Opportunities` (opportunità SEO già calcolate, ordinate per punteggio), `OF_GscDaily`/`OF_GscQueries`/`OF_GscPages` (copia GSC dal database locale: totali giornalieri e top query/pagine degli ultimi 28 giorni, disponibile anche senza attivare l'Apps Script; non sommarla alle schede GSC dello script), `OF_GscBreakdowns` (dispositivo/paese), `OF_GscSitemaps`, `OF_GscIndexSummary`/`OF_GscIndexIssues` (audit di indicizzazione, solo URL con problemi), `OF_AdmobBreakdown` (ricavi AdMob per rete e formato: è il dettaglio del totale in `OF_Revenue`, non va sommato a quello), `OF_AsoKeywords`, `OF_StoreCopy` (nome, sottotitolo e keyword App Store), `OF_SyncStatus`. Il job è manuale e aggiorna gli ultimi 90 giorni; a PC spento quei dati restano disponibili ma non si aggiornano.
- **ChatGPT Mobile → Google Drive/Sheets:** può leggere il foglio privato collegato. Non può accedere alla SQLite locale, né pubblicare versioni sugli store attraverso il foglio.
- **Non usare due writer sulle stesse schede.** Mai inserire i dati GSC dello script dentro `OF_DailyMetrics` o viceversa.

## P0 — Attivazione Apps Script (una tantum)

1. Apri un foglio Google *privato* chiamato ad esempio **OpenFindability - Analytics**. Apri **Estensioni → Apps Script** (script associato al foglio).
2. Copia il file [`integrations/google-sheets-gsc/Code.gs`](../../integrations/google-sheets-gsc/Code.gs) nell'editor; nel menu del progetto rendi visibile **appsscript.json** e usa il manifest in [`integrations/google-sheets-gsc/appsscript.json`](../../integrations/google-sheets-gsc/appsscript.json).
3. Abilita **Search Console API** nel progetto Google Cloud collegato allo script; concedi i permessi richiesti al primo avvio. Non serve un service account JSON nell'editor.
4. Esegui manualmente `setupGscSync`: crea le schede mancanti e un trigger ricorrente intorno alle **06:00 Europe/Rome** (Google non garantisce il minuto esatto).
5. Nella scheda **Properties** aggiungi una riga per proprietà con colonne `property | project_slug | enabled | primary | search_type`. Esempio: `sc-domain:example.com | example | TRUE | TRUE | web`. Scegli la proprietà primaria per ogni sito, **non sommare proprietà dominio/URL-prefix sovrapposte**.
6. Esegui una volta `backfillGscDaily` per gli ultimi 90 giorni di totali GSC; poi `syncGscDaily` per controllare anche pagine/query recenti. Se la proprietà non è accessibile, la riga di errore appare in **SyncLog**.
7. Controlla l'ultimo giorno incluso, le righe duplicate e i numeri contro Search Console UI, prima di usare il foglio per decisioni.

### Limiti attuali dello script

- Ogni giorno aggiorna la finestra D-11..D-2 (10 date finalizzate) in `Daily`.
- Per `TopPages` raccoglie fino a **100** righe al giorno e per `TopQueries` fino a **150**, negli ultimi **3** giorni finalizzati. Sono *top rows*, **non il totale esaustivo di tutte le query**. Google anonimizza query e applica limiti. Dati senza righe non significano necessariamente zero traffico.
- `SEO_Overview` pesa CTR e posizione per impression. Per confronti 28 giorni il totale è attendibile soltanto dopo backfill di 90 giorni.
- Trigger Apps Script eseguiti da Google e soggetti a quote e tempi massimi; mantenere il numero di proprietà e chiamate nei limiti del proprio account.
- `ofReplaceWindow_` ricompone le righe del foglio dopo aver ricevuto le API; Sheets non ha transazioni: un errore di scrittura può lasciare un export incompleto. Verificare `SyncLog` e rilanciare il sync.

## P1 — OpenFindability esporta le altre statistiche

Aggiungi al `.env` **solo**:

```dotenv
GOOGLE_SHEET_ID=<ID_DEL_FOGLIO_PRIVATO>
```

Abilita **Google Sheets API** nel progetto Google Cloud del service account (una tantum), poi condividi il foglio con l'email del **service account** OpenFindability (solo questo documento; ruolo **Editor**). Usa l'account JSON già in `secrets/google/`. Il connettore Node usa Sheets API con scope `spreadsheets`, non richiede di inserire nuovi token nello script.

```bash
pnpm run db:backup
pnpm run sheet:export -- --days 90           # default dry-run
pnpm run sheet:export -- --days 90 --apply   # scrive SOLO OF_*
```

La proiezione riporta il numero di righe per scheda prima di modificare il foglio. Usa input **RAW** per impedire l'esecuzione di formule maliziose nei nomi dei progetti. Massimo 20.000 righe per scheda; niente `rawJson`, note confidenziali, token o dati degli utenti.

### Sicurezza e definizioni metriche

- `OF_Revenue` tiene distinti `mrr`, `subscribers`, `rolling_28d_revenue`, `estimated_revenue`. Non sommarli.
- `OF_DailyMetrics` tiene separate GA4 e Umami. Gli utenti GA4 per giorno sommati **non** sono utenti unici della finestra. AdMob mediation è la fonte principale per revenue ads.
- Ogni riga ha sorgente, data, unità/granularità e, per i ricavi, valuta; mai sommare EUR/USD senza conversione.
- Se il PC non gira, i dati non-GSC rimangono all'ultima esportazione; la tab `OF_SyncStatus` indica freschezza degli import.
- Non trasformare Sheets in una coda di istruzioni per rilasci App Store/Play Store e non usare `web app` pubbliche Apps Script per ricevere segreti.

## Validazione e comandi

```bash
pnpm run test:integrations
pnpm run test:gsc
pnpm run typecheck
pnpm run build
```

Questa documentazione descrive i passaggi da compiere **sull'account Google autorizzato**. Il commit del codice NON crea un trigger in Google e non prova che la quota e la visibilità della proprietà GSC siano corrette.

Link: https://developers.google.com/apps-script/reference/script/script-app#getoauthtoken ; https://developers.google.com/webmaster-tools/v1/searchanalytics/query ; https://developers.google.com/analytics/devguides/reporting/data/v1/basics
