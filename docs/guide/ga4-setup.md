# GA4 Data API — collegamento a OpenFindability

Stato: connettore implementato sul branch `feat/ga4-gsc-sheets-incremental-2026-10-11`. Nessuna chiamata ai tuoi account eseguita automaticamente.

## Attivazione

1. Abilita **Google Analytics Data API** nel progetto Google Cloud associato al service account che OpenFindability usa già per GSC.
2. Vai in **Google Analytics → Amministrazione → Gestione accessi alle proprietà** e assegna al service account il ruolo **Visualizzatore** sulle proprietà GA4 desiderate.
3. Recupera l'ID numerico GA4 (ad esempio `123456789`, diverso da `G-XXXXXX` measurement ID).
4. Aggiorna il progetto con `pnpm run project:update -- --slug <slug> --ga4 123456789`; oppure in creazione `pnpm run project:add -- --name "Sito" --ga4 123456789`.
5. Esegui `pnpm run db:backup`, `pnpm run test:integrations`, poi `pnpm run sync:ga4`. Il progetto senza GA4 viene saltato.

Si usa `GOOGLE_SERVICE_ACCOUNT_JSON` oppure `GOOGLE_SERVICE_ACCOUNT_FILE` come per GSC: **non committare JSON e token**. Il connettore richiede `analytics.readonly`, non può modificare Analytics.

## Metriche

Il connettore interroga GA4 con dimensione `date` e quattro metriche: `activeUsers`, `sessions`, `screenPageViews`, `keyEvents`, giornalmente, fino a D-2, salvate in `metricSnapshots(source="ga4")`; sessioni ed eventi chiave sono anche in `rawJson`. È idempotente sull'unicità `project_id/source/date`.

**Interpretazione fondamentale:** la somma dei singoli `activeUsers` giornalieri **non è** il numero di utenti unici nell'intera finestra di 28 giorni. La UI la chiama somma degli utenti attivi giornalieri; per gli utenti unici a 28 giorni serve un report GA4 separato senza dimensione `date` (da aggiungere). Le metriche GA4 e Umami sono distinte, non sommabili tra provider. I dati delle giornate più recenti possono essere incompleti: la sincronizzazione si ferma a D-2.

Il comando `pnpm run growth:summary -- --slug <slug>` e il tool MCP `get_growth_snapshot` includono GA4 separatamente.

Documentazione ufficiale: https://developers.google.com/analytics/devguides/reporting/data/v1/basics
