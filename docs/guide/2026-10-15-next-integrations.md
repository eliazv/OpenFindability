# Prossime integrazioni consigliate

Valutazione del 15 ottobre 2026. Le prime tre estensioni sono state implementate: conversioni GA4 per landing/canale, CrUX/PageSpeed e registro degli interventi. Configurazione e comandi sono nella [guida operativa](conversions-performance-interventions.md); l'attivazione delle API prestazioni dipende da chiavi e quote. Le sezioni seguenti conservano le motivazioni e indicano le ulteriori proposte, senza attivare nuovi servizi a pagamento.

## Scelta consigliata

Terrei SQLite per il funzionamento locale e MotherDuck come archivio analitico interrogabile da GPT. La prossima fase dovrebbe collegare le opportunità alle azioni e ai risultati: quali pagine portano visite utili, quali hanno problemi tecnici, quali migliorano dopo un intervento.

Il livello attuale include già viste KPI, copertura delle fonti, freschezza, controlli di integrità e guida per l'AI. Bing, Cloudflare e Clarity sono già integrati: non serve introdurre un secondo strumento per raccogliere le stesse metriche. Per interpretare i dati partire dalla [guida AI](warehouse-ai-guide.md).

## Ordine di lavoro

| Priorità | Integrazione o estensione | Decisione che rende possibile | Cosa serve |
|---|---|---|---|
| 1 | GA4 per landing page, canale ed eventi chiave | Quali pagine producono risultati oltre ai clic Google? | Credenziali GA4 esistenti, verifica eventi e compatibilità dimensioni/metriche |
| 2 | CrUX e PageSpeed Insights su pagine selezionate | Quali template hanno problemi reali di esperienza o prestazioni? | API abilitate e chiave Google Cloud configurata per ciascuna API |
| 3 | Registro degli interventi e confronto prima/dopo | Un cambio di titolo, contenuto o template ha aiutato? | Nessuna nuova chiave; date e descrizioni degli interventi |
| 4 | Controlli HTTP, canonical, robots e dati strutturati | Gli URL importanti sono tecnicamente coerenti? | Nessuna nuova chiave per pagine pubbliche; campione e limiti di crawl |
| 5 | Ahrefs Free, inizialmente uso manuale | Mancano backlink o ci sono problemi tecnici aggiuntivi? | Account e verifica dei domini; eventuali export disponibili |
| 6 | Ricerca SERP/competitor con DataForSEO o OpenSEO | Quali opportunità esterne non vediamo in GSC? | Credenziali e budget, solo dopo aver definito una ricerca |

## 1. Conversioni per pagina e acquisizione

Oggi sono conservati anche `sessions` e `keyEvents` GA4, ma il riepilogo per progetto non spiega quali landing portano risultati. Aggiungerei report separati per landing page e acquisizione, verificando prima le combinazioni supportate dalla Data API. Una sessione può generare più eventi chiave: `keyEvents / sessions` non va presentato automaticamente come tasso di conversione delle sessioni.

Prima di sviluppare, definire per ciascun sito cosa conta: candidatura, contatto, apertura di un servizio o altro evento già misurato. Se manca la strumentazione, occorre intervenire anche sul sito interessato; questo documento non modifica VitaRomagna o altri repository.

Conserverei dati aggregati, senza identificativi personali. Per confrontare GSC e GA4 userei aggregazioni preventive per pagina e periodo, normalizzazione degli URL documentata e cautele su fusi orari e attribuzione. Una relazione tra clic e sessioni non è un'identità contabile. GA4 e Umami rimangono fonti separate.

I referral riconoscibili degli assistenti AI possono essere un segmento di acquisizione, con regole esplicite e aggiornabili. Non misurano tutte le visite AI e non dimostrano quante volte il sito sia stato citato.

Riferimento: [dimensioni e metriche della GA4 Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema).

## 2. Prestazioni: CrUX e PageSpeed Insights

CrUX espone esperienza reale aggregata per URL o origine; PageSpeed Insights permette analisi delle pagine e risultati Lighthouse. Terrei distinti i dati sul campo e le misurazioni di laboratorio. Inizierei da home, landing con più impressioni e pochi esempi per template, con aggiornamento manuale.

