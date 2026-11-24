# Dashboard — revisione gerarchia, copertura e microcopy

Revisione statica del branch `feat/dashboard-analytics-refactor` a partire dal commit `c83789546833f3a0596d4c6470a69e6edeb6b153`. Confrontati UI originale (master), tipi di dati, letture SQLite, connettori e nuove viste. Interventi implementati nel branch; non è soltanto una proposta.

## Regole di visualizzazione

- Prima i risultati: ricavi, acquisizione, installazioni, abbonamenti; poi anomalie e approfondimenti. Nessun KPI di servizio deve occupare più spazio dei risultati.
- Home: fino a quattro totali principali, raggruppamento per tipo di progetto, massimo tre metriche per card; dati disponibili prima delle metriche senza misure. Riepilogo opportunità e fonti da verificare in una riga compatta.
- Panoramica e sezioni metriche: fino a quattro KPI cliccabili, un grafico attivo, altre metriche espandibili. Selezionando una metrica secondaria, questa prende il posto dell'ultimo KPI visibile. Non duplicare un grafico grande per ogni KPI.
- Tabelle: ricerca, CSV e conteggio sulla stessa riga; colonne principali, testo lungo limitato a due righe, dettaglio laterale e CSV della pagina con tutti i campi rappresentati. Paginazione visibile solo quando serve.
- Dettagli storici e tecnici espandibili; filtri URL continuano a riaprire la sezione interessata. Evitare pannelli vuoti di fonti non pertinenti.
- Conservare solo note necessarie: date, copertura, valute, stima vs dato osservato, granularità, confrontabilità. Mai inventare zero o dedurre utenti unici da somma giornaliera.
- Tool/Studio: azioni accessibili, comandi tecnici separati dalle statistiche. Nessuna nuova chiamata automatica ai provider.

## Copertura verificata nel codice

| Dato | Dove compare | Gerarchia |
|---|---|---|
| GSC click, impression, CTR, posizione | Home, panoramica, acquisizione | KPI e grafico; query/pagine per click, scatter; segmenti espandibili |
| GA4 utenti/giorno, sessioni, visualizzazioni, eventi chiave | Acquisizione | KPI selezionabili; landing aggregate e righe giornaliere con tasso, device, host, fuso, qualità |
| Umami visitatori/giorno, pagine viste | Acquisizione, home/panoramica | KPI; esclude zeri storici pre-2026-08-08 documentati |
| Bing, Cloudflare AI, Clarity | Acquisizione | Dettaglio per fonte, periodo, metrica e copertura; non aggregare finestre sovrapposte |
| Download iOS | Home, store/acquisizione | KPI, esclude righe storiche pre-2025-09-21 note come inaffidabili |
| Android utenti, dispositivi, eventi installazione/disinstallazione e dispositivi attivi | Store/acquisizione | Serie separate; utenti preferiti ai dispositivi, nessuna somma dei tre tipi |
| Rating Play, totale recensioni | Store, panoramica | Ripristinati KPI da snapshot; distribuzione importata separata, testo recensioni in dettaglio |
| ASO keyword, paese, rank, popolarità, difficoltà, score, competitor e classificazione | Store | Ultima rilevazione per keyword/paese, storico ranking selezionabile, storico ricerca pertinente al progetto |
| Metadati ASC, esperimenti e varianti | Store | Espandibili; descrizioni, novità, testo promozionale e stato in dettaglio |
| AdMob, AdSense, MRR, abbonati, trial, nuovi clienti e ricavi rolling | Ricavi, home/panoramica | KPI; ricavi ieri/mese corrente fino a ieri/mese precedente separati; mediazione per valuta e fonte |
| Indicizzazione, sitemap | Salute, centro dati | Conteggi e problemi critici prima; tutte le ispezioni e sitemap espandibili; proprietà globali comprese quelle non associate |
| Web performance | Salute | Selettore fonte/URL/device; KPI disponibili, un grafico; LCP/INP/CLS/FCP/TBT/score |
| Crash/ANR Android | Salute | KPI e grafico, precisione API; dettagli storici |
| Opportunità | Home e progetto | Aperte per severità e score, titolo e priorità prima dell'evidenza |
| Interventi | Interventi e grafici | Prima/dopo, registro e copertura espandibile; confronto massimo 90 giorni |
| Sync, audit performance, registro | Integrazioni e centro dati | Anomalie prima; tracker e registro; audit performance non usa il bottone di sync standard |
| Studio | Header progetto e strumenti | Link solo se config locale presente; istruzioni di collegamento separate |

## Limiti e decisioni

La copertura riguarda metriche strutturate utili alla dashboard, non dump integrali delle risposte raw, credenziali o cache globali non pertinenti. Retention iOS resta non disponibile fino a validazione del parser; valori storici non validati non vengono promossi. Nessun valore simulato. Totali di portafoglio su un endpoint comune recente per metrica, escludendo esplicitamente progetti incompleti/valute incompatibili: una fonte vecchia non sposta all'indietro tutti gli altri progetti. Ricavi ieri/mese sono calendari UTC, separati dalle finestre mobili; nessuna stima di giorni non ancora importati.

Questa revisione non include build, typecheck, test runtime, accessibilità misurata o screenshot: richiesto controllo di contenuti e gerarchia in questa fase. La verifica visiva su dati locali resta necessaria. Non è una certificazione della completezza di ogni singolo campo raw del provider.
