# OpenFindability — analisi dell’interfaccia e proposta di ristrutturazione

Data: 24 novembre 2026

Stato: analisi del codice e proposta operativa. In questa modifica è implementato solo l’avvio congiunto dashboard + Store Studio e aggiornata la relativa istruzione nella pagina progetto. Il redesign descritto sotto non è ancora implementato.

## 1. Valutazione

OpenFindability ha più capacità di quelle che l’interfaccia lascia vedere. Il backend gestisce acquisizione, monetizzazione, store, qualità dell’app, performance web e operazioni di pubblicazione; la UI resta principalmente una home e una lunga pagina per progetto. Conviene riprogettare la gerarchia e rendere accessibili queste capacità, mantenendo Next.js, SQLite e i componenti shadcn esistenti.

La direzione proposta è una **dashboard dei progetti con strumenti contestuali**: apri, capisci cosa è cambiato, scegli un progetto, approfondisci un dato oppure usi uno strumento. Il nome del fornitore resta disponibile come provenienza del dato, senza essere l’unico criterio di navigazione.

Tre priorità:

1. Rendere riconoscibili progetti, contesto corrente e strumenti
2. Mostrare pochi numeri affidabili, con periodo e stato del dato leggibili
3. Separare panoramica, approfondimenti e operazioni, evitando una pagina infinita

## 2. Metodo e limiti

Analisi statica di pagine, sidebar, componenti, modelli, letture SQLite, aggregazioni, connettori, report e comandi. Non sono stati avviati dashboard/browser né effettuate verifiche visive; non sono stati letti dati privati, recensioni reali, query di ricerca o metriche dei progetti. Nessuna sync o chiamata ai fornitori.

“Disponibile” nella matrice seguente significa che il codice sa gestire il dato, non che il database locale sia popolato o che l’integrazione sia configurata. Quando un campo esiste nello schema ma il parser non lo produce ancora, è indicato esplicitamente.

Fonti principali:

- [Layout](../../app/layout.tsx), [home](../../app/page.tsx), [pagina progetto](../../app/project/[slug]/page.tsx)
- [Sidebar applicativa](../../components/app-sidebar.tsx), [primitive sidebar](../../components/ui/sidebar.tsx), [sync button](../../components/sync-button.tsx)
- [Modelli](../../lib/types.ts), [schema](../../lib/db/schema.ts), [letture dati](../../lib/store.ts)
- [Aggregazioni](../../lib/insights.ts), [report](../../lib/report.ts), [sync](../../lib/sync.ts), [catalogo connettori](../../lib/connectors/catalog.ts)
- [Growth evidence](../../lib/analytics/growth-evidence.ts), [SEO/GEO](../../lib/analytics/seo-geo.ts), [Doctor](../../lib/doctor.ts)

## 3. Problemi osservabili nel codice

| Area | Evidenza | Effetto per chi usa la dashboard |
|---|---|---|
| Home | Titolo molto grande e testo “Versione base self-hosted”, “dati demo”, GSC/Umami | Occupa spazio e descrive una fase precedente, senza spiegare lo stato corrente dei progetti |
| Header globale | Ripete “OpenFindability v0.1”, già presente nella home | Non comunica progetto, percorso o periodo |
| Sidebar | `collapsible="icon"`; un’icona per tipo web/app/web_app | Da compressa i progetti dello stesso tipo diventano indistinguibili |
| Stato sidebar | Il provider scrive `sidebar_state`, il layout non legge il cookie per `defaultOpen` | Persistenza incompleta; non assumere che il cookie spieghi la compressione segnalata |
| Controlli sidebar | Trigger, rail e Ctrl/Cmd+B possono cambiare stato; Sync è un bottone esterno a `SidebarMenuButton` | Comportamento e contenuto non uniformi quando la sidebar è compressa |
| Progetto attivo | Controllo `pathname === href` | Le future sottopagine non manterrebbero attivo il progetto padre |
| Navigazione | Due pagine principali, nessun hub strumenti | Molte capacità sono raggiungibili solo conoscendo i comandi |
| Doctor | Link diretto a `/api/doctor` | Si arriva a JSON, anziché a uno stato operativo leggibile |
| Pagina progetto | Sequenza di card condizionali per fonte | Scroll lungo e posizione delle sezioni variabile; l’assenza di una card non spiega perché manca il dato |
| Tabelle | Shortlist da 10/20 righe, nessun percorso di approfondimento, ricerca o paginazione | Il resto non è esplorabile dalla UI; non è necessariamente assente dal database |
| URL e query | Celle troncate senza un dettaglio dedicato | Difficile leggere il valore completo e capire su cosa agire |
| Opportunità | Descrizioni lunghe; le pagine fanno `slice(0, 8)` senza filtro esplicito `open` e ordinamento locale | Stato e priorità visualizzata dipendono dall’array restituito; l’etichetta “della settimana” non applica una finestra settimanale |
| Registro | Solo sei righe recenti; fonte, stato e data | Poco contesto sul progetto nella home, nessun dettaglio del messaggio o tentativo successivo |
| Operazioni | Sync invia `{}` a `/api/sync`; il route handler supporta la fonte, non il progetto | Il pulsante non offre un aggiornamento mirato al progetto corrente |

