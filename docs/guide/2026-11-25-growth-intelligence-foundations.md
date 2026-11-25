# Growth intelligence — 25 novembre 2026

Branch: `feat/growth-intelligence-data-foundations`. Base: `feat/dashboard-navigation-performance` (include il fix GSC SQL di master).

## Implementato

- Sync CLI/dashboard con lock SQLite condiviso, transazione atomica per progetto/fonte, upsert a blocchi, revisioni per invalidare la cache. La normale importazione parte dai giorni recenti e amplia la finestra se trova buchi negli ultimi 30 giorni. ASO resta esplicito. Le fonti senza granularità giornaliera mantengono la propria semantica.
- Centro dati: copertura osservata (non certificazione di completezza), fonti e log riconoscibili, ritardi, durata, esito, contatori selezionati, progresso, retry/backfill per fonte e backup locale verificato. I payload grezzi non vengono inclusi nel registro visuale.
- Dashboard: vista elenco o card, preferiti, archiviazione visuale senza cancellazione, metriche preferite, obiettivi, periodi personalizzati e confronti. L'archiviazione riguarda la lista, non elimina i valori storici dai totali.
- SEO: confronto pagine/query, dettaglio giornaliero e associazioni, gruppi per percorso, distribuzione posizioni, export CSV filtrato completo, cache GSC limitata e invalidata da revisione. Confronto annuale = 52 settimane. Le entità assenti non diventano zero.
- Growth: variazioni sopra soglie minime con copertura confrontabile, opportunità persistenti e stati di lavoro, interventi registrabili da UI, analisi prima/dopo per release registrate, movimenti ranking ASO, ricavi pubblicitari per formato/fonte, eCPM/match rate ponderati. Nessuna attribuzione causale automatica.
- MCP: `get_portfolio_summary`, `get_anomalies`, `get_data_quality`, `get_top_gainers_losers`, `get_revenue_breakdown`, `get_action_plan`, `get_release_impact` e `record_intervention`. Letture più selettive, aggregazioni dashboard riutilizzate per i nuovi output. L'ultimo tool salva su richiesta esplicita; gli altri sono letture locali.
- Loghi: favicon dirette degli stessi provider, con icone locali di fallback; nessun proxy remoto. Un provider può restituire una favicon generica o impedirne il caricamento.

## Aggiornamento e verifica

La migrazione 0015 aggiunge solo la tabella delle preferenze. Prima di avviare il nuovo branch sul DB reale, eseguire `pnpm db:backup` sul branch stabile. Non applicare la migrazione o lanciare un sync reale prima di avere un backup.

```sh
pnpm typecheck
pnpm test:dashboard-analytics
pnpm test:reliability
pnpm test:gsc
pnpm test:growth-evidence
pnpm test:integrations
pnpm build
```

Aggiunti test Node per transazioni, lock, copertura, preferenze, confronto SEO, gruppi URL e valute. Verifiche eseguite in SQLite Python in memoria: query confronto SEO, raggruppamento ponderato, pattern upsert/rollback, default della migrazione; tutte superate. Non equivalgono alla suite Drizzle/Next completa. Il runner di sviluppo non dispone di Node 24/pnpm/dependency install e il clone GitHub è bloccato da DNS. Nessun dato reale o chiamata provider è stato modificato/eseguito.

## Limiti e follow-up

- Prima del merge: typecheck, suite, build, benchmark su copia del DB e smoke test dei connettori. Validare soprattutto importazioni parziali, lock, migrazione e confronto di totali col branch stabile.
- Copertura misura la presenza di righe; le API possono restituire dati parziali o ritardati. Le query GSC sono top rows, non l'intero universo di query. Il confronto non imputa righe mancanti.
- Gli alert sono euristiche deterministiche, non un modello predittivo. I dati RevenueCat sono snapshot, non ricavi giornalieri.
- Restano da completare: armonizzazione di ogni report/CLI legacy, baseline CTR specifica per sito, branded/non-branded e clustering avanzato, analisi semantica delle recensioni, opportunità per conversioni, ricavi/costi e breakdown abbonamenti per prodotto se autorizzati e disponibili, rilevazione automatica della data di pubblicazione effettiva, report schedulati. Non attivare automazioni periodiche senza una scelta esplicita di frequenza.
- Export GSC completo calcolato localmente; non è uno streaming end-to-end. Le altre tabelle esportano i risultati filtrati fino a 5000 righe, oltre quella soglia la pagina corrente.


## Continuazione

Vedi [Sidebar, artwork e diagnostica growth](2026-11-25-sidebar-artwork-growth-diagnostics.md) per la seconda fase, le nuove analisi e i limiti aggiornati.
