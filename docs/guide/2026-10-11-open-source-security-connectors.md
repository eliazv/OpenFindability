# OpenFindability: repository pubblico, sicurezza e roadmap connettori

Data: 2026-10-11. Revisione: branch fix/reliability-stats-store-2026-10-11. Le funzionalità marcate come future **non sono ancora implementate**.

## Decisione: lasciare open source?

**Sì, per ora.** Tre stelle non misurano il valore dello strumento per chi lo usa ogni giorno. Il repo vale come portfolio e soluzione personale se resta installabile, sicuro, generico e comprensibile anche da altri. La visibilità privata ha senso quando non si riescono a separare dati/clienti/segreti o quando il costo di mantenimento pubblico supera il beneficio.

Focus pubblico: analytics per indie developer che gestiscono siti e app, opportunità basate su dati e lettura degli stati store; non un nuovo Semrush, non un SaaS multipiattaforma completo, non un framework universale di rilascio.

## Audit remoto sulle credenziali

Repository verificato pubblico. Ricerca dei file GitHub indicizzati di pattern GitHub token, AWS/Google keys, private key, password, email, documenti Google, chiavi RevenueCat e refresh token: nessuna credenziale effettiva chiaramente individuata negli estratti controllati. I nomi di variabili credenziali rimandano generalmente a codice che legge l'ambiente o a placeholder documentali.

**Questo NON certifica l'intera cronologia Git**: GitHub Code Search e campioni di commit non coprono automaticamente tutte le versioni di tutte le branch. Serve la clone locale e una scansione completa prima di affermare che non è mai stato pubblicato un segreto.

Problemi accertati:
- Cartella privata project-reports/ documentata ma non esclusa dal .gitignore: corretta.
- Aggiornato .gitignore per signing keys Android/iOS, database, configurazioni Firebase e artefatti credenziali.
- Aggiunto SECURITY.md, comandi locali di scansione, correzioni alla documentazione obsoleta sul percorso SQLite.
- Protezione delle operazioni di seed demo su un DB già popolato.

Da eseguire localmente:

~~~bash
pnpm run audit:secrets
pnpm run audit:secrets:history
# Controllo indipendente se Gitleaks è installato:
gitleaks git --redact --log-opts="--all"
~~~

Poi verificare Security → Secret scanning e Settings → Security & analysis di GitHub. In caso di chiave realmente esposta: prima revoca/rotazione, poi analisi accessi e soltanto dopo eventuale pulizia della history. Non stampare, allegare o committare token nei report di audit.

## Struttura consigliata (evoluzione incrementale, NO monorepo)

~~~text
lib/
  analytics/               normalizzazione, KPI, scenari, opportunità
  connectors/
    catalog.ts             fonti, granularità, ritardi, check salute
    gsc.ts, ...            adapter API/provider
  db/                     SQLite, transazioni e repository mirati
  release/                piano, stato e audit (futuro)
integrations/
  google-sheets-gsc/       Apps Script indipendente dal PC (futuro)
scripts/
  growth-summary.ts       snapshot multi-provider read-only
  store-status.ts         stato versioni/rollout Android e iOS
  audit-public-repo.mjs   verifica privacy/security locale
mcp/
  server.ts               thin adapter per gli stessi servizi
docs/
  guide/                  setup per caso d'uso
  operations/             sicurezza, backup, diagnosi
project/, secrets/        file locali privati e ignorati
~~~

Contratto per ogni futuro connettore: discover/configure → fetch paginato → normalizzazione (timezone, unità, grain, currency) → upsert idempotente → health data freshness e status partial/no_data → query/brief per CLI/UI/MCP. **Write API** per metadati e release rigorosamente distinta, con dry-run, approvazione e verifica del risultato remoto.

Il catalogo lib/connectors/catalog.ts è già nel branch; get_growth_snapshot via MCP e growth:summary via CLI riusano lo stesso codice per una panoramica offline multi-provider.