La compressione inattesa della sidebar va riprodotta con l’utente: dal codice non risulta un default desktop compresso (`defaultOpen` è `true`). Non attribuirla senza prova a un breakpoint o a un bug CSS. I progetti diventano comunque poco riconoscibili nello stato compresso previsto dal componente.

## 4. Copertura dei dati nell’interfaccia

La catena connettore → persistenza → aggregazione/report esiste per molte fonti. La catena fino a una vista navigabile è incompleta. Non tutti i dati hanno bisogno di una card in home: devono però avere una destinazione chiara.

| Dominio / struttura | Cosa espone oggi la UI | Cosa resta fuori o parziale | Destinazione proposta |
|---|---|---|---|
| Progetti e mapping | Nome, tipo, link sito, alcune istruzioni Studio | Configurazioni e stato delle singole integrazioni non esplorabili | Impostazioni progetto → Integrazioni |
| GSC `metricSnapshots` | Click/impression e trend click | CTR/posizione e confronto periodo non sintetizzati come KPI | Acquisizione → Ricerca |
| `searchQueries`, `pageMetrics` | Top 10 query e pagine, aggregazione con CTR ricalcolato e posizione ponderata | Esplorazione completa, filtri, variazioni e relazione query/pagina | Tabelle Ricerca con dettaglio |
| `gscDimensionBreakdowns` | Nessuna vista dedicata | Breakdown per dimensione | Ricerca → Segmenti |
| `gscSitemaps`, `gscIndexInspections` | Sintesi indicizzazione e shortlist problemi | Sitemap e cronologia delle ispezioni non esplorabili | Salute → Indicizzazione |
| GA4 `metricSnapshots` | Somma utenti attivi giornalieri, pageview, trend | Sessioni e key events importati non valorizzati in pagina | Acquisizione → Traffico e conversioni |
| `ga4LandingMetrics` | Nessuna vista dedicata | Landing, canale, dispositivo, sessioni, engagement, key events e qualità | Traffico → Landing |
| Umami | Visitatori/pageview e trend | Esplorazione e confronto assenti | Acquisizione → Traffico |
| Bing `seoGeoObservations` | Nessuna vista dedicata | Osservazioni di ricerca e copertura disponibili nei report | Acquisizione → Ricerca → Bing |
| Cloudflare AI `seoGeoObservations` | Nessuna vista dedicata | Traffico/crawler con finestre e copertura proprie | Acquisizione → Crawler AI |
| Clarity `seoGeoObservations` | Nessuna vista dedicata | Evidenze di comportamento importate | Salute → Esperienza web |
| PageSpeed / CrUX `webPerformanceMetrics` | Nessuna vista dedicata | Metriche lab/field, scope URL/origine e dispositivo | Salute → Performance web |
| `playInstallStats` | Nessuna vista dedicata | Installazioni/disinstallazioni, utenti/eventi/dispositivi | Store → Google Play → Acquisizione |
| `ascAnalyticsMetrics` | Nessuna vista dedicata | Download App Store | Store → App Store → Acquisizione |
| Retention App Store | Non mostrata | I campi sono nello schema, ma il connettore dichiara che manca il parser di coorti validato | Mostrare “Non disponibile”, senza promettere grafici già alimentabili |
| `playVitalsMetrics` | Nessuna vista dedicata | Crash e ANR | Salute → Qualità Android |
| `appReviews` e rating Play | Rating, totale recensioni, ultime cinque recensioni | Filtri e andamento; nessuna inbox completa | Store → Recensioni |
| `appKeywords` | Top 10 dell’ultima data, paese e punteggi | Esplorazione storico e ricerca keyword | Store → Keyword |
| `asoKeywordSnapshots`, `asoAppRankSnapshots` | Nessuna vista dedicata | Storico punteggi e posizioni | Keyword → Andamento |
| `ascMetadataSnapshots` | Nessuna vista dedicata | Copie delle schede recuperate/inviate | Store → Schede e testi |
| `ascExperiments`, `ascExperimentTreatments` | Nessuna vista dedicata | Esperimenti PPO e varianti | Store → Esperimenti |
| AdMob `metricSnapshots` / `admobMediationMetrics` | Totale e trend ricavi; la mediazione contribuisce al totale nel helper | Breakdown fonte/formato, eCPM, match rate, richieste | Ricavi → Pubblicità |
| AdSense `metricSnapshots` | Nessuna card dedicata | Ricavi web e metriche ads importate | Ricavi → Pubblicità web |
| RevenueCat `metricSnapshots` | MRR, abbonati, ricavi rolling 28 giorni | Trial/clienti nuovi, quando presenti; provenienza temporale dell’ultimo snapshot poco esplicita | Ricavi → Abbonamenti |
| `opportunities` | Shortlist testuale | Lista completa, stato, filtri e contesto | Opportunità |
| `projectInterventions` e growth evidence | Nessuna vista dedicata | Registro interventi e confronto degli esiti già presente nei moduli/report | Interventi |
| `connectorRuns` / Doctor | Sei esecuzioni, Doctor JSON | Copertura, errori, dettaglio, aggiornamento e configurazione | Centro dati |
| Release Android/iOS | Comandi, guide e registrazioni operative | Nessuna UI operativa dedicata | Strumenti → Release, inizialmente stato e preflight |
| Export report / Google Sheets / warehouse | Comandi e integrazioni | Nessun catalogo navigabile degli strumenti | Strumenti → Report ed export |
| Store Studio | Scheda nella pagina progetto e studio separato | Mancava una posizione globale nella navigazione | Strumenti → Screenshot, con progetto mantenuto |

