# Architettura delle release iOS centralizzate

OpenFindability e' il punto di comando locale per piu' app Flutter e Capacitor. Un esecutore macOS compila e firma; la CLI avvia il lavoro, conserva il correlation ID e legge separatamente stato GitHub e processing Apple. Android mantiene la propria pipeline.

## Backend predisposto: un runner GitHub privato

Un unico workflow manuale serve tutti i repository app autorizzati. Non occorrono workflow o Secrets nei singoli progetti. Il template generico e' in `integrations/ios-release-runner/`; identita' reali e allowlist sono private.

E' sufficiente un repository privato aggiuntivo per tutte le app. Il deposito cifrato Fastlane Match puo' stare in un branch separato `signing` dello stesso repository (`MATCH_GIT_BRANCH`), oppure in un secondo repository privato opzionale. I branch non separano i permessi di lettura.

Il repository pubblico OpenFindability non ospita il workflow di firma privilegiato. Rimane possibile usare in futuro un Mac remoto senza un nuovo repository, ma il backend SSH diretto non e' implementato. In ogni caso macOS/Xcode sono necessari.

## Contratti e limiti

- Dry-run di default. `--build --unsigned` compila senza firma; `--build` genera IPA firmato; `--apply` aggiunge upload TestFlight, senza submission App Store.
- SHA completo approvato nell'allowlist privata, repository consentito, Team e bundle verificati. Mai compilare codice arbitrario di PR/fork con segreti.
- Flutter usa la propria cartella app, lockfile e configurazione nativa. Capacitor usa build web npm, sync iOS con lockfile e archive/export Xcode. Target, workspace e toolchain sono configurabili per progetto.
- Match readonly in CI, keychain temporaneo, verifica di app/estensioni, versioni, certificati, profili ed entitlements. Ogni identita' iOS mantiene il proprio profilo.
- `connectorRuns` registra intent/dispatch, senza equiparare accettazione a upload o processing. `ios-status` legge le due piattaforme; una dashboard/reconciliation automatica non e' ancora implementata.
- L'implementazione Windows e i test offline preparano il percorso; build native, firma e installazione richiedono validazione macOS per ogni app.

Per configurazione, dati Apple/Mac e comandi: [guida di setup](ios-release-setup-handoff.md). Gli inventari delle app personali e i dettagli di rollout restano in `private-notes/ios-release/`, mai in questa documentazione pubblica.
