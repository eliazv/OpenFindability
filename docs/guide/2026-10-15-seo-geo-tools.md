# Monitoraggio SEO, GEO e conversioni: strumenti consigliati

> Ricerca e verifica: 15 ottobre 2026. Documento decisionale per i siti e le landing gestiti con OpenFindability. I limiti e le API possono cambiare: riesaminarli prima dell'implementazione.

## Obiettivo

Affiancare alle metriche di Google Search Console una vista affidabile su Bing, risposte AI, crawler, qualità tecnica e conversioni. Il risultato atteso non è una dashboard piena di numeri, ma rispondere alla domanda: **quale pagina o progetto conviene migliorare questa settimana, con quali evidenze e perché?**

Ambiti da tenere distinti:

1. **SEO organica:** impression, clic, CTR, posizioni, indicizzazione, backlink, query.
2. **Visibilità AI / GEO:** impression nelle funzionalità AI di Google, citazioni documentate su Copilot/Bing, referral degli assistenti, accessi dei crawler AI. Queste grandezze non sono intercambiabili.
3. **Salute tecnica:** crawlability, HTTP, canonical, sitemap, structured data, performance, mobile.
4. **Risultato operativo:** iscrizioni, contatti, download, clic sullo store e altre conversioni.

## Inventario strumenti e scelta

| Strumento | Cosa offre davvero | Costo iniziale | Acquisizione in OpenFindability | Priorità |
|---|---|---|---|---|
| Google Search Console | Ricerca Google, indicizzazione, nuovi report sulle impression AI | Gratis | API SEO già integrata; valutare import dedicato AI | P0: estendere |
| Bing Webmaster Tools | Ricerca/indicizzazione Bing, backlink, AI Performance su Copilot/Bing/partner | Gratis | API REST per SEO tradizionale; AI Performance non risulta con API pubblica documentata | P0: integrare SEO |
| Cloudflare AI Crawl Control | Richieste di crawler AI, stati HTTP, pagine scansionate | Disponibile anche su Free, con limiti | GraphQL Analytics per zone proxate; verificare dataset/piano | P1 |
| Microsoft Clarity | Heatmap, replay, rage/dead click e frizioni UX | Gratis | Data Export API limitata ai 1-3 giorni precedenti; replay/heatmap da consultare sul portale | P1 |
| Google PageSpeed Insights / CrUX | Lighthouse, performance, Core Web Vitals | Gratis, con limiti API | API PageSpeed + CrUX separata per field data | P1 |
| Ahrefs Free | Audit tecnico e backlink/keyword dei domini verificati | Gratis con limiti | Uso nel portale; niente connettore free ipotizzato | P2: manuale |
| Screaming Frog SEO Spider | Crawl approfondito di un sito | Prime 500 URL gratis | Esport CSV manuale o audit locale alternativo | P2 |
| Cloudflare Web Analytics | Pageview/referrer/metriche web e performance | Disponibile gratuitamente | Eventuale fonte alternativa a GA4/Umami, non duplicare traffico | P2 |
| IndexNow | Segnalazione URL aggiunti, modificati, rimossi a motori compatibili | Gratis | **Da integrare nei siti pubblicatori**, non come funzione primaria di OpenFindability | P1 su VitaRomagna |

**Nota:** non tutte le integrazioni devono esistere come API. Alcuni strumenti producono valore maggiore restando tool esterni, con link alle pagine e import di report verificati.

## 1. Google Search Console: già presente, da estendere

In OpenFindability esistono già il connector GSC, le dimensioni query/pagina, il controllo sitemap, l'index audit e le opportunità SEO.

**Novità verificata:** il 3 giugno 2026 Google ha annunciato i report di rendimento dell'AI generativa su Ricerca e Discover; il rollout globale è indicato dal 31 agosto 2026. Sono disponibili informazioni su impression, pagine, paesi, dispositivi e andamento. Il report può non apparire per siti senza volume sufficiente.

- Tenere **separati** il rendimento della Ricerca Web generale e le impression nelle funzionalità AI.
- I clic GSC e le impression AI non sono la stessa metrica; non sommare i due report.
- **Vincolo di implementazione:** la documentazione corrente della Search Analytics API non dimostra un accesso dedicato al nuovo report AI. Iniziare con import di un export ufficiale manuale (se disponibile) e feature flag; abilitare sync automatico solo dopo verifica ufficiale di un endpoint/dimensione realmente supportato.
- Dal settembre 2026 esiste anche il filtro multimodale in Search Console: utile da valutare per immagini ed esperienze di ricerca turistiche, senza presumerne disponibilità via API.

