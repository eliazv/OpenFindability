# Secondo audit OpenFindability — Google Sheets, qualità dei dati e rilasci mobile

> Data: **2026-10-11** · Stato: **analisi tecnica e roadmap**, nessuna funzionalità descritta qui è stata implementata in questa revisione.  
> Base analizzata: \`fix/gsc-daily-history-2026-10-11\` (derivata da \`master\`; include la prima correzione dello storico GSC).  
> Destinazione: \`docs/audit-sheets-releases-2026-10-11\`.  
> Intento: usare OpenFindability come **centro operativo per interrogare i propri progetti, capire statistiche e opportunità, preparare/gestire rilasci Android e iOS**, con accesso ai riepiloghi anche da ChatGPT Mobile e senza abbonamenti ai data connector.

## Sintesi decisionale

**Google Sheets VA BENE come replica cloud di consultazione**, non come copia 1:1 del file SQLite, e non come canale per eseguire pubblicazioni.

- **SQLite locale = source of truth operativo** per progetti, dati storici granulari, cache, audit, task e log.
- **Google Sheet privato = proiezione read-only per ChatGPT**, con serie giornaliere essenziali e viste aggregate per decisioni. Il collegamento Google Drive/Sheets di ChatGPT permette di leggerlo anche da mobile, da verificare su un foglio reale.
- **Apps Script = acquisizione GSC indipendente dal PC** una volta al giorno (con OAuth del proprio account Google).
- **OpenFindability → Sheet = export unidirezionale** degli aggregati non-GSC dopo i sync locali. Se OpenFindability resta spento, tali dati restano disponibili ma diventano progressivamente vecchi: un foglio online non garantisce che i connettori locali continuino a girare.
- **Nessuna azione store dal foglio:** store release e modifiche ai metadati sono operazioni *write* distinte con dry-run, revisione, approvazione e audit log.
- **No cloud database per ora**; una replica remota SQLite/Supabase ha senso solo se diventano indispensabili query arbitrarie, drill-down massiccio o refresh multi-fonte a PC spento.

### Definizioni da non confondere

- **Sempre disponibile:** il foglio si apre da mobile, anche a PC spento.
- **Sempre aggiornato:** richiede un job attivo **per ogni fonte**; Apps Script copre GSC ma non sostituisce i connettori RevenueCat/Apple/Google già in Node.js.
- **Accessibile da ChatGPT:** lettura del file con app Google Drive autorizzata. *Non* accesso SQL né comandi arbitrari al DB locale e *non* MCP server remoto.
- **Completamente gratuito:** nessun costo iniziale con quote standard di Apps Script/Sheets e limiti d'uso; evitare promesse di gratuità illimitata o quota invariabile.

## Architettura raccomandata

\`\`\`text
              GSC API
                 |
       Apps Script OAuth + daily trigger
                 |
                 v
           Google Sheet privato  <----- Google Sheets exporter
            |          |                     ^
            |          |                     |
   ChatGPT Mobile   Viste SEO, KPI     OpenFindability locale
            |      + SyncStatus             |
            |                         SQLite: tutto lo storico
            |                          + connettori Node.js
            |
     Analisi read-only in chat

  Workflow rilasci:
     Flutter/artefatti -> runner release esplicito (Fastlane / API store)
                    |                         |
              dry-run + conferma        stato remoto verificato
                    +-------------> audit locale + replica Sheet (sola lettura)
\`\`\`

### Piano minimo del Google Sheet

Un documento privato, formato *tabellare*, senza copie di \`rawJson\`, chiavi API, dati utenti o grandi insiemi di righe di query/page.

| Tab | Granularità e contenuto | Origine/aggiornamento |
|---|---|---|
| \`Projects\` | 1 riga per \`project_id\`, nome, slug, app IDs, URL, categoria, abilitazioni e link operativi pubblici | OpenFindability |
| \`DailyMetrics\` | \`project_id, source, date, metric, value, unit, currency?, platform?, property?, fetched_at, data_complete\` | Apps Script per GSC; OpenFindability per altre fonti |
| \`SEO_Overview\` | 7/28/90gg e periodi equivalenti, totale clic/impression, CTR ponderato, posizione ponderata, pagine in crescita/calo | Apps Script (oppure esportatore OF con origine dichiarata) |
| \`SEO_Opportunities\` | top ~20-30 query/pagine per proprietà con finestra e criteri di selezione; non tutte le query GSC | Apps Script / export OF (origine esplicita) |
| \`App_Overview\` | download Android/iOS, install/uninstall, crash/ANR, rating, retention disponibili, con data copertura | OpenFindability |
| \`Revenue\` | AdMob totale reale da mediation, AdSense, RevenueCat MRR e subscriber gauge, con **valuta e tipo di metrica** | OpenFindability |
| \`Store_Status\` | ultima versione live/draft, versione/build, test track, stato review/rollout, blocchi, ultimo controllo | futuro connettore store status, **no azioni** |
| \`SyncStatus\` | per progetto/fonte \`last_success_at, latest_data_date, last_attempt_at, outcome, partial, warning\` | entrambi |

**Regole indispensabili:**

1. Chiavi stabili per upsert, schema versionato \`schema_version\`, UTC per timestamp tecnici, date di GSC come giorno GSC. Non sovrascrivere gli ID o sommare \`sc-domain\` e URL-prefix sovrapposti.
2. \`DailyMetrics\` è una *fact table*: distinguere \`total_daily\`, \`snapshot_at_date\`, \`rolling_28d\`. Non sommare MRR, abbonati attivi e revenue rolling come fossero ricavi giornalieri.
3. Le query GSC anonimizzate non sono integralmente esportabili: la somma delle query non deve essere dichiarata pari ai clic totali del sito.
4. Una \`Revenue\` con EUR/USD diversi deve indicare valuta e conversione/provenienza, non sommare numeri incompatibili.
5. La scheda \`SyncStatus\` deve mostrare sia **esito della chiamata** sia **data più recente dei dati effettivamente disponibili**. “Success” con zero righe non equivale a dati aggiornati.
6. Conservare nello Sheet solo il dettaglio necessario alle risposte ChatGPT: top URLs/query 28/90gg + metriche giornaliere; evitare milioni di righe e log con payload completi.
7. Per dati di clienti e store: niente condivisione pubblica, principio del privilegio minimo per service account editor; Google Sheet e l'account ChatGPT connesso rappresentano un'ulteriore superficie di accesso da valutare.

### Exporter suggerito nel repo

\`lib/integrations/google-sheets/\` + \`scripts/export-chatgpt-sheet.ts\`:

- \`pnpm run sheet:export -- --dry-run\` **prima**, poi \`--apply\` dopo verifica esplicita.
- Scrive SOLO le viste materializzate appena definite, non l'oggetto \`AppData\` o le tabelle Drizzle intere.
- Un solo autore per tab o intervallo: Apps Script possiede \`SEO_*\` e righe GSC; l'exporter possiede metriche non-GSC e stato store. Evitare due writer concorrenti nella stessa tab se non si usa uno schema/key upsert rigoroso.
- Upsert batch, retries/backoff per 429/5xx e check degli header; non usare \`clear()\` globale prima della risposta API.
- Dry run con quantità per progetto/fonte e date coperte; scrivere \`last_exported_at\` e \`schema_version\`.
- Servizio Google Sheets API con account service account autorizzato *editor sul solo Sheet*; niente segreti nel codice e nessuna apertura del DB verso Internet.
- Produrre anche \`project/<slug>/reports/<date>-decision-brief.md\` (locale) per tenere una lettura umana della stessa fotografia dei dati.
- Pubblicazione **manuale o alla fine di un sync locale riuscito**: non chiamarla nightly finché non esiste un runner sempre attivo.

Il piano GSC Apps Script autonomo è già nel file \`docs/guide/gsc-google-sheets-appscript-integration.md\` della base branch. Prima realizzare P0 di quello, poi aggiungere l'exporter di questo documento.

## Audit del codice — difetti, rischi e miglioramenti

Verificato nel repository via GitHub. Le voci “rischio” sono dedotte dal codice, non da un incidente riprodotto su dati reali. Le criticità della precedente passata GSC sono già nel branch base ma non risultano testate contro API reali.

### P0 — Affidabilità / sicurezza

**P0-A · Scrittura integrale SQLite per quasi ogni update**
- Evidenza: \`lib/store.ts\` → \`writeDataWith()\` elimina tutte le tabelle e le reinserisce in una transaction; \`updateData()\` usa \`readData → mutator → writeData\`. \`lib/sync.ts\`, \`lib/gsc-index-audit.ts\` e vari script/strumenti MCP scrivono sullo stesso file.
- Transaction protegge dall'aggiornamento *parziale di un writer*, **non** dal *lost update*: due processi possono leggere la stessa versione, scrivere successivamente e cancellare modifiche dell'altro. Il problema cresce col volume di history.
- Soluzione: sostituire il percorso di sync con **upsert SQL incrementali per tabella/progetto/date**, transazioni brevi e serializzazione per job; per modifiche puntuali aggiornare solo colonne interessate. Evitare globale \`DELETE+INSERT\`. Test di concorrenza e rollback.
- Accettazione: due sync simultanei su progetti/fonti differenti non perdono dati; il report storico resta invariato; tempi di sync ragionevoli con decine di migliaia di query/giorno.

**P0-B · Endpoint GET avvia sincronizzazione persistente**
- Evidenza: \`app/api/sync/route.ts\` espone \`GET()\` → \`syncProjects()\`; la home e sidebar hanno link \`<a href="/api/sync">\`. Nessuna autenticazione nello specifico handler.
- Un GET/crawler/prefetch può avviare operazioni lunghe e mutazioni. Se la dashboard venisse esposta pubblicamente diventerebbe un problema di accesso e quota; **non esporre questa app sul web così com'è**.
- Soluzione: endpoint \`POST\` esplicito, controllo di accesso/sessione e CSRF/origin se web accessibile; esito/progress leggibile con GET *read-only*, dedup di sync in corso. Local-only finché non protetta.

**P0-C · La pagina home scrive il database durante un semplice render**
- Evidenza: \`app/page.tsx\`: quando non ci sono opportunità ricalcola \`buildOpportunities(data)\` e chiama \`writeData(data)\`.
- Oltre al costo, può sovrapporsi a un job e innescare la perdita di aggiornamenti del punto P0-A.
- Soluzione: spostare la generazione in un job separato o trigger di sync; la pagina legge soltanto, visualizza eventualmente “opportunità non calcolate”.

**P0-D · Operazioni store: confini di responsabilità e conferma**
- Evidenza: \`scripts/play-push-copy.ts\` e \`scripts/asc-metadata.ts\` usano \`--apply\` (positivo), ma mancano un oggetto *release job* stabile, un piano verificabile per track/versione/build, rollback e controllo dello stato remoto post-operazione.
- Soluzione: nessun auto-publish da input ChatGPT/Sheets; \`plan → validate → diff → explicit approve → execute → poll remote state → audit log\`; account/track/package/versione devono essere visibili prima di ogni apply.
- L'aggiunta di un'automazione di rilascio vero e proprio deve essere opt-in separato dalla parte analytics.

### P1 — Qualità dei numeri

**P1-A · “Success” non significa dati raccolti**
- Evidenza: \`lib/connectors/play-gcs-stats.ts\` restituisce \`success\` anche quando non trova alcun CSV; \`lib/connectors/appstoreconnect-analytics.ts\` può registrare \`success\` anche se Sales Reports hanno errori e retention è indisponibile; \`lib/doctor.ts\` usa timestamp degli ultimi *success*.
- Soluzione: stati \`success | partial | no_data | failed | skipped\`, con \`latest_data_date\`, \`coverage_from/to\`, campi fonte effettivamente disponibili, issue diagnostici. Allerta separata per assenza configurazione, ritardo naturale, guasto.
- Nessun grafico deve dare per certo uno zero che è in realtà “non disponibile”.

**P1-B · Dashboard mescola finestre temporali diverse**
- Evidenza: \`lib/insights.ts\` → \`summarizeProject()\` somma tutti gli snapshot GSC/Umami/AdMob del DB, mentre RevenueCat è uno snapshot, le card mostrano un numero senza identica finestra temporale; \`app/page.tsx\` aggrega più progetti.
- Soluzione: finestre comparabili e dichiarate \`7d,28d,previous28d,90d\`, data limite comune, completezza per fonte. Etichette esplicite “ultimi 28 giorni” e “al 9 ottobre”; mai confrontare un lifetime con uno snapshot come se avessero lo stesso significato.

**P1-C · Opportunità globalmente tagliate a 50**
- Evidenza: \`lib/insights.ts\` → \`buildOpportunities()\` termina con \`.sort(...).slice(0, 50)\` *per tutti i progetti*. Un sito grande può escludere interamente opportunità dei piccoli.
- Soluzione: shortlist per progetto, dedup per entità e tipo, punteggio normalizzato su finestra, poi top globale; stati utente stabili e persistenza distinti da detection. Rivedere anche opportunità “declining_page” che nel codice attuale descrive semplicemente **CTR basso** e non necessariamente un calo misurato.
- Esporre \`evidence\`, \`period\`, \`expected_impact\`, \`confidence\`, \`next_action\`.

**P1-D · Parser CSV delle installazioni Play fragile**
- Evidenza: \`lib/connectors/play-gcs-stats.ts\` \`parseCsv\` usa \`line.split(",")\`: non gestisce correttamente campi CSV tra virgolette con virgole/escape/newline. \`Number(x) || 0\` converte valori errati o mancanti in zero.
- Soluzione: parser CSV testato RFC 4180, fixtures UTF-16LE/gzip, formato/date/locale controllati, i missing restano \`null\`/non disponibili, segnalarli in \`SyncStatus\`. Verificare schema export effettivo sul proprio bucket.

**P1-E · Aggancio automatico app cross-store potenzialmente errato**
- Evidenza: \`scripts/discover-apps.ts\` \`bestFuzzyMatch()\` associa automaticamente l'Apple ID a progetti esistenti se i token del nome superano una soglia Jaccard/subset: il codice stampa “verify” **dopo** aver già modificato l'associazione.
- Soluzione: \`discover:apps --dry-run\` che genera proposte; linking automatico solo per id/bundle/package già verificati, fuzzy da approvare prima dell'update. Un match errato è particolarmente pericoloso se quel progetto viene usato per push di metadati.

**P1-F · Stato release e store performance insufficiente**
- Evidenza: \`lib/connectors/play-console.ts\` sa leggere/aggiornare **listing**, \`lib/connectors/appstoreconnect.ts\` metadata/PPO; non c'è nel repo un orchestratore completo che legge track/versioni/build/review state e upload release artifacts. \`scripts/report.ts\` produce analytics e ASO, non una scheda deploy verificata.
- Soluzione: connettori *read-only* per \`play.track/release/versionCodes/rollout\` e \`ASC build/version/reviewStatus\`; dashboard unica per app. Aggiungere stato \`last_verified_remote_at\`, stato review e “pending changes”.
- Non chiamare “release avvenuto” il solo commit di una listing.

**P1-G · Scritture App Store metadata non atomiche**
- Evidenza: \`scripts/asc-metadata.ts\` aggiorna separatamente \`appInfoLocalization\` e \`appStoreVersionLocalization\`; se la seconda API fallisce, la prima potrebbe essere già stata applicata, mentre la procedura registra genericamente failed.
- Soluzione: preflight tutti i campi/locales/stati editabili, log step per step, lettura **post-write** dello stato remoto, classificazione \`partial_applied\`, istruzioni di ripristino. Non promettere rollback atomico su API esterne.

**P1-H · Comunicazione errata sulla tempistica di Google Play**
- Evidenza: \`scripts/play-push-copy.ts\` e \`docs/guide/operating-playbook.md\` dichiarano che il testo va live “in poche ore senza review”.
- Da documentazione ufficiale Google, modifiche store listing **possono richiedere review** e con Managed publishing non diventano pubbliche finché non vengono approvate/pubblicate. Correggere immediatamente messaggi e report (sul remoto lo stato va verificato). Vedi link Google sotto.

**P1-I · Test di GSC e regressioni prima del rollout**
- Evidenza: \`fix/gsc-daily-history-2026-10-11\` contiene correzione daily-grain, marker version 2, paginazione e test aggiunti \`tests/gsc-*.test.ts\`; nessun test realmente eseguito nella revisione remota.
- Soluzione: eseguire \`pnpm run db:backup\` → \`pnpm run test:gsc\` → \`pnpm typecheck\` → \`pnpm build\` in ambiente locale → sync di 1 proprietà con confronto GSC UI. Misurare dimensione DB e runtime; su VitaRomagna evitare di importare per default milioni di query/page per intero storico senza limiti/archiviazione. Non sostituire i dati reali con mock.

### P2 — Piattaforma decisionale e flusso release

**P2-A · Interrogazioni cross-source realmente utili**
- Metriche e confronti 7/28/90 giorni e per piattaforma (Android/iOS), screenshot/landing/source, nuovi utenti vs revenue vs churn quando disponibili.
- Domande: “Da quale app guadagno di più per 1000 download?”, “Quali pagine GSC meritano una landing?”, “L'ultimo aggiornamento ha coinciso con cambiamenti di crash, rating o conversione?”, senza inferire causalità automaticamente.
- Separare \`observed\` da \`estimated\` (ad revenue vs fatturato, MRR snapshot vs revenue effettivo, downloads vs installs). Salvare fuso, unità, intervallo e \`fetched_at\`.

**P2-B · Dashboard Releases**
- Per progetto: package name e bundle ID verificati, release Android (internal/closed/open/production e % rollout), release iOS (TestFlight/ready/in review/released), ultimi versionCode/buildNumber, note di versione e store copy locale per lingua.
- Checklist prima del release: versione incrementata, manifest/schede privacy, credenziali/build disponibili, QA, screenshot/localizzazioni, testo What's New, mapping id confermato.
- Stato remoto letto da API, non stimato dal risultato di un comando CLI.
- Storico append-only: \`planned, approved, started, uploaded, in_review, live, failed, partially_applied\`; who/when/target/hash, diff redatto senza segreti.

**P2-C · Riutilizzare Fastlane per il build/release, non sostituirlo**
- OpenFindability deve diventare **control plane**: osserva versioni e stato, prepara copy e report, innesca un runner **esplicito** solo se collegato dall'utente. Build Flutter/Fastlane (Android/iOS) va gestito separatamente, idealmente tramite il setup di rilascio centralizzato già valutato.
- Per iOS l'upload binari può avvenire via strumenti Apple/Transporter o API Build uploads; non tentare di implementare un uploader fai-da-te nel dashboard analytics come primo passo.
- Il flusso \`--dry-run\` + approvazione è obbligatorio per qualunque nuova azione di pubblicazione. Nessuna GitHub Action automatica richiesta da questo documento.

**P2-D · Qualità del prodotto per l'uso settimanale**
- Vista “Questa settimana: 5 azioni concrete”, ciascuna con numero attuale, delta, fonte, confidenza, costo stimato e link alla pagina/listing.
- Badges di freshness e partial sync, non solo verde/rosso “success”.
- Ricerca trasversale (progetto, URL, keyword, package), calendario rilasci e confronto *prima/dopo rilascio* basato su intervalli e annotazioni.
- Dati privati: ruoli/accesso prima di qualsiasi servizio web remoto; lettura e scrittura separate.

## Roadmap prioritaria e criteri di completamento

| Ordine | Intervento | Perché ora | Verifica |
|---|---|---|---|
| **1 — P0** | Rimuovere side effect GET/SSR, serializzare writer, passare a upsert incrementali SQLite | Evitare perdita dati e accessi incontrollati | Test concorrente, rollback, GET innocuo |
| **2 — P0/P1** | Validare fix GSC già nel branch precedente; backup e test reali | Lo storico deve essere affidabile prima dell'export | Test + confronto UI GSC, date/copertura corrette |
| **3 — P1** | Correggere parser Play CSV, stati sync parziali, finestre KPI e scope opportunità | Le raccomandazioni AI dipendono da numeri corretti | Fixtures + test zero vs missing + periodi coerenti |
| **4 — P1** | Proteggere mapping cross-store e scritture listing, correggere messaggi sul review | Evitare di modificare l'app sbagliata o credere che sia live | Diff e conferma su package/versione/locale; stato remoto |
| **5 — P1** | Apps Script GSC → Sheet giornaliero | Statistiche SEO su mobile a PC spento | 3+ domini, nessun duplicato, last_data_date |
| **6 — P2** | Export snapshot non-GSC → Sheet; \`SyncStatus\` e sicurezza | ChatGPT vede anche revenue/installazioni/ASO | Dry run, limitazione dati, lettura realistica Android |
| **7 — P2** | Release status read-only + release ledger; integrazione runner Fastlane opt-in | Gestione rilasci tracciabile | Versioni/build/track corrispondono agli store |
| **8 — P3** | Cloud always-on solo se serve refresh multi-fonte indipendente dal PC | Evitare infra prematura | Decisione guidata da necessità e costi reali |

## Cosa NON fare

- Non sincronizzare \`data/openfindability.db\` byte-per-byte su Google Drive come “database live”. SQLite + WAL + sync file remota non sostituiscono un DB condiviso sicuro.
- Non pubblicare \`/api/sync\` e la dashboard local-first su Internet senza autenticazione e separazione delle autorizzazioni.
- Non ricopiare il JSON del service account dentro Apps Script, Google Sheets o ChatGPT.
- Non fare release dagli stati modificati manualmente nel foglio: è un report, non una coda di comandi.
- Non archiviare tutti i 16 mesi di \`query,page,date\` GSC in Sheets; il volume e le quote renderebbero l'analisi peggiore.
- Non integrare subito tutti i provider esterni: il ROI più alto ora è dati corretti + interrogazione semplice + stato reale del rilascio.
- Non dichiarare “zero” o “nessuna crescita” se l'API ha fallito, ha un limite o non ha ancora dati finali.

## Limiti e fonte di verifica

Revisione **statica** del repository. Non sono stati letti né modificati i dati personali in \`data/openfindability.db\`, non sono state eseguite API Google/Apple reali, build, test TypeScript, deploy o GitHub Actions in questa analisi. Prima di considerare una correzione applicata serve implementazione e validazione locale.

File esaminati, tra gli altri:
- \`lib/store.ts\`, \`lib/db/client.ts\`, \`lib/sync.ts\`, \`lib/insights.ts\`, \`lib/doctor.ts\`, \`mcp/server.ts\`
- \`lib/connectors/gsc.ts\`, \`lib/gsc-detail.ts\`, \`lib/connectors/play-console.ts\`, \`lib/connectors/play-gcs-stats.ts\`
- \`lib/connectors/appstoreconnect.ts\`, \`lib/connectors/appstoreconnect-analytics.ts\`
- \`app/page.tsx\`, \`app/api/sync/route.ts\`, \`scripts/discover-apps.ts\`, \`scripts/play-push-copy.ts\`, \`scripts/asc-metadata.ts\`
- \`README.md\`, \`AGENTS.md\`, \`CLAUDE.md\`, \`docs/guide/operating-playbook.md\`, \`docs/guide/gsc-google-sheets-appscript-integration.md\`.

Riferimenti esterni:
- Apps Script quote/runtime: https://developers.google.com/apps-script/guides/services/quotas
- Google Sheets API limiti/quota: https://developers.google.com/workspace/sheets/api/limits
- Google Drive limiti file Sheets: https://support.google.com/drive/answer/37603
- Search Console API quote: https://developers.google.com/webmaster-tools/limits
- Google Play Edits API: https://developers.google.com/android-publisher/edits
- Play publishing e review: https://support.google.com/googleplay/android-developer/answer/9859654
- Apple build upload: https://developer.apple.com/documentation/appstoreconnectapi/build-uploads
- Apple App Review: https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app

## Follow-up tecnico pronto per lo sviluppo

1. Implementare \`safeSyncProject\` e rimozione side-effect GET/SSR, con test concorrenti e migrazione graduale dal full-rewrite store.
2. Normalizzare la semantica dei sync outcomes e le finestre comuni KPI, senza alterare le metriche di monetizzazione già corrette.
3. Implementare Apps Script GSC e un **\`sheet:export --dry-run\`** separato con stato/fonte/date ben visibili.
4. Implementare solo lettura status release Apple/Google; poi valutare runner Fastlane con approvazione umana e audit trail.
