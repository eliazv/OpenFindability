# Dashboard refactor — implementazione e verifica

Branch: feat/dashboard-analytics-refactor. Base: ultimo master 4d5ab688 + due commit audit.
Stato: implementazione ampia, non certificata. Non è un merge-ready completo: l'ambiente non risolve github.com per git clone, non dispone di pnpm e usa Node 22 anziché Node 24. Modifiche tramite GitHub API. Non eseguiti build/typecheck/test/browser o accessi al database reale.

## Implementato
- Shell DTO minimale, cookie sidebar ripristinato, iniziali progetto, route attiva, navigazione contestuale, strumenti e centro dati.
- Home per gruppi web/app/misti e overview con KPI, sparklines, confronto periodi, scelta metrica; missing/null, coverage e valute.
- Sezioni Acquisizione, Store, Ricavi, Salute, Opportunità, Interventi e Integrazioni. Tabelle shadcn con ricerca, sort e paginazione lato server (in memoria), query string; dati provider nativi espliciti.
- Grafici con serie precedente, dati tabellari, annotazioni interventi, scatter CTR/posizione, ranked list, distribuzione recensioni. Grafici legacy meno saturi, assi, zero e resize.
- Sync per progetto/fonte con validazione e protezione same-origin invariata; niente chiamate automatiche. Store Studio resta indipendente. Tool hub espone comandi e non esegue release.
- Test unitari nuovi in tests/dashboard-metrics.test.ts (non eseguiti).

## Componenti esterni
Importati/adattati Sparkline, DeltaBadge e BarList da https://github.com/NoahGdev/dashboardcn/tree/b1ffacbca0f7a0be60135c8665b9e8c267205c48/apps/web/registry/dashboardcn/ui, licenza MIT conservata in docs/reference/dashboardcn-LICENSE.txt. Sparkline adattata a Recharts 2 (no AreaRevealShape, gaps null, animazioni off). Formattazione locale IT e colori token esistenti. KPI, explorer e scatter sono implementazioni locali. Nessuna nuova dipendenza o lockfile modificato. Non installato TanStack Table v9 o Recharts v3 senza poter verificare le peer dependencies.

## Rimanente prima di considerare concluso il piano
- Typecheck, test, build e QA visiva; verificare eventuali regressioni e semantica dati con fixture isolate.
- Query SQL di dominio (attualmente readData completo nelle pagine, solo shell ottimizzata); benchmark e indici.
- Icone reali, search/filtri portfolio, KPI globali con valuta/coverage omogenee, selettore custom date e confronto anno precedente.
- CTR e posizione come KPI ponderati; drill-down dettaglio riga, CSV safe, colonne configurabili, TanStack Table; metriche landing aggregate, ASO scatter/rank trend, vitals e performance charts, breakdown ricavi, tracker sync e timeline release, confronto interventi più approfondito.
- Dark mode, command palette, test accessibilità; stato non configurato vs pending vs parziale per tutti i connettori; dettagli Doctor filtrati, variant PPO.
- Strumenti operativi con preflight e anteprima esplicita; attualmente solo comandi documentati.
- Nessun dato fittizio in produzione e nessun parser retention/coorti inventato.

## Verifica locale suggerita
Checkout del branch, Node 24, pnpm install --frozen-lockfile; pnpm typecheck; pnpm exec tsx --test tests/dashboard-metrics.test.ts; pnpm run test:gsc; pnpm run test:reliability; pnpm run test:integrations; pnpm run test:growth-evidence; pnpm run test:seo-geo; pnpm test:dashboard; pnpm build. Avviare pnpm dev solo su DB isolato per i test demo. Verificare periodi, valori null/zero, valute, sparse snapshot, filtri e pagina mobile; no sync durante smoke test. Non usare --apply.

Riferimenti: [audit](2026-11-24-dashboard-audit-e-riprogettazione.md), [sistema visuale](2026-11-24-dashboard-visual-system-e-librerie.md).