I campi opzionali e i dati in `rawJson` non costituiscono automaticamente KPI affidabili. Prima di aggiungere un grafico vanno verificati parser, unità, finestra, copertura e fallback; lo schema da solo non basta.

## 5. Prima del redesign: contratto dei numeri

Queste correzioni hanno precedenza sui nuovi grafici.

### Periodi e confronti

- `summarizeProject` usa gli ultimi 28 giorni disponibili per singola fonte. I grafici usano helper con cutoff rispetto a oggi, generalmente 30 giorni. Card e grafico possono quindi coprire finestre diverse, soprattutto con dati vecchi. Usare una finestra condivisa e dichiarare gli scostamenti.
- I totali in home possono sommare finestre con date finali diverse per progetto. Mostrare copertura e progetti esclusi quando si richiede un confronto comune.
- La percentuale AdMob in home confronta il mese corrente parziale con tutto il mese precedente. Preferire stesso numero di giorni oppure mese completo contro mese completo; riportare il tipo di confronto.
- Il badge MRR usa primo/ultimo punto disponibile del trend. Non chiamarlo variazione esatta “30 giorni” se quei due punti non coprono effettivamente 30 giorni.
- “Aggiornato” deve distinguere ultima esecuzione del connettore e ultima data coperta dai dati. Una sync riuscita può restituire dati in ritardo.

### Missing, copertura e unità

