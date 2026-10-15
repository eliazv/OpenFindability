# OpenSEO e Ahrefs accanto a OpenFindability

Valutazione del 15 ottobre 2026, basata sulla documentazione ufficiale consultata. Non richiede installare né collegare altri servizi.

## Decisione

OpenFindability con MotherDuck copre il monitoraggio proprietario: rendimento dei siti e delle app, ricavi, download, opportunità dai dati GSC e interrogazioni SQL. Il livello semantico rende questi dati più accessibili agli agenti. Il valore aggiuntivo degli altri strumenti è soprattutto la ricerca esterna: competitor, SERP, backlink e crawl tecnico approfondito.

| Esigenza | Strumento utile | Scelta per questo progetto |
|---|---|---|
| Monitorare clic, traffico, download e ricavi dei prodotti | OpenFindability + MotherDuck | Sistema centrale già presente |
| Verificare backlink e problemi tecnici dei domini posseduti | Ahrefs Free | Complemento manuale utile |
| Cercare nuove keyword, competitor, SERP e backlink via API | OpenSEO + DataForSEO | Valutare solo su una domanda concreta con budget |
| Interrogare i propri dati da GPT | MotherDuck e guida semantica | Non serve un altro dashboard per questo obiettivo |

## Ahrefs

Ahrefs Free include audit tecnico e Site Explorer per siti verificati. La pagina ufficiale indica 5.000 crawl credits per progetto al mese e fino a 1.000 backlink/keyword visibili contemporaneamente. È utile per individuare link esterni, link rotti e problemi di crawl che GSC e le metriche di traffico non descrivono in modo esaustivo.

Per portfolio e piccole landing può bastare il piano gratuito. Per VitaRomagna il sito dinamico richiede scegliere URL/template rappresentativi ed evitare consumare il budget su combinazioni di date e pagine equivalenti; la quota non garantisce un crawl completo di un sito grande. Non aggiungerei un secondo sistema web analytics: GA4/Umami sono già collegati.

La disponibilità nel prodotto gratuito non equivale a un'API completa gratuita: la documentazione API v3 indica piani a pagamento idonei, con un insieme limitato di query di prova per gli altri piani. Prima userei il portale e gli export eventualmente disponibili; un connettore dedicato richiederebbe una necessità ripetuta e accesso API verificato.

Fonti: [Ahrefs Free](https://ahrefs.com/webmaster-tools), [API v3 ed eligibility](https://docs.ahrefs.com/en/api/docs/introduction).

## OpenSEO

Il repository si presenta come strumento SEO open source con keyword research, rank tracking, competitor, backlink, audit e AI visibility. Espone MCP e workflow per agenti. I dati SEO richiedono comunque credenziali DataForSEO; il codice aperto non rende gratuito il dataset esterno.

La documentazione indica test iniziale con credito di 1 USD e ricarica minima di 50 USD per DataForSEO. Il percorso Docker richiede un container aggiuntivo; l'AI visibility usa DataForSEO per le domande monitorate, mentre OpenRouter serve per ricerca e suggerimenti. Le risposte campionate a prompt non sono un ranking universale degli assistenti AI.

Per l'obiettivo attuale introdurrebbe un secondo prodotto, altro storage e manutenzione, con sovrapposizione su dashboard/MCP. Il vantaggio diventerebbe concreto per una ricerca delimitata, per esempio confrontare poche keyword locali e competitor di VitaRomagna o keyword commerciali di Scadenzario. Definirei prima query, territorio, numero di controlli e budget; poi valuterei se usare OpenSEO separatamente o importare risultati selezionati in OpenFindability. Nessuna integrazione viene installata sulla sola base del nome delle funzionalità.

Fonti: [repository OpenSEO](https://github.com/every-app/open-seo), [credenziali e costi DataForSEO](https://github.com/every-app/open-seo/blob/main/docs/DATAFORSEO_API_KEY.md), [self-hosting Docker](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_DOCKER.md).

## Prossimo uso consigliato

Prima sfruttare le viste e i dati proprietari per una lista di interventi. Affiancare un audit Ahrefs Free sui domini posseduti per backlink e salute tecnica. Passare a OpenSEO/DataForSEO quando una domanda su competitor/SERP non trova risposta nei dati già raccolti e giustifica il costo e la gestione di un altro servizio.
