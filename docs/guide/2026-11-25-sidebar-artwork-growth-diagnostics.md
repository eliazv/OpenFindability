# Sidebar, artwork e diagnostica growth

Branch: `feat/growth-intelligence-data-foundations`. Continua il lavoro di [growth intelligence](2026-11-25-growth-intelligence-foundations.md).

## Navigazione

- Icona impostazioni accanto a Progetti: apre la gestione dell'elenco completo, anche per progetti nascosti.
- Riordino tramite trascinamento, oppure frecce su/giù (anche da tastiera e touch). Il salvataggio è atomico e valida tutti gli ID.
- Nascondere un progetto dalla sidebar non cancella dati, non disattiva importazioni e non altera i totali. La ricerca Ctrl+K può ritrovare i progetti nascosti digitandone il nome.
- I progetti archiviati nelle preferenze sono nascosti di default, salvo esplicita scelta di mostrarli. Nascondere solo dalla sidebar non archivia il progetto nella home.
- Ripristina torna all'ordine automatico (preferiti, poi nome) e alla visibilità predefinita. I nuovi progetti sono aggiunti dopo quelli ordinati manualmente.
- Panoramica, Centro dati e Strumenti restano fissi per non perdere i punti di accesso. Non si riordinano le voci globali in questo intervento.
- La migrazione 0016 aggiunge due colonne nullable a `project_dashboard_preferences` senza cambiare i dati esistenti. L'upsert della navigazione non modifica preferiti, archiviazione, obiettivi o metriche.

## Icone delle app

Ordine di risoluzione: file personalizzato in `data/project-icons/<slug>.png`, icona del repo Flutter/Studio, artwork pubblico App Store (ID esatto), artwork Google Play (package esatto), favicon web e infine icona generica. Non si cercano app per somiglianza del nome.

- Apple: lookup pubblico per track ID, storefront IT poi US, verifica del risultato e dell'host CDN.
- Google Play: immagine OpenGraph della scheda pubblica in IT, non API privata. Il markup può cambiare o la scheda non essere disponibile; in tal caso si mantiene il fallback.
- Cache locale per identità store, in `data/project-icons/store`, con dimensione massima 128 KiB e controllo firma PNG/JPEG/WebP. Nessun fetch degli store durante la renderizzazione.
- Aggiornamento best effort durante il sync generale o quello degli store; recupero manuale in Organizza sidebar, refresh forzato nelle integrazioni di un singolo progetto. Tentativi falliti limitati a una volta al giorno, cache riuscita 30 giorni. Un errore artwork non modifica l'esito dei dati analytics.
- Il download non richiede le credenziali degli account store e non invia dati privati del progetto, solo ID pubblici. Nessuna modifica allo store.

## Analisi aggiunte

Acquisizione → Analisi:
- CTR ponderato per fasce di posizione e segmento brand/non-brand. I termini brand vengono inseriti esplicitamente, non indovinati dal nome. Le query candidate sono confrontate con peer escludendo se stesse; almeno 10 peer e 2.000 impression, gap stimato non garantito.
- Campione massimo 5.000 query per impression, estratto GSC e non universo completo. I gruppi lessicali sono sovrapposti, non cluster semantici esclusivi.
- Conversioni GA4: confronto per host, canale, source/medium, device, fuso e identici giorni osservati. Solo qualità standard, tasso ponderato per sessioni. Non è una stima causale.

Store → Temi nelle recensioni: menzioni lessicali IT/EN, conteggi 1–2 stelle, nessuna inferenza del sentiment. Solo recensioni Play già importate; non importare recensioni iOS senza un connettore dedicato.

Home → Report: Markdown del periodo selezionato con metriche, variazioni, opportunità e stato delle integrazioni. CLI `pnpm report:portfolio -- 28`. MCP `get_seo_diagnostics`, `get_conversion_opportunities`, `get_review_themes`, `get_portfolio_report`.

Correzioni: RevenueCat non inventa zeri per metriche assenti; aggiornamento di copertura usa lag del catalogo; scope growth/interventions include i download iOS; sync saltati/falliti non applicano scritture analytics.

## Validazione

Test isolati eseguiti con Node 22 e transpileModule TypeScript, copiando i sorgenti e i test dal branch e verificando gli SHA dei blob: 4/4 passati (due navigazione, due artwork con risposte simulate). Verificato in SQLite in memoria il pattern ALTER TABLE/upsert con conservazione delle preferenze. I test di diagnostica sono aggiunti ma non ancora eseguiti. Nessun recupero artwork reale, sync provider o aggiornamento DB reale eseguito durante lo sviluppo.

Prima del merge: backup sul branch stabile (`pnpm db:backup`), poi `pnpm typecheck`, `pnpm test:dashboard-analytics`, `pnpm test:reliability`, `pnpm test:gsc`, `pnpm test:growth-evidence`, `pnpm build` e verifica visuale locale. Ambiente remoto senza pnpm/Node 24 e con DNS GitHub non risolvibile: suite completa non eseguita.

Follow-up: costi e breakdown abbonamenti per prodotto richiedono dati/permessi effettivi e una definizione di costi; date di pubblicazione certe richiedono evidenze store (non data upload, creazione o invio in revisione); schedulazione report non attivata; consolidare report CLI legacy rimanenti. La classificazione recensioni e keyword è deterministica, non AI semantica. I termini brand restano nel filtro URL, non preferenze persistenti.
