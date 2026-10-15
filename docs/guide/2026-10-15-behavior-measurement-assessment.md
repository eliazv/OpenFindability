# Dal traffico ai risultati: valutazione del report sul comportamento

Il report evidenzia una distinzione corretta: raccogliere statistiche di acquisizione non basta per capire attivazione, paywall e valore commerciale. Tuttavia le proposte hanno requisiti diversi. Questo documento distingue ciò che è implementato, ciò che si può estendere dai dati già disponibili e ciò che richiede modificare i prodotti o collegare altri account. Non attiva nuovi servizi né modifica app esterne.

## Stato e priorità

| Area | Valutazione | Stato / prossimo passo |
|---|---|---|
| GA4 web | Landing, canale e dispositivo sono utili per attribuire risultati alle pagine | Implementati in `ga4_landing_metrics`, report e viste MotherDuck |
| GA4 app / paywall | Un funnel per versione, piattaforma e motivo del paywall richiede eventi e dimensioni disponibili | Da progettare per la singola app; non coincide con il nuovo report web |
| RevenueCat | Overview e coorti di abbonamento sono prodotti analitici diversi | Snapshot esistenti; verificare export/API effettivamente accessibili per trial→paid, prezzo e churn |
| Umami | I totali giornalieri non descrivono CTA e template | Estendere solo dopo aver verificato eventi realmente raccolti e versione API |
| App Store | Download non permettono di dedurre retention o conversione della scheda | Retention rimane mancante finché non esiste un report di coorte con parser validato |
| Play | Dispositivi, utenti ed eventi non sono la stessa metrica | Implementata la separazione e il recupero dai CSV originali; acquisizione della scheda è un report ulteriore |
| Funnel commerciale | Lead, demo, pilot e clienti devono avere definizioni condivise | Prima scegliere la fonte attendibile e le regole; poi importare aggregati |
| Windows | Acquisizione Store e utilizzo del prodotto vanno separati | Necessari Store ID, tipo di pubblicazione e accesso Partner Center; data di pubblicazione del report non verificata |
| ASO | Lo storico cresce con le rilevazioni, con disponibilità diversa per paese | Sync manuale già presente; ampliare i paesi solo in funzione dei mercati serviti |

## Correzione concreta Play

Il connettore leggeva `Daily Device Installs` e `Daily Device Uninstalls`. Un valore dispositivo pari a zero può coesistere con attività nelle colonne utenti o eventi. Non bisogna sostituirlo con una serie diversa o dedurre assenza di abbandono.

Lo schema ora conserva anche `user_installs`, `user_uninstalls`, `install_events` e `uninstall_events`. `play_install_quality` evidenzia i giorni con device uninstalls zero e attività nelle altre colonne. Le serie sono separate anche nei KPI. Gli eventi provengono dai campi omonimi quando presenti nell'export; un campo assente resta sconosciuto.

```powershell
pnpm run db:backup
pnpm run repair:play-metrics
pnpm exec tsx scripts/repair-play-metrics.ts --apply
pnpm exec tsx scripts/sync-warehouse.ts --apply
```

Il recupero usa i payload locali già conservati: nessun nuovo accesso ai progetti disattivati, nessuna riscrittura dei conteggi dispositivo. Riempie solo nuove colonne mancanti con interi validi, preservando i valori già presenti e il JSON originale. È ripetibile e non ricostruisce coorti di retention.

