# Dashboard: navigazione, densità e prestazioni

Branch `feat/dashboard-navigation-performance`, base `355ff750ef8c455ce3d20e9b78fda5a7f3b6b1cd` (ultimo master, comprende il fix utente GSC). Implementazione nel codice, non mockup.

## UI
- Sidebar collassata: icone centrate e testi realmente nascosti, rail più largo, tooltips e scroll verticale. Store Studio raggiungibile direttamente oltre a Strumenti e Centro dati.
- Header senza doppio marchio né breadcrumb ripetitivo. Sync progetto secondario, icon-only con stato. Tab attivi senza titolo duplicato; selettore periodo sulla stessa toolbar, a capo su mobile, non mostrato dove il periodo non ha effetto.
- KPI disponibili tutti visibili in griglia compatta, niente "Altre metriche"; fonti senza dati non generano card vuote. La selezione grafico aggiorna lo stato URL sul client, senza nuova lettura SQLite. Serie dati scaricabile in CSV, rimossa la tabella duplicata sotto il grafico. Legenda essenziale e confronti solo quando esistono osservazioni.
- Tabelle con toolbar compatta, azioni icona, dettagli a lato e titoli interni non ripetuti nelle sezioni espandibili. Storici tecnici restano accessibili; nessun dato fittizio.
- Icone: precedenza alle risorse locali, poi favicon del sito (websiteUrl, proprietà GSC, Bing o AdSense), richieste direttamente dal browser. Se i comuni percorsi non esistono, simbolo web/app/misto. Non viene analizzato il markup HTML remoto, non si usa un proxy/server-side fetch né un servizio Google di favicon.

## Prestazioni
- GSC: conservato il fix master che aggrega in SQL; nuovo reader applica ricerca, sort e paginazione SQL (25 righe, clamp pagina). Campioni per BarList e scatter limitati a 10 e 200. Le ricerche riguardano query/URL e usano lower() SQLite (case folding non completo per Unicode); parametri bindati, sort a whitelist. I grafici non cambiano al filtrare la tabella.
- Proiezioni dashboard senza rawJson dove non serve; mantenuto per evidenza interventi. Ultima riga per fonte/progetto per freshness, ultime esecuzioni per stato in home/overview, opportunità aperte soltanto in home/overview. GA4 landing acquisition limitata al periodo richiesto. Cache React per icone locali per render.
- Sparkline SVG senza istanze Recharts/ResizeObserver separate. Prefetch disabilitato sui link di navigazione progetti e pagine/sort delle tabelle pesanti.
- Nessuna migrazione, nuova dipendenza o modifica del contratto CLI/MCP/sync.

## Verifica e limiti
Verifica statica del codice e confronto Git. Query SQL riprodotta su SQLite in memoria con fixture: paginazione, clamp, filtro, esclusione legacy e isolamento progetto, selezione ultima riga superati. Aggiunti test Node per GSC e favicon; non eseguita la suite completa, build, typecheck o verifica browser. Nessun benchmark sul database reale: velocità effettiva da misurare con dataset e macchina dell'utente. La pagina GSC continua a dover aggregare tutte le righe del periodo in SQLite, ma evita di trasferire tutti i gruppi in JavaScript. Ulteriore paginazione SQL sulle altre tabelle da valutare in base al profiling.
