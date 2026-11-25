# Fix sidebar, artwork HTTP 403 e riordinamento condiviso

## Causa individuata

I route handler confrontavano l'header `Origin` con `new URL(request.url).origin`. Next può ricostruire l'URL interno usando l'indirizzo del listener, ad esempio `http://127.0.0.1:3000`, mentre il browser naviga su `http://localhost:3000`. In quel caso una richiesta legittima riceve 403 prima di raggiungere SQLite o gli store.

Il caso è riprodotto nei test unitari, non in una sessione Next reale: se il browser restituisce ancora 403 dopo il fix, controllare l'effettivo Host/Origin nella scheda Network e il nuovo messaggio JSON. Non allargare la allowlist senza una decisione esplicita di esporre il servizio e introdurre autenticazione.

## Fix

`lib/dashboard/local-request.ts` verifica l'header Host effettivo (solo localhost, 127.0.0.1 o ::1) e lo confronta con l'Origin sulle scritture. Rifiuta host esterni, origin assenti, mismatch di host/porta, origin null e richieste cross-site. Non si fida di X-Forwarded-Host. I controlli sono riutilizzati per sidebar, artwork, azioni progetto, sync, backup, export e doctor. Il launcher resta loopback-only. Non è un meccanismo di autenticazione per una distribuzione remota.

## Riordinamento

Nuovo `components/ui/sortable-list.tsx`, wrapper del preset ufficiale [dnd-kit sortable](https://dndkit.com/legacy/presets/sortable/usesortable/), con handle dedicato, PointerSensor, KeyboardSensor, lista verticale, transizioni e annullamento. Usa Button shadcn già presente. Integrato in gestione sidebar e ordine delle metriche principali. Le frecce esplicite della sidebar restano utilizzabili senza drag; si apre il pannello anche dalla sidebar compressa. Le impostazioni restano su SQLite, senza migrazioni aggiuntive. Il recupero manuale artwork ignora la cache dei tentativi falliti.

Versioni fissate: @dnd-kit/core 6.3.1, sortable 10.0.0, utilities 3.2.2. Lockfile aggiornato con metadata e integrity delle versioni esatte da un lockfile pubblico verificato, adattando i peer alla versione React già presente. Non è stato rigenerato da pnpm perché npm registry non risolvibile dall'ambiente. Verificare l'installazione frozen sul PC.

## Verifica locale

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:dashboard-analytics
pnpm dev
```

Aprire sia localhost sia 127.0.0.1 sulla porta riportata dal launcher. Spostare una voce, nasconderne una e salvare, ricaricare e verificare persistenza. Provare touch/tastiera e il recupero delle icone. Il download artwork reale dipende dalla disponibilità della scheda pubblica e dal CDN. L'UI riporta ora il codice HTTP e il messaggio preciso.

Tre test del guard eseguiti e passati su Node 22, transpileModule dei due file originali verificati tramite SHA Git. Nessuna build completa, installazione delle nuove dipendenze, browser smoke test, migrazione o modifica al DB reale eseguita.