Riferimento: [formati e colonne dei report Play](https://support.google.com/googleplay/android-developer/answer/6135870?hl=en).

## Primo sviluppo successivo: un funnel vero per una sola app

Definirei un contratto di misura insieme al prodotto, per esempio:

1. Prima apertura o ingresso nella coorte.
2. Completamento dell'onboarding.
3. Primo risultato utile: la definizione dipende dall'app.
4. Visualizzazione del paywall, con posizione e motivo.
5. Avvio del trial confermato.
6. Acquisto confermato da una fonte attendibile.

Questi sono eventi proposti, non eventi già verificati o installati. Le dimensioni candidate sono versione, piattaforma, paese, offerta e motivo del paywall. Prima vanno censiti gli eventi esistenti, le dimensioni personalizzate e la copertura storica. Un clic su “acquista” non è un acquisto e non deve alimentare il numero dei clienti paganti.

Un funnel richiede ordine degli step, finestra di completamento, identità/coorte coerente e deduplicazione nella fonte di calcolo. Il rapporto tra due conteggi giornalieri di eventi non basta. Le coorti devono avere uguale maturità: un trial recente non può essere confrontato con uno già arrivato a scadenza come se avesse avuto lo stesso tempo per convertire.

GA4 espone report funnel tramite `runFunnelReport`, attualmente in v1alpha: ne verificherei compatibilità e stabilità prima di dipenderne. Non è obbligatorio introdurre BigQuery per ogni funnel. BigQuery diventa una possibilità per elaborazioni che richiedono eventi e associazioni non ottenibili dagli aggregati disponibili, con configurazione e costi da valutare separatamente.

Riferimento: [funnel GA4 e stato dell'API](https://developers.google.com/analytics/devguides/reporting/data/v1/funnels).

## RevenueCat e Umami

Il connettore RevenueCat attuale chiama l'Overview. Gli snapshot giornalieri registrano lo stato osservato; non ricostruiscono lo storico mai raccolto. I ricavi mobili a 28 giorni non diventano ricavi giornalieri per differenza tra snapshot. Coorti di prezzo, trial→paid e churn richiedono altri report e le loro definizioni: verificare disponibilità nell'account, autorizzazioni e modalità di export prima di promettere un connettore gratuito.

Per Umami verificherei prima gli eventi già inviati dai siti. Se esistono CTA con nomi e proprietà stabili, importerei conteggi aggregati per landing/template/CTA e periodo. Se non esistono, occorre strumentare il sito: la sola chiave API non crea lo storico. Non presenterei eventi CTA divisi per pageview come tasso di conversione di utenti unici.

Riferimenti: [definizioni e coorti RevenueCat](https://www.revenuecat.com/docs/dashboard-and-metrics/charts), [eventi Umami](https://docs.umami.is/docs/track-events), [statistiche eventi Umami](https://docs.umami.is/docs/api-reference/get-website-event-stats).

## Windows, store e business

Un connettore Microsoft Store richiede autenticazione Microsoft Entra/Partner Center e identificativo Store dell'app. Le chiavi Bing e Clarity esistenti non forniscono questo accesso. Prima di implementarlo occorre identificare app e tipo di pacchetto, perché disponibilità dei report e copertura dell'utilizzo possono differire. Le acquisizioni Store non rappresentano tutte le installazioni o gli utilizzi Windows distribuiti fuori dallo Store.

Per il business partirei da aggregati di lead, demo, pilot e paganti provenienti dal sistema realmente usato. Definirei se si contano eventi, persone o aziende, come si evitano doppioni e come si tratta chi passa di stato in un periodo successivo. Nessun lead deve essere creato dai clic per inferenza.

Riferimenti: [autenticazione Store analytics](https://learn.microsoft.com/en-us/windows/uwp/monetize/access-analytics-data-using-windows-store-services), [acquisizioni Store](https://learn.microsoft.com/en-us/windows/uwp/monetize/get-app-acquisitions).

## Dati da conservare in MotherDuck

Esporterei aggregati di coorte già validati con fonte, definizione/versione, dimensioni approvate, periodo di ingresso, finestra di osservazione, numeratore, denominatore, unità, qualità e data di acquisizione. Mancanza di copertura, valori soppressi e coorti immature restano distinguibili dagli zeri.

Identificativi personali, sessioni individuali, email, testo libero, ricevute e motivazioni libere degli utenti non sono necessari al warehouse analitico. Le eventuali elaborazioni individuali rimangono nella fonte appropriata; BigQuery non viene collegato o abilitato da questa modifica.

Priorità consigliata: completare le API prestazioni, usare le nuove metriche Play, poi censire e implementare il funnel di attivazione/paywall di una sola app. Successivamente ampliare RevenueCat/Umami e collegare Windows quando l'accesso è disponibile. Le proposte non implicano introdurre cron o server aggiuntivi: OpenFindability rimane a sincronizzazione manuale.
