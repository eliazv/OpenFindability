# Refactor dashboard — stato del branch

Branch: `feat/dashboard-analytics-refactor`. Base: ultimo master `4d5ab68829a9c4146294d5a27ab6ca2861a846a8` + due commit di analisi. Non modificare master fino al collaudo.

## Implementato nel codice

- Portfolio con KPI globali omogenei, confronti, esclusioni esplicite dei progetti con copertura/valuta incompatibile, ricerca e filtro web/app/misto.
- Sidebar persistente, icone locali con fallback, navigazione per progetto, ricerca rapida Ctrl/Cmd+K e tema chiaro/scuro persistente.
- Panoramica progetto e sezioni Acquisizione, Store, Ricavi, Salute, Opportunità, Interventi, Integrazioni; Centro dati e Strumenti globali.
- Componenti dashboardcn adattati: Sparkline, DeltaBadge e BarList. Licenza MIT conservata. Chart principali e scatter SEO su Recharts 2 esistente.
- Periodi 7/28/90/365 giorni, confronto con periodo precedente, coverage, gap null, CTR ponderato, posizione ponderata, ranking query, scatter, grafici ASO, metriche store, ricavi per fonte/valuta, andamento crash/ANR e performance web per URL/dispositivo/fonte. Annotazioni e confronto degli interventi, senza attribuzione causale implicita.
- Explorer riusabile con ricerca, sort, paginazione, dettaglio laterale e CSV della pagina corrente con neutralizzazione formule. Letture SQLite per dominio/progetto, senza migrazioni; ordinamento e paginazione avvengono dopo lettura scoped, non tramite LIMIT SQL.
- Stato connettori, ultimo dato vs ultima sincronizzazione, registro e tracker 14 giorni. Sync manuale mirato con controlli same-origin; niente sync automatico né pubblicazione da una visita. Doctor completo resta un comando esplicito.
- Loading/error state, test dedicati metriche/CSV/store, note di implementazione.

## Verifiche effettive

I 7 test puri di `dashboard-metrics.test.ts` e `dashboard-csv.test.ts` sono passati (7/7), eseguendo i quattro file sorgente/test corrispondenti ai blob Git verificati del branch, transpilation TypeScript e Node 22 nell'ambiente isolato. Non equivale al typecheck completo. Il repo richiede Node 24 e pnpm; checkout git bloccato da DNS e pnpm non disponibile nell'ambiente. Nessun avvio Next.js, screenshot, build o test SQLite completo eseguito. Nessun dato locale reale letto, nessun sync, nessuna modifica ai database utente. Non considerare il branch pronto al merge finché questi controlli non passano.

## Cosa resta

- Eseguire collaudo completo: installazione da lockfile, typecheck, suite analytics/reliability, build, navigazione desktop/mobile e controllo visivo con dataset locale; correggere eventuali regressioni.
- Valutare TanStack Table e Recharts 3 in una migrazione separata dopo test di compatibilità; i componenti importati sono adattati alla versione installata. Non è stata installata l'intera registry dashboardcn, Tremor o altre librerie.
- Date arbitrarie, confronto anno precedente, selezione colonne persistente, CSV dell'intero risultato filtrato, paginazione SQL e virtualizzazione se necessaria dopo profiling.
- Ulteriori grafici specialistici (scatter ASO, soglie ufficiali dove verificabili, breakdown avanzati), workflow operativi guidati con preflight e conferma esplicita; distinzione più fine delle fonti non configurate/in attesa/parziali.
- Test visuali e accessibilità completa. Non sono stati introdotti dati demo al posto di dati reali mancanti.

## Collaudo locale (Node 24)

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:dashboard-analytics
pnpm test:reliability
pnpm test:gsc
pnpm build
pnpm dev
```

Verificare con progetti web/app/misti, sorgenti mancanti, valute diverse, periodi incompleti, dataset vuoto, navigazione mobile e tema scuro. Per le icone opzionali inserire PNG locali in `data/project-icons/<slug>.png`; altrimenti viene tentata l'icona della configurazione Store Studio locale e usato il fallback delle iniziali.

## Revisione successiva — gerarchia e copertura

Vedi [Dashboard — gerarchia e copertura](2026-11-25-dashboard-gerarchia-e-copertura.md) per le correzioni successive: dashboard orientata ai risultati, metriche ripristinate, un grafico per sezione, dettagli espandibili, microcopy ridotto, copertura per fonte e calendario ricavi. Revisione statica; nessun nuovo test, build o verifica visuale in questa fase.
