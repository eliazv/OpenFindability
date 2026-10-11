# Implementazioni del 2026-10-11 — SQLite GSC, GA4, Apps Script e Google Sheets

Branch: `feat/ga4-gsc-sheets-incremental-2026-10-11`, derivato dal precedente branch di affidabilità. Nessuna GitHub Action eseguita e nessun rilascio agli store.

## Implementato nel codice

1. **SQLite incrementale GSC**: `lib/store.ts` confronta le versioni delle righe `search_queries` e `page_metrics` e modifica solo quelle rimosse/nuove/cambiate usando prepared statements. Rimane la transazione SQLite con revision guard. Il resto delle tabelle usa ancora la scrittura selettiva per tabella; questa PR non introduce un nuovo database.
2. **GA4**: `lib/connectors/ga4.ts`, nuovo `SourceType=ga4`, campo `projects.ga4_property_id`, migrazione Drizzle `0009_puzzling_snowbird` (rinumerata al merge in master: `0007`/`0008` erano già occupate), CLI `--ga4` nei comandi project e `pnpm run sync:ga4`. Usa servizio Google read-only; per giorno raccoglie utenti attivi, sessioni, visualizzazioni ed eventi chiave. `lib/analytics/growth-snapshot.ts` e pagina progetto mostrano GA4 separata da Umami.
3. **Apps Script autonomo**: `integrations/google-sheets-gsc/Code.gs` e manifest. Crea fogli/trigger (solo dopo autorizzazione), backfill manuale 90 giorni totali GSC, refresh quotidiano D-11..D-2 e dettagli top pages/queries di 3 giorni.
4. **Exporter Google Sheets**: `lib/integrations/sheets-export.ts` e CLI `pnpm run sheet:export`; modalità predefinita `--dry-run`, `--apply` esplicito. Esporta solo le schede `OF_*` con 90 giorni di KPI non-GSC, no note/private rawJson, no chiavi, cap 20k righe/tab. Non tocca le schede di Apps Script.
5. **Test offline**: `tests/ga4.test.ts`, `tests/sheets-export.test.ts`, nuovo test di delta SQLite in `tests/store-concurrency.test.ts`.

## Google Sheet creato nell'account dell'utente

Il foglio privato `OpenFindability - Analytics (GSC e KPI)` è stato creato con schede:
`Properties`, `Daily`, `TopPages`, `TopQueries`, `SEO_Overview`, `SyncLog`, `OF_Projects`, `OF_DailyMetrics`, `OF_Revenue`, `OF_AppMetrics`, `OF_SyncStatus`.

Non riportare il suo ID/URL in un repository pubblico: rimane un identificativo di risorsa privata. L'esempio `sc-domain:example.com` nella tab `Properties` è disabilitato.

**Importante**: la creazione del foglio non installa Apps Script, non crea OAuth grant/triggers e non concede automaticamente l'accesso al service account locale. Questi passaggi richiedono l'autorizzazione del proprietario di Google. Vedi `docs/guide/google-sheets-live-setup.md`.

## Limiti attuali e decisioni

- **Dati GSC di Apps Script**: i totali sono date-only, pagine/query sono *top rows* con cap giornaliero; non rappresentano tutti i termini cercati. Non sommare proprietà URL-prefix e domain che si sovrappongono.
- **GA4**: somma utenti attivi giornalieri non equivale a utenti unici della finestra; report separato da sviluppare se necessario. Nessuna applicazione retroattiva ai dati esistenti finché non si lancia la sincronizzazione. GA4 richiede API abilitata e ruolo Viewer per l'email del service account.
- **Esportatore**: si aggiorna solo quando viene eseguito dalla macchina di OpenFindability. Google Sheet è sempre consultabile, ma a PC spento solo GSC (una volta attivato il trigger) si aggiorna autonomamente.
- **Persistenza**: le query/page GSC usano row delta; metadati progetto e altre tabelle ancora non sono tutti su upsert riga-per-riga. No nuova coda/server/cron/Apps Script Web App pubblica.
- **Sicurezza**: foglio privato, usare scope minimi e solo tab di proiezione. Nessuna operazione di pubblicazione store viene controllata da Google Sheets.
- **Test**: la sintassi del file `Code.gs` è stata compilata con un parser JS (esito OK), la struttura GitHub è stata letta e verificata. Non sono stati eseguiti `pnpm typecheck`, `pnpm test:integrations`, `pnpm build` sul checkout locale: GitHub Actions esplicitamente non invocate e il container non ha un checkout raggiungibile via rete.

## Checklist di attivazione senza automazioni GitHub

```bash
pnpm install
pnpm run db:backup
pnpm run test:gsc
pnpm run test:reliability
pnpm run test:integrations
pnpm run typecheck
pnpm run build
pnpm run project:update -- --slug <slug> --ga4 <numeric-property-id>
pnpm run sync:ga4
pnpm run sheet:export -- --days 90
# Solo dopo verifica delle credenziali e del foglio privato:
pnpm run sheet:export -- --days 90 --apply
```

Sul foglio: Estensioni → Apps Script → copia `Code.gs` e manifest → autorizza → `setupGscSync` → inserisci le proprietà reali in `Properties` → `backfillGscDaily` → `syncGscDaily`. Controlla `SyncLog` e valori in Search Console.

Leggi anche:
- `docs/guide/ga4-setup.md`
- `docs/guide/google-sheets-live-setup.md`
- `docs/guide/gsc-google-sheets-appscript-integration.md`