Fonti:
- https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
- https://support.google.com/webmasters/answer/16984139?hl=en
- https://developers.google.com/search/blog/2026/09/web-multimodal-in-sc
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query

## 2. Bing Webmaster Tools: il miglior secondo motore da coprire

Come Search Console, copre impression, clic, query, crawling, indicizzazione e sitemap. La Bing Webmaster **REST API** permette un'integrazione tecnica per dati SEO tradizionali; Microsoft indica il ritiro delle vecchie interfacce SOAP/POX il 31 agosto 2026: partire solo da REST.

**AI Performance** (public preview dal 10 febbraio 2026) mostra citazioni aggregate, URL citati, grounding queries campionate e andamento delle citazioni su Microsoft Copilot, riepiloghi AI di Bing e integrazioni partner selezionate. Non è un report completo della presenza in ChatGPT, Gemini o Perplexity.

- **P0:** importare statistiche SEO Bing in tabelle/provider distinti da GSC; per la prima versione privilegiare indicatori supportati dalla REST API.
- **P1/P2:** per AI Performance usare eventuale export nativo verificato; in alternativa registrazione manuale esplicita di valori e periodo. Non automatizzare scraping di aree riservate.
- Non rinominare citazioni come “visite” o “ranking AI”: una citazione non prova né un clic né una posizione nella risposta.
- Verificare le proprietà in Bing, preferibilmente importandole da GSC dove supportato.

Fonti:
- https://www.bing.com/webmasters/
- https://learn.microsoft.com/en-us/bingwebmaster/
- https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/
- https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c

## 3. Cloudflare: crawler AI e misure web, non citazioni

**AI Crawl Control** può mostrare richieste dei bot e relativi status/path; la documentazione Cloudflare conferma GraphQL Analytics (tra cui il dataset `httpRequestsAdaptiveGroups`) e filtri per user-agent, HTTP status, path e host.

Sul piano Free, il rilevamento dei crawler si basa principalmente su user-agent (falsificabili) e l'intervallo di analytics visualizzato è limitato alle ultime **24 ore**. La rilevazione avanzata con detection ID verificati richiede Bot Management; alcuni filtri sui referrer richiedono un piano a pagamento.

Condizioni e precauzioni:
- Il dominio deve avere richieste effettivamente gestite dal proxy Cloudflare; solo DNS Cloudflare non basta.
- I log rappresentano richieste HTTP; distinguere bot di ricerca, training, user-triggered e utenti reali.
- Conservare copertura temporale e sampling: un valore “0” senza dati accessibili è “non disponibile”, non zero reale.
- Evitare deduzione **crawler = citazione AI**.
- Cloudflare Web Analytics è un'altra fonte per visite/performance: usarla solo se c'è un bisogno specifico non coperto da GA4/Umami.

Fonti:
- https://developers.cloudflare.com/ai-crawl-control/get-started/
- https://developers.cloudflare.com/ai-crawl-control/reference/graphql-api/
- https://developers.cloudflare.com/analytics/graphql-api/limits/

## 4. Microsoft Clarity: dove perdiamo conversioni

È un complemento UX alle metriche di GA4/Umami: registrazioni sessioni, heatmap, dead click, rage click, excessive scroll, quickback, errori JS e engagement.

Clarity ha una **Data Export API** ufficiale, ma `numOfDays` accetta **1, 2 oppure 3**, non un intervallo arbitrario di 30/90 giorni. Quindi uno storico completo va costruito con estrazioni ripetute e conservazione locale; se salti i giorni non puoi contare su un backfill illimitato.

- Usare la API per segnali aggregati e breakdown URL/source, non per importare filmati di sessione.
- Analizzare pagine ad alto ingresso ma con bassa interazione o CTA poco usate.
- Implementare correttamente consenso e privacy (specialmente per siti rivolti a utenti UE); non registrare dati sensibili.
- I dati di Clarity non sono un sostituto delle conversioni misurate con GA4.

Fonte: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api

## 5. Performance e SEO tecnico