- `?? 0` su MRR, rating o altri campi opzionali può trasformare un dato mancante in zero misurato. Usare `—` e uno stato esplicito quando manca il valore.
- Le card condizionali devono distinguere almeno: non configurato, in attesa di primo import, disponibile, parziale, in ritardo, errore. I dati validi precedenti restano leggibili dopo un errore di sync.
- La somma degli utenti attivi giornalieri GA4 non è il numero di utenti unici del periodo. Mantenere questa distinzione nel nome del KPI; usare sessioni come metrica additiva quando opportuno.
- GA4 e Umami restano separati. Non sommare le audience o rappresentarle come un’unica misura.
- RevenueCat: MRR e abbonati sono snapshot; il ricavo rolling 28 giorni non va sommato nel tempo. “MRR” e “ricavi” non sono sinonimi.
- Le aggregazioni monetarie attuali scelgono una valuta da una riga e sommano gli importi: manca una separazione esplicita per valuta nei helper globali. È un rischio verificabile dal codice, non la prova che i dati locali contengano valute miste. Proporre totali per valuta; conversione solo con tasso e data espliciti.
- Conservare la precedenza della mediazione sul network AdMob per progetto/giorno, senza sommare due volte il network.
- Play: distinguere utenti, eventi e dispositivi. App Store: distinguere primi download da altri concetti di acquisizione. Evitare un totale “installazioni” indistinto tra provider.
- CrUX è field e rolling; Lighthouse è lab. Cloudflare/Clarity possono avere finestre non giornaliere. Non forzare tutto in serie giornaliere additive.
- Query e pagine GSC sono estratti del provider: non devono sembrare un inventario completo. Conservare i filtri sui record daily e l’esclusione degli aggregati legacy già presenti in `lib/gsc-detail.ts`.

Proporrei un risultato comune per i KPI: valore opzionale, unità, fonte, inizio/fine periodo, confronto opzionale, copertura e stato. I calcoli restano in `lib/`; i componenti ricevono valori già pronti.

## 6. Struttura di navigazione proposta

```text
Panoramica
Progetti
  [icona reale] Nome progetto
Strumenti
Centro dati

Progetto / Nome
  Panoramica
  Acquisizione
  Store                 [app / web_app]
  Ricavi
  Salute
  Opportunità
  Interventi
  Impostazioni
```

La sidebar globale resta corta. Sezioni del progetto come tab o navigazione locale sotto l’header, senza espandere ogni progetto in otto voci nella sidebar. Se un progetto è solo web, non mostrare funzioni di release app non applicabili. Le sezioni applicabili ma non ancora configurate restano riconoscibili con un invito di configurazione.

Percorsi proposti: `/`, `/projects`, `/project/[slug]/acquisition`, `/project/[slug]/store`, `/project/[slug]/revenue`, `/project/[slug]/health`, `/project/[slug]/opportunities`, `/project/[slug]/interventions`, `/project/[slug]/settings`, `/tools`, `/data`. Il suffisso esatto può seguire le convenzioni del repo; query string per periodo, fonte, ricerca, ordinamento e pagina. Sono destinazioni future, non route già esistenti.

### Sidebar e icone

- Desktop aperta per default, larghezza circa 240–264 px, nomi leggibili; compressione solo su azione intenzionale, toggle evidente e preferenza effettivamente ripristinata
- Mobile in drawer; non usare una fila di icone anonime come navigazione principale
- Icona specifica per progetto, 24 px in elenco e 28 px nello stato compatto; stesso asset in tabella progetti e header progetto
- Risoluzione proposta: asset scelto esplicitamente → icona del `studio.config.json` se presente e valida → cache locale di icona app/favicon → iniziali del nome
- Per i siti, acquisizione del favicon su azione esplicita/refresh, non chiamate a servizi esterni ad ogni render; per app, riutilizzare asset locali o metadati già acquisiti quando effettivamente disponibili
- Cache locale e fallback gestito anche con immagine mancante. Non legare il caricamento delle icone al processo Studio: il resolver deve essere utilizzabile direttamente dalla dashboard
- Nessun campo icona dedicato è oggi presente nel modello `Project`: il riuso dello Studio e un asset locale gestito consentono una prima versione senza migrazione; eventuale override persistente va progettato in seguito
- Stato attivo per tutte le sottoroute del progetto, tooltip con nome completo, accesso da tastiera e `aria-current`
- “Strumenti” sempre visibile. “Centro dati” raccoglie integrazioni, Doctor e cronologia. La sync si sposta qui o nell’header contestuale, evitando il bottone disallineato nello stato compatto