Per ogni osservazione salverei URL, dispositivo, fonte, data di acquisizione, periodo di raccolta quando disponibile, unità e payload originale locale. In MotherDuck esporterei le sole colonne analitiche approvate. I percentili e le finestre mobili CrUX non sono metriche giornaliere sommabili; l'assenza di dati deve restare esplicita. Un risultato di origine non deve essere attribuito a una singola pagina.

Il risultato utile è una lista di pagine e template su cui intervenire, collegata a traffico e opportunità GSC. Eviterei un punteggio unico che mescoli prestazioni, ricavi e visibilità.

Riferimenti: [CrUX API e requisiti della chiave](https://developer.chrome.com/docs/crux/api/), [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started).

## 3. Registro degli interventi

Questa estensione può avere più valore di un nuovo provider. Registrerei progetto, URL o template, data, tipo di modifica, obiettivo e riferimento al commit o report. Una vista mostrerebbe finestre confrontabili prima/dopo, indicando giorni disponibili, ritardi delle fonti e altri interventi concomitanti.

Il confronto descrive l'andamento; non prova da solo un effetto causale. Per contenuti stagionali o eventi, confrontare anche periodi omologhi quando esiste lo storico.

## 4. Controlli tecnici mirati

Estenderei l'audit esistente con stato HTTP, redirect, canonical dichiarato, meta robots, presenza in sitemap e verifiche dei campi essenziali dei dati strutturati. Distinguerei sempre ciò che il nostro fetch osserva da ciò che Google dichiara tramite URL Inspection.

Per VitaRomagna il campione dovrebbe comprendere contenuti correnti, scaduti e pagine di archivio. Le regole sui contenuti scaduti vanno concordate con la logica del sito, senza eliminazioni automatiche. Prima conviene correggere gli errori individuati; un crawler completo richiede una necessità concreta.

## 5. Backlink, competitor e visibilità AI

Userei inizialmente Ahrefs Free per un controllo manuale dei domini verificati. Un import da file avrebbe senso soltanto dopo aver verificato un export reale: formato, diritti di utilizzo, data, progetto, provenienza e chiave di deduplicazione. L'accesso al portale non garantisce accesso API.

OpenSEO/DataForSEO diventa utile per una domanda delimitata su keyword, SERP o competitor, con territorio, frequenza e tetto di spesa definiti. Non lo installerei adesso come secondo hub. La [valutazione dedicata di OpenSEO e Ahrefs](2026-10-15-openseo-ahrefs-assessment.md) riporta fonti e condizioni consultate.

Per le citazioni AI aggiungerei una fonte solo dopo aver verificato API o export effettivamente accessibili all'account. Le richieste dei crawler Cloudflare, i referral e le risposte campionate a prompt sono tre misure diverse: nessuna va rinominata “citazioni ufficiali”.

## Miglioramenti interni prima di aumentare le fonti

- **Anagrafica esplicita:** stato del progetto, piattaforma pubblicata e tracking abilitato per fonte, con motivo. Preservare storico e disattivazioni richieste; non dedurre la pubblicazione dalla presenza di una chiave.
- **Un solo comando manuale di aggiornamento:** raccolta, controlli, riepilogo degli errori ed export MotherDuck con `--apply`. Conservare esiti e date per fonte, anche quando una fallisce. Nessun cron o processo aggiuntivo.
- **Retention App Store verificata:** implementare solo dopo aver esaminato un vero report di coorte, unità e denominatori. I conteggi di sessioni non permettono di ricostruire D1/D7/D28; i valori mancanti restano `NULL`.
- **Gestione dei dettagli Cloudflare:** misurare prima la crescita; se necessario, proporre aggregati storici e retention configurabile dei dettagli. Ogni cancellazione richiede anteprima e backup; nessuna pulizia automatica è prevista ora.

## Primo incremento concreto

Partirei da un sito con eventi chiave già validati: report GA4 per landing e canale, piccolo campione CrUX/PageSpeed e registro degli interventi. L'accettazione dovrebbe essere pratica: poter chiedere a GPT quali pagine meritano un intervento, quali risultati generano e cosa è cambiato dopo una modifica, con fonte, periodo e limiti visibili.

Non servono nuove credenziali per iniziare l'analisi GA4, salvo permessi mancanti. Per CrUX/PageSpeed andrebbero predisposte e verificate le API Google Cloud. Ahrefs e DataForSEO possono aspettare una domanda che i dati proprietari non risolvono.