- **PageSpeed Insights**: API ufficiale per Lighthouse performance/accessibilità/SEO, utile per controlli su URL rappresentativi; non giudicare un sito da un singolo test lab.
- **Chrome UX Report (CrUX)**: usare le API dedicate per esperienza reale quando ci sono abbastanza dati; Google anticipa l'uscita dei dati real-user da PSI API.
- **Rich Results Test**: validazione manuale di markup supportati e rilevanti; per VitaRomagna verificare soprattutto `Event`, `Article`, `BreadcrumbList` dove realmente applicabili.
- **Ahrefs Free**: in settembre 2026 documenta 5.000 crawl credits/mese per sito verificato e visibilità limitata a 1.000 backlink/keyword contemporaneamente. Non assumere API gratuita.
- **Screaming Frog Free**: comodo per crawl a campione e confronto con l'audit interno; riserva l'integrazione automatica a una necessità provata.

Fonti:
- https://developers.google.com/speed/docs/insights/v5/get-started/
- https://ahrefs.com/webmaster-tools/
- https://help.ahrefs.com/en/articles/13002606-what-can-i-use-for-free-in-ahrefs
- https://search.google.com/test/rich-results
- https://www.screamingfrog.co.uk/seo-spider/

## 6. GEO senza scorciatoie

Un modello corretto mantiene quattro categorie di osservazioni indipendenti:

| Segnale | Che cosa misura | Che cosa NON misura |
|---|---|---|
| Impression AI Google | Presenza nelle esperienze AI Google supportate | Citazioni da ChatGPT o clic effettivi |
| Citazioni AI Bing | URL citati nelle risposte AI Microsoft/partner supportate | “Ranking” universale degli LLM |
| Richieste crawler AI | Accessi HTTP di agent/bot al sito | Utilizzo del contenuto in una risposta |
| Referral AI (GA4/Umami) | Sessioni riconducibili a referral identificabili | Visite senza referrer o citazioni senza clic |

Non proporre `llms.txt`, inserimenti artificiali di keyword, markup “AI-only” o blocchi standardizzati come ottimizzazioni GEO garantite. Privilegiare contenuto originale, aggiornato, strutturato, internamente linkato, con fonti e date corrette. La documentazione Google ribadisce che le basi SEO restano centrali.

Fonte: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide

## 7. Applicazione pratica ai nostri progetti

| Progetto | Priorità dati | Indicatori operativi |
|---|---|---|
| VitaRomagna | Bing SEO, GSC AI, Cloudflare AI, PageSpeed, Clarity selettivo | Eventi indicizzati prima della data, articoli citati, pagine 404/soft-404, traffico AI, conversioni in app |
| Portfolio personale | Bing SEO, GSC, Clarity, PageSpeed | Impression per servizi/freelance, click email/contatto, qualità CTA |
| Scadenzario | Bing SEO, GSC, Clarity, audit tecnico | Query commerciali, ingressi landing, click store/registrazione |
| Altre landing app | GSC/Bing, Clarity se utile, performance | Indicizzazione del brand, visibilità per feature, click agli store |

### Checklist di attivazione

1. Verificare domini su Bing Webmaster Tools, con sitemap aggiornate.
2. Controllare disponibilità dei report AI nelle proprietà GSC (dipende dai dati disponibili).
3. Verificare che i domini candidati siano proxati su Cloudflare, piano e limiti.
4. Abilitare Clarity solo dove misurare UX/CTA sia utile e con configurazione privacy corretta.
5. Lanciare audit PageSpeed su homepage, principali landing ed esempi di pagine evento.
6. Verificare Ahrefs Free per i domini posseduti e annotare gli audit ricorrenti.
7. Iniziare a tracciare CTA di contatto/download su GA4 prima di attribuire successi a SEO/GEO.

## Scelta definitiva

**Da integrare nel software:** Bing SEO (REST), Cloudflare AI Crawl Control, Clarity aggregato, PSI/CrUX, report GSC AI tramite import fino a API verificata, confronto SEO/GEO e regole opportunità.

**Da usare accanto al software:** Ahrefs Free, Screaming Frog, Rich Results Test, interfacce AI Performance quando manchi un export ufficiale.

**Da realizzare invece nei siti:** IndexNow/event pipeline per URL aggiornati (soprattutto eventi VitaRomagna), markup corretto, CTA misurabili, contenuti e linking interno.

Vedi anche: [Piano implementazione OpenFindability](./2026-10-15-seo-geo-implementation-plan.md).