## 7. Home: una vista del portafoglio

Header compatto: **Panoramica**, selettore periodo, azione **Aggiorna** con ambito esplicito. Niente manifesto, versione duplicata o istruzioni ambientali permanenti.

Ordine proposto:

1. Stato dati discreto: fonti in ritardo/errori con link al Centro dati; nessun grande banner quando tutto è disponibile
2. Fino a quattro KPI adatti ai progetti configurati, ognuno con unità e periodo. Evitare un totale misto di audience/ricavi e un contatore “Progetti” come KPI dominante
3. Tabella progetti come elemento centrale: identità, metrica principale pertinente, variazione confrontabile, stato dati, opportunità aperte
4. Poche priorità ordinate e azionabili; link a una lista completa
5. Accesso agli strumenti recenti o frequenti, senza replicare il catalogo intero

I progetti web e app devono essere confrontabili per stato e priorità, non obbligati ad avere lo stesso KPI. Una riga web può privilegiare click/sessioni, una app download/MRR; usare gruppi o colonne chiaramente denominate, non una colonna “Valore” con unità diverse nascoste.

Wireframe indicativo:

```text
Panoramica                        Ultimi 28 giorni ▾   Aggiorna ▾
Dati: stato e copertura                                   Dettagli
[KPI + unità] [KPI + confronto] [KPI + periodo] [KPI utile]

Progetti                          Cerca…   Tutti / Web / App
[icona] Nome     Metrica / periodo     Δ     Stato dati    Apri
...

Da approfondire                             Strumenti
Evidenza breve → dettaglio                  Screenshot · Report
```

## 8. Pagina progetto e presentazione dati

Header: icona, nome, dominio/piattaforme; sotto il nome un’indicazione sintetica dello stato dati. A destra periodo e aggiornamento del progetto. La panoramica mostra 3–4 KPI pertinenti, un grafico principale e poche evidenze; gli approfondimenti vivono nelle sezioni.

Esempi di organizzazione:

- **Acquisizione web:** click ricerca e sessioni in viste distinte, tabella landing con conversioni, filtro Google/Bing quando compatibile; nessun grafico che sommi utenti GA4 e Umami
- **Store app:** App Store e Play riconoscibili; download/utenti/eventi con etichette proprie; keyword, recensioni, schede ed esperimenti separati
- **Ricavi:** abbonamenti, pubblicità app, pubblicità web; filtro fonte e valuta; variazione dello snapshot MRR distinta dagli incassi del periodo
- **Salute:** crash/ANR per Android, performance web lab/field e indicizzazione per i progetti pertinenti
- **Interventi:** cosa è cambiato, quando, su quale pagina/scheda e quali finestre confrontare. Il confronto osservazionale non dimostra causalità

### Tabelle

Tabelle di approfondimento a larghezza piena, con ricerca, filtro periodo/fonte, ordinamento esplicito, conteggio risultati e paginazione. La home conserva shortlist con link “Vedi tutte”. Usare gli strumenti già esistenti e aggiungere componenti shadcn solo quando necessari.

- Numeri allineati a destra e cifre tabulari; unità nell’header o accanto al valore
- Ordine predefinito dichiarato: ad esempio impression per query/pagine, senza chiamarle genericamente “migliori”
- Colonne primarie essenziali; dettagli secondari nel pannello di riga o in una pagina dedicata
- URL leggibile, copia/apertura e dettaglio completo; niente perdita del contenuto dopo il troncamento
- Query/pagina → evidenze e opportunità collegate; opportunità → elemento concreto e stato
- Stato vuoto specifico, stato di caricamento aderente alla struttura, messaggio di errore con azione utile
- Su mobile meno colonne e dettaglio per riga; niente compressione illeggibile di tutte le colonne