## Connettori candidati: cosa aggiungere veramente

| Priorità | Integrazione | Beneficio | Stato |
| --- | --- | --- | --- |
| Alta | Google Sheets (Apps Script GSC + snapshot export locale) | Consultazione ChatGPT Mobile anche a PC spento; dati non-GSC aggiornati quando OF sincronizza | Da implementare |
| Alta | GA4 Data API | Traffico, landing e conversioni per i siti che non usano Umami; unione ragionata con GSC | Da implementare |
| Alta | Google Play/App Store release state + Fastlane runner esterno | Stato effettivo di versioni, track, review e QA prima/dopo rilascio | Read-only CLI implementata; runner non implementato |
| Medio-alta | GitHub tags / commits / releases | Collegare commit e versioni agli andamenti delle app; utile per release ledger | Da implementare |
| Media | Crashlytics → BigQuery oppure Sentry API | Crash e problemi per versione iOS/Android | Condizionale ai servizi già usati e ai costi |
| Bassa/condizionale | Stripe, Lemon Squeezy, Paddle | Ricavi web non gestiti da RevenueCat | Solo se realmente usati |
| Bassa/condizionale | PostHog/Plausible/Cloudflare Analytics | Analytics alternativi di progetti specifici | Non duplicare i dati di GA4/Umami |
| Non ora | DB cloud completo, servizi 24/7, monorepo | Costi e superficie d'attacco sproporzionati | Rinviare |

### Implementazioni tecniche consigliate

- **GA4**: endpoint ufficiale properties.runReport, account read-only, property per progetto, metriche giornaliere e landing; attenzione a diverse definizioni rispetto a GSC.
- **Crashlytics**: Firebase supporta export in BigQuery, ma verificare piano, costi e volumi; con Play Vitals già presente non importare doppio Android senza vantaggio.
- **Sentry**: endpoint issues/releases, solo se l'utente usa già Sentry.
- **Fastlane**: mantenere il flusso build/upload Flutter separato, OpenFindability come control plane con store status e audit; nessuna azione automatica da Google Sheets.

Fonti:
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties
- https://firebase.google.com/docs/crashlytics/bigquery-export
- https://docs.sentry.io/api/releases/
- https://docs.fastlane.tools/getting-started/cross-platform/flutter/
- https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning
- https://github.com/gitleaks/gitleaks

## Implementato in questo branch

- SQLite revision guard tra connessioni, snapshot consistenti, aggiornamento delle sole **tabelle modificate** con tutela delle dipendenze FK. Rimangono riscritture di righe all'interno della tabella modificata: per GSC serve ulteriore upsert per riga.
- GET di sync non mutante, POST localhost same-origin esplicito, home read-only.
- Parser CSV Play con campi quotati/valori mancanti corretti, sync partial/no_data, Doctor più informativo e soglie per fonte.
- Scoperta app dry-run, niente linking fuzzy automatico; copia store con limiti e distinzione da pubblicazione effettiva.
- Stato release via CLI in sola lettura; snapshot multi-provider tramite MCP e CLI con data/copertura per fonte.
- Sicurezza del repo pubblico e scanner della cronologia Git da eseguire localmente.

## Non fatto / da verificare

Non sono stati eseguiti i test in un checkout locale con dipendenze e credenziali reali. Eseguire backup prima del primo sync su DB esistente:

~~~bash
pnpm install
pnpm run db:backup
pnpm run test:gsc
pnpm run test:reliability
pnpm run typecheck
pnpm run build
pnpm run audit:secrets:history
~~~

Non sono stati creati Google Sheets, installati Apps Script, attivati trigger, eseguiti GitHub Actions, caricati binari mobile o modificati dati reali. Prossimo step reale: convalidare questi fix, completare upsert SQL a livello riga e poi realizzare Apps Script + Sheet exporter. Non rendere pubblico il processo locale Next.js senza autenticazione completa.
