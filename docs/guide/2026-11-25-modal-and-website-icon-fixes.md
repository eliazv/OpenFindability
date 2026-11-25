# Correzione modali, header e favicon web

## Interfaccia

Eliminata anche la barra mobile rimasta nel DashboardShell; su mobile si apre il drawer con un singolo pulsante flottante in basso a sinistra (Ctrl+B da tastiera), con spazio inferiore riservato nel contenuto. Su desktop resta solo la sidebar, senza header globale. I titoli, azioni e filtri delle singole pagine non sono header globali e sono preservati.

La segnalazione overlay scuro senza contenuto è compatibile con un problema di stacking/posizionamento. I due dialog condividevano z-50 tra overlay e pannello e dipendevano dai token Tailwind di posizione/dimensione. I portali Radix ora hanno regole CSS esplicite per overlay z-index 60 e contenuto 61; centratura tramite inset/margin, larghezza responsive, altezza massima e sfondo. La correzione vale anche per le Sheet. Non è stata riprodotta la sessione Next reale dell'utente, quindi non si attribuisce con certezza la causa alla sola cascata CSS.

## Favicon

Il vecchio fallback provava solo `/favicon.ico`, `/favicon.png`, `/favicon.svg`, `/icon.png`, `/apple-touch-icon.png`. Il sorgente corrente dei due siti indicati mostra:
- portfolio-elia, app/layout.tsx: `/images/icons/ez-viola-32.png` e `/images/icons/ez-viola-180.png`;
- globo-ricambi, app/layout.tsx: `/logos/favicon-96.png`.

Nessuna eccezione per dominio: durante l'aggiornamento artwork si legge la home del sito configurato, si estraggono i link rel icon, shortcut icon, apple-touch-icon, si risolvono URL relativi rispetto alla pagina dopo redirect e si prova il fallback standard. Priorità al logo store/Flutter/custom esistente, poi cache favicon web. L'aggiornamento dalla sidebar e dalle integrazioni include ora progetti solo web. Cache sotto `data/project-icons/web`, per origine, 30 giorni dopo successo, 1 giorno dopo tentativo fallito; refresh esplicito forza il tentativo. Cache precedente mantenuta se il download non riesce.

Sicurezza: hostname pubblici, porte standard, HTTP(S), niente credenziali, cookies o header di autorizzazione, DNS IPv4 pubblico verificato e connessione all'IP validato (Host/SNI del dominio), redirect limitati allo stesso dominio o variante www, no downgrade HTTPS, dimensione/tempo/numero candidati limitati. Non si scaricano immagini da CDN di domini terzi né si supportano SVG in cache al momento. IPv6-only e siti che bloccano la richiesta possono usare il fallback esistente o una PNG manuale. Nessun fetch degli store/siti aggiuntivo durante il render per la cache; refresh manuale o sync generale/GSC/store.

## Verifica

- 2/2 test isolati discovery favicon eseguiti con Node 22 e TypeScript transpileModule; SHA dei sorgenti e test confrontati con i blob del branch. Coprono i due percorsi, www, URL privati e IP riservati.
- Smoke test CSS con Chromium, pagina statica che usa le nuove regole, pannello sopra overlay anche se l'overlay appare dopo nel DOM: 4/4 configurazioni (settings/search × 1440×900/375×667).
- Test mock di cache aggiunto, non eseguito. Non eseguiti pnpm install/build/typecheck o smoke test Next/React completo per assenza dipendenze e DNS. Il download live delle due favicon non è stato verificato nell'ambiente: i percorsi sono verificati dai rispettivi repo.
- Nessuna dipendenza nuova né migrazione. Riavviare `pnpm dev` (se uso di `pnpm start`, eseguire prima `pnpm build`). Aprire Impostazioni e Cerca, verificare visibilità e chiusura, aggiornare icone dal pannello Organizza progetti. Se 403 o overlay persistono, acquisire console/browser Network e verificare commit in esecuzione.