### Grafici

Mostrare una domanda per grafico e il confronto quando utile. Fonte, unità e intervallo devono essere visibili senza aprire il tooltip. Evitare aree piene molto sature e linee smussate che suggeriscano precisione non disponibile; preferire linee/barre leggibili, tooltip essenziali e vuoti reali per date senza misura. “Non disponibile” non è una barra a zero. Una tabella equivalente permette di leggere il dato anche senza grafico.

## 9. Strumenti accessibili, con il progetto giusto

`/tools` deve mostrare strumenti esistenti, non promesse di funzionalità nuove. Ogni scheda ha un nome breve, una frase sul risultato, disponibilità e azione principale. Il contesto progetto viene mantenuto quando si arriva dalla sua pagina.

| Gruppo | Strumenti iniziali | Prima integrazione UI consigliata |
|---|---|---|
| Crea | Store Studio | Apertura diretta con progetto e set, stato disponibile/non configurato |
| Analizza | Report, keyword research, audit indicizzazione, performance | Parametri e lettura del risultato; esecuzione manuale e budget degli audit espliciti |
| Misura | Interventi, growth evidence | Registro e confronto già supportati dal codice |
| Distribuisci | Schede Play/App Store, esperimenti, release | Stato e preflight; anteprima concreta prima di ogni `--apply` |
| Esporta | Report, Sheets, warehouse | Anteprima, destinazione, copertura e ultimo esito |

Non trasformare indiscriminatamente ogni comando in un pulsante remoto. Riutilizzare funzioni server esistenti con input tipizzati, validazione e stesso contratto dry-run/`--apply`. Gli upload restano azioni esplicite; visitare una pagina o avviare la dashboard non deve eseguire una sync o una pubblicazione.

## 10. Centro dati

Una pagina operativa deve rispondere a: quale fonte è collegata, fino a quando arrivano i dati, quanto sono completi e cosa posso fare se manca qualcosa.

Matrice progetto × fonte, con ultima data del dato, ultima sync, stato/copertura e azione. Dettaglio con messaggio del connettore e storico ordinato, senza mostrare segreti o riversare `rawJson` nella UI. Doctor diventa una vista leggibile che riusa il report esistente; l’endpoint JSON resta per gli strumenti.

Aggiornamento manuale con ambito **progetto/fonte**, progresso e riepilogo. Il backend `SyncOptions` ha già `projectSlug`; il route handler attuale va esteso e validato per usarlo. Non aggiungere scheduler, code o sync all’avvio. I controlli e la protezione same-origin localhost esistenti vanno mantenuti.

## 11. Linguaggio visivo e testo

Mantenere la palette neutra calda con un accento verde già presente, shadcn e Recharts. Prima uniformare spaziature, gerarchie e densità; cambiare font o librerie non risolve la struttura.

- Titoli pagina circa 24–28 px invece del titolo manifesto da 48 px; testo ordinario 13–14 px e numeri KPI 28–32 px
- Margini coerenti, card solo dove raggruppano davvero una misura o un’azione; ridurre i riquadri annidati
- Testo corrente in frasi brevi; fonte e definizioni in una riga secondaria o aiuto contestuale
- Tradurre stati tecnici nell’interfaccia: “Aggiornato”, “Parziale”, “In attesa”, “Errore”; conservare i codici nei dettagli operativi
- “Progetti”, “Opportunità”, “Dati”, “Strumenti” al posto di titoli promozionali e ripetizioni di versione
- Etichette specifiche invece di rassicurazioni generiche: dire quale dato manca e quale azione lo rende disponibile
- Usare stato, icona e testo insieme; non affidare l’informazione solo al colore. Focus visibile, tooltip accessibili, contrasto e target di clic adeguati

## 12. Architettura consigliata

La UI non deve diventare un secondo motore di aggregazione.

1. Aggiungere lettori di navigazione e riepilogo mirati: oggi `layout` e pagine chiamano `readData()`, che legge tutte le tabelle, inclusi dati grezzi non necessari per la sidebar. È un rischio di costo, non una latenza già misurata. Esiste già `readProjects()` nel modulo store: riusarlo quando basta l’elenco progetti.
2. Passare al client una proiezione minima del progetto, ad esempio id/slug/nome/tipo/icona/stato. Oggi il layout passa oggetti `Project` completi a `AppSidebar`; quel tipo include anche metadati operativi e un campo opzionale di chiave RevenueCat. La navigazione non ne ha bisogno.
3. Creare helper di presentazione condivisi per metrica, periodo, stato, valuta e variazione; evitare copie di `formatCurrency` nelle pagine.
4. Centralizzare capacità e disponibilità dei tool per progetto. Usare il catalogo connettori esistente come base, mantenendo distinta configurazione, dato presente e ultimo esito.
5. Estrarre sezioni dal file progetto prima di aggiungerne altre. Le nuove route leggono solo il proprio dominio; filtri e aggregazioni restano lato server e testabili.
6. Filtrare esplicitamente opportunità aperte e ordinare per score/data; ordinare i run per timestamp, non per posizione accidentale nell’array SQL. Allineare conteggio e lista visibile.
7. Conservare contratti pubblici, formati persistiti, storico e flussi CLI/MCP. Nessuna migrazione di framework o infrastruttura per il redesign.

## 13. Ordine di implementazione

| Fase | Intervento | Criterio di completamento |
|---|---|---|
| 0 — in questa modifica | Dashboard avvia anche Studio; Studio resta indipendente | Dev/start supervisionati, riuso sicuro dello Studio già aperto, test lifecycle |
| 1 — fondazioni dati | Periodo condiviso, missing, valute, ordine/stato opportunità, copertura | Test sintetici su finestre/valute/assenze; nessuna differenza ingiustificata tra KPI e serie |
| 2 — shell | Sidebar, icone progetto, header contestuale, accesso a Strumenti e Centro dati | Progetti riconoscibili anche in modalità compatta; preferenza coerente; navigation DTO minimo |
| 3 — panoramiche | Home compatta e panoramica progetto | I dati e le azioni principali sono trovabili senza scorrere tutte le fonti |
| 4 — approfondimenti prioritari | Acquisizione, download store, ricavi, qualità e tabelle complete | Ogni shortlist apre il dataset filtrato; niente dati simulati o zero inventati |
| 5 — operazioni | Centro dati, strumenti e interventi; schede/release per ultimi | Ambito esplicito, anteprime e controlli di scrittura conservati |

Prima consegna UI suggerita: fase 1 minima + shell + home + percorso Studio. Poi approfondire web/app secondo l’uso effettivo. Evitare di aggiungere venti card alla pagina attuale: aumenterebbe il problema che si vuole risolvere.

## 14. Verifica e accettazione

- Dati sintetici: progetto web/app/misto, fonte non configurata, import vuoto, dato vecchio/parziale, errore dopo un dato valido, valuta diversa, date mancanti e KPI opzionale
- Stesso intervallo tra KPI e grafico; confronti completi, unità corrette, niente somma di snapshot o fonti incompatibili
- Tabella completa raggiungibile da ogni shortlist; filtri e ordinamento preservati nell’URL
- Sidebar: nome e icona, apertura/chiusura intenzionale, stato ripristinato, progetto attivo su sottoroute, tastiera e layout stretto
- Strumenti: contesto progetto mantenuto; Studio autonomo e dashboard+Studio; nessuna sync/pubblicazione implicita
- Query e payload della shell limitati ai campi necessari, senza credenziali né caricamenti integrali per disegnare la navigazione
- Typecheck e test locali mirati; controllo visivo a carico dell’utente, come da istruzioni del repository di lavoro. Nessuna build o chiamata ai provider necessaria per approvare il piano

L’audit dimostra lacune di esposizione e alcuni contratti di presentazione da migliorare. Per certificare configurazione, completezza e correttezza dei dati reali serve una verifica separata autorizzata, per aggregati; non si può dedurle dalla sola presenza dei connettori.
