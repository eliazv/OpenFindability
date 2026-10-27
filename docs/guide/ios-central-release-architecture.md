# Release iOS centralizzate: OpenFindability + runner macOS

**Data:** 27 ottobre 2026  
**Stato:** proposta architetturale verificata sul codice (non implementata, nessun build/upload eseguito)  
**Fonte:** \`master\` di OpenFindability e \`develop\` di \`eliazv/scadenziario\`.

## Decisione proposta

**Non creare una pipeline, un set di secrets e una configurazione Fastlane separata in ogni repo Flutter/Capacitor.** OpenFindability rimane **control plane locale** per status, preflight, conferma, storico e trigger; un solo **runner di distribuzione privato** su GitHub Actions macOS esegue le build. Il runner può compilare sorgenti da repository app diversi mediante checkout autenticato e ref verificato. Il Mac locale/remoto serve solo per debug e per esigenze native non coperte dalla CI.

> OpenFindability è un repository **pubblico**, nato come strumento local-first; non collocare la firma Apple e un workflow di release privilegiato direttamente nel suo repo pubblico. Creare un repository **privato** dedicato, es. \`eliazv/mobile-release-runner\`, con accesso ristretto e GitHub Actions macOS. Il nome è indicativo, non esiste ancora.

### Oggi: elementi riutilizzabili (verificati)

- \`lib/release.ts\`: Android Flutter preflight/build/controllo firma/upload senza dipendenze DB.
- \`scripts/release.ts\`: risolve \`--slug\`/\`--path\`, gestisce \`--build\`/\`--apply\`, registra la release Android in \`connectorRuns\`.
- \`docs/guide/release-workflow.md\`: firma Android centrale con \`secrets/android/<slug>/key.properties\`, senza modifiche a ogni Gradle.
- \`lib/connectors/appstoreconnect.ts\`: legge \`ASC_ISSUER_ID\`, \`ASC_KEY_ID\`, \`ASC_PRIVATE_KEY_PATH\`; esiste già un collegamento ASC utilizzato per app/metadata/status. **Il servizio attuale non implementa upload IPA o gestione signing**.
- \`lib/types.ts\` e \`lib/db/schema.ts\`: \`Project\` contiene \`appStoreTrackId\` e \`flutterProjectPath\`; **non** contiene ancora \`githubRepo\`/ref/Bundle IDs per le release macOS.
- \`scripts/store-status.ts\`: controlla le versioni App Store, ma **non** il massimo numero build caricato e non lo stato dei job CI.
- Nessun workflow/motore iOS implementato in OpenFindability: la guida \`release-workflow.md\` dichiara espressamente “solo Android”.
- Scadenzario ha \`ios/Runner.xcodeproj\`, tre target nativi (Runner, Widget, ShareExtension), \`Podfile.lock\` e \`ios/fastlane/Fastfile\`. Documentazione dettagliata: \`doc/setup/IOS_GITHUB_ACTIONS_RELEASE_RUNBOOK_2026-10-27.md\` nel repo Scadenzario.

## Proposta A (preferita): orchestratore centrale + un solo runner GitHub privato

\`\`\`text
 Windows
 OpenFindability (CLI ora; interfaccia web locale dopo)
    |
    | status | preflight | build | release --apply
    | API GitHub Actions: workflow_dispatch, token Actions:write limitato
    v
 eliazv/mobile-release-runner [PRIVATO]
    |- workflow_dispatch (slug, repo consentito, SHA approvato, versione, build, mode)
    |- checkout repo app PRIVATO via GitHub App read-only / token fine-grained
    |- Flutter/Capacitor + Xcode + CocoaPods + Fastlane
    |- Apple Distribution dal keychain temporaneo
    |- fastlane match (read-only sul runner) / profili per app e target
    |- archivio, export IPA, verifica 3 target (Scadenzario)
    |- mode=build: artifact accesso ristretto
    \- mode=testflight: API key Apple -> TestFlight (NON production)
    |
    | stato run e link, build ASC dopo processing
    v
 OpenFindability: connectorRuns/audit; dashboard stato futuro
\`\`\`

- Unico \`release-ios.yml\` **nel repo runner**, non nei repository delle app.
- Un'unica **Apple Distribution identity** può firmare app dello **stesso Apple Developer Team**. **Ogni app/extension deve comunque avere il proprio App ID e provisioning profile**, con capability coerenti. Questa parte Apple non può essere azzerata.
- **fastlane match** può utilizzare **un unico deposito cifrato privato** (Git repository o storage supportato) per certificati e profili di diversi bundle IDs. In esecuzione CI usare \`readonly: true\` e fallire se manca un profilo; amministrazione/rigenerazione avviene solo in setup controllato. Non revocare certificati esistenti di app pubblicate.
- Una **App Store Connect API Key** con permessi adeguati al team può essere usata dal runner per l'upload delle app del team; verificare ruoli e app scope. La chiave \`.p8\` già presente in OpenFindability per metadata non diventa automaticamente visibile al runner: caricarla **una sola volta** nei secrets del repository privato o fornirla tramite vault protetto. Mai inviarla come input workflow.
- GitHub App con permessi \`Contents: read\` sulle **sole repo app abilitate** per checkout cross-repo (GitHub \`GITHUB_TOKEN\` standard del runner non può fare checkout di un altro repo privato). Per avviare il runner da OpenFindability, un token distinto con \`Actions: write\` **solo sul runner**, conservato localmente in \`.env\`/vault. Evitare PAT generici full-repo.
- Il codice checkout delle app è eseguibile: \`flutter pub get\`, Gradle, \`pod install\`, build script e plugin possono eseguire codice sul runner con accesso ai segreti. **Consentire solo repo e commit controllati**; non firmare commit non revisionati di PR/fork. Separare build priva di secret e firma in job separati per quanto pratico.
- Il workflow deve validare **allowlist slug→repository→Bundle IDs**, commit SHA esplicito, team, package/bundle mapping, input innocui, branch consentiti e richiesta di rilascio. Non usare un input \`repo\` libero come URL clone o shell script; non trattare il JSON del progetto come autoritativo se l'utente può manometterlo.
- Per il primo prototipo usare \`workflow_dispatch\` e \`release-id\`/correlation id. La GitHub API restituisce i riferimenti alla run nelle API attuali: usare gli identificatori effettivamente ritornati, non supporre che “HTTP success” significhi “IPA caricato”.
- Il workflow privato deve essere sul suo **default branch** per essere avviabile con workflow_dispatch. \`concurrency\` per app, \`cancel-in-progress: false\`; non consentire due release in parallelo sullo stesso bundle ID.
- \`permissions: contents: read\` per il token GH di base; accessi GitHub App temporanei e separati; non passare secrets a fork/PR, non esporli nei log/artifact; cleanup keychain/profile/temp file.
- Runner macOS standard: fatturazione **sul repository runner privato** (piano GitHub e quote). Non confondere il fatto che OpenFindability sia pubblico con gratuità delle build macOS nel repository privato.

### Proposta B (alternativa): reusable workflow per repo

Un workflow centrale \`workflow_call\` condiviso e un file YAML piccolo in ogni app. Vantaggi: permessi/ref e check vicino all'app; cache e build associati al repository chiamante. Svantaggi: **serve comunque almeno un file workflow e gestione secrets/repository per ogni app**; inoltre la fatturazione runner avviene nel repository chiamante. Quindi non raggiunge l'obiettivo “zero workflow per progetto”. Per questo scegliere A.

### Proposta C (futuro): Mac mini come runner remoto

Lo stesso orchestratore centrale può scegliere un backend diverso per le build quando il Mac mini è disponibile: accesso remoto controllato / runner self-hosted macOS. Non è un modo di compilare senza macOS; richiede Mac acceso, aggiornato e hardening delle credenziali. Valutare dopo aver verificato la pipeline cloud. Su runner self-hosted non eseguire codice da repo non fidati.

## Rimanenze inevitabili per ogni app (setup una tantum, NON workflow GitHub)

| Requisito | Condivisione tra app | Note |
| --- | --- | --- |
| Bundle ID/iOS Xcode project, entitlements/capabilities | No | Parte del codice app; Scadenzario già li ha |
| App ID Apple + profili distribution | Un profile per ogni bundle ID/extension | Scadenzario: 3 |
| Apple Distribution certificate | Sì, per stesso Team | Verificare expiry e validità |
| Apple API key ASC | Generalmente condivisibile per team | App scope/ruoli corretti |
| Runner YAML, Xcode/Flutter/Fastlane | **Sì, condivisi** | Centralizzati nel repository runner |
| Credenziali GitHub private-code checkout | **Sì, una GitHub App** | Installata sulle repo abilitate |
| Repo→progetto→Bundle ID e version schema | Config una tantum per app | OpenFindability locale e runner allowlist |
| Secrets nel repo di ogni app | **No** | Restano solo nel runner privato |
| Build number per App Store Connect | Per app e versione | Consultare build effettive, non solo le versioni |

### Scadenzario, pilot

\`\`\`yaml
slug: scadenzario
githubRepo: eliazv/scadenziario
framework: flutter
workingDirectory: .
flutterVersion: "3.47.6"
appleTeamId: TP72E87G5R
ios:
  appBundleId: com.eliazavatta.scadenzario
  extensions:
    - com.eliazavatta.scadenzario.ScadenzarioWidget
    - com.eliazavatta.scadenzario.ShareExtension
  scheme: Runner
destination: testflight
\`\`\`

Questo è **un esempio di schema non sensibile**, non un file già implementato. Il repository runner verifica da allowlist propria che questi valori siano corretti. I tre profili/provisioning si popolano nel deposito centrale Match. Flutter iOS: rispettare \`Podfile.lock\`, \`ios/fastlane/Fastfile\`, workaround gRPC e configurazioni del target Widget; non rigenerare a caso il progetto Xcode.

## API/CLI OpenFindability da aggiungere

Conservare la UX Android: **dry-run di default**, \`--build\` produce solo IPA nel cloud, **\`--apply\` richiede consenso esplicito e carica solo TestFlight** (non App Store live).

\`\`\`powershell
# Futuro; NON sono comandi implementati oggi
npx tsx scripts/release.ts ios --slug scadenzario
npx tsx scripts/release.ts ios --slug scadenzario --build
npx tsx scripts/release.ts ios --slug scadenzario --build-number auto --apply
npx tsx scripts/release.ts ios-status --slug scadenzario
\`\`\`

- In \`lib/release-ios.ts\` una funzione pura \`planIosRelease\` con validazione progetto iOS e \`appStoreTrackId\`, risoluzione remota del repository, verifica versione/numero build, elenco dei target e stato signing; **nessun upload** nel preflight.
- In \`lib/connectors/github-actions.ts\` dispatch e lettura delle run con GitHub API; \`GitHub Actions write\` limitato al runner. Input: \`slug\`, \`commit SHA\`, \`build-name\`, \`build-number\`, \`mode=build|testflight\`, \`correlation-id\`. Non passare secrets come workflow inputs.
- In \`lib/connectors/appstoreconnect.ts\` un'API read-only per recuperare i **build** presenti su ASC (non solo versioni \`appStoreVersions\`): scegliere un numero nuovo e verificarlo di nuovo all'upload. Fare attenzione a build duplicati e fallimenti/retry.
- In \`lib/types.ts\`, \`lib/db/schema.ts\`, \`scripts/update-project.ts\`: aggiungere \`githubRepo\` e campo/i per framework e bundle ID con migrazione Drizzle; riusare \`appStoreTrackId\` e \`flutterProjectPath\` per dati già noti. **Il percorso Windows locale non è checkout path valido sul runner macOS**. Migrazioni additive, nessuna modifica al DB utente qui.
- In \`lib/types.ts\` e \`lib/db/schema.ts\`: aggiungere \`ios_release\` alla sorgente dei \`connectorRuns\` e documentare stati \`planned\` (non persistito se dry run), \`queued\`, \`running\`, \`built\`, \`uploaded\`, \`processed\`, \`failed\`. **Dispatch accettato ≠ TestFlight pronto**. Per non complicare lo schema, iniziare con \`connectorRuns\` + \`stats\` JSON contenente run_id/SHA/versione/destinazione/errori (non segreti).
- \`scripts/release.ts\`: mantenere Android invariato, instradare nuovi sottocomandi iOS e \`ios-status\`; \`--slug\` o inferenza dai file iOS quando \`--path\` è presente, chiedere metadata solo alla prima associazione.
- \`package.json\`: comandi \`release:ios\`, \`release:ios-status\` e documentazione \`docs/guide/release-workflow.md\` link al presente piano; futura UI solo dopo CLI end-to-end.
- Test offline/mock per configurazione, traversal/path injection, denylist PR, duplicati, concurrency, switch profili, mancata autorizzazione, fallimenti API, no mutation su dry-run, dispatch vs upload vs processing ASC.

### Una tantum: configurazione credenziali

1. Creare repository **privato** runner con workflow_dispatch e autenticazione minima.
2. Configurare token locale \`OPENFINDABILITY_RELEASE_RUNNER_TOKEN\` limitato a \`Actions:write\` sul solo runner; limitare endpoint di dispatch a utenti che hanno accesso locale autorizzato a OpenFindability.
3. Configurare il GitHub App token read-only per ottenere \`eliazv/scadenziario\` e successive repo private.
4. Portare Apple Distribution + tutti i profili dei tre target di Scadenzario nel deposito \`match\` cifrato oppure, per il primo test, tre profili statici **solo nel runner privato**. Non conservare i due sistemi di firma in parallelo.
5. Mettere nel runner \`ASC_KEY_ID\`, \`ASC_ISSUER_ID\` e chiave \`.p8\` via Secrets GitHub; non confondere con la chiave Sign in with Apple di Firebase.
6. Verificare App ID e capability nel portale Apple. Per ciascuna app futura aggiungere metadata e profili app/extension, non workflow né segreti per repo.
7. **Niente App Store production automatico** nel primo rilascio; solo build IPA + TestFlight e conferma finale manuale in Apple UI.

## Rollout graduale / criteri di completamento

**P0 — progetto locale (solo documentazione / preflight):** verificare le tre entitlements di Scadenzario e il massimo build number realmente presente su ASC. Separare dati locali vs remoti; gli identificatori effettivi vanno letti e confrontati con il progetto Xcode.

**P1 — runner privato senza segreti:** un \`workflow_dispatch\` con slug Scadenzario + SHA ammesso fa checkout autenticato, installa Flutter/Xcode, \`pod install\` e \`flutter build ios --release --no-codesign\`. Correggere i problemi nativi qui prima della firma.

**P2 — signing:** keychain temporaneo, Match readonly o profili centralizzati e export App Store Connect; IPA con Runner + due \`.appex\`, entitlements \`aps-environment=production\` in release e versioni corrette.

**P3 — upload:** API Key Fastlane → TestFlight; controllare processing in ASC, installazione su iPhone, login Apple/Google, IAP/RevenueCat, push, widget e Share Extension. Ripetere con numero build nuovo.

**P4 — integrazione OpenFindability:** CLI con dry-run, \`--build\`, \`--apply\`; tracciare job GitHub e stati reali, evitare upload duplicati e gestire errori/timeout.

**P5 — altri progetti:** seconda app Flutter, poi Capacitor (Node/npm, \`npx cap sync ios\`, Pods e Xcode, stessi principi di signing ma pipeline builder diversa). Capacitor non è compilabile con la pipeline Flutter senza adattamento.

**Successo:** lanci da Windows \`release:ios --slug scadenzario --apply\` e verifichi che una build firmata e processata compaia su TestFlight, **senza** installare workflow, Fastlane, certificati o Secrets GitHub nel repo Scadenzario; per una nuova app aggiungi soltanto la sua identità iOS, i profili necessari e il mapping autorizzato nel sistema centrale.

## Sicurezza: guardrail imprescindibili

- OpenFindability è locale per impostazione predefinita: **non pubblicare una route API Next.js** che avvii pubblicazioni senza autenticazione/autorizzazione rigorosa e controllo CSRF/origine. Partire da CLI.
- Le chiavi Apple **non vanno** nel codice del repo OpenFindability pubblico, in file di project metadata o nel foglio Google Sheet esportato.
- \`GITHUB_TOKEN\` del runner non legge automaticamente le app private: serve token scoped cross-repo / GitHub App. Permessi GitHub App limitati solo a \`Contents:read\` sui repo selezionati.
- Buildare codice equivale a eseguirlo su un runner con privilegi: basarsi su SHA approvati, non su branch non revisionati da input utente, e non compilare PR estranee con le secrets disponibili.
- Per le chiavi di firma usare sempre backup e strategia di rotazione coordinata; Fastlane Match in CI **readonly** dopo bootstrap.
- Non eseguire in automatico \`release:ios --apply\` da eventi push o testi arbitrari di un agente: richiede sempre azione esplicita.
- Esito dispatch GitHub non significa upload né disponibilità in TestFlight. Mostrare run URL, stato reale, errors e ultimo timestamp sincronizzato.

## Documentazione ufficiale

- GitHub Actions reusable workflow e loro limitazioni: https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations
- GitHub REST workflow dispatch: https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
- GitHub checkout repo privati: https://github.com/actions/checkout#checkout-multiple-repos-private
- GitHub App token per repo selezionati: https://github.com/actions/create-github-app-token
- Fastlane Match per più App ID e più app: https://docs.fastlane.tools/actions/match/
- Fastlane TestFlight API Key: https://docs.fastlane.tools/actions/pilot/
- Apple: profili App Store Connect: https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile
- Flutter iOS: https://docs.flutter.dev/deployment/ios

## Cambio di piano rispetto al runbook Scadenzario

Il runbook \`doc/setup/IOS_GITHUB_ACTIONS_RELEASE_RUNBOOK_2026-10-27.md\` in Scadenzario descrive una pipeline **standalone** con Secrets nel singolo repo: rimane un possibile piano B, **non più la scelta preferita** se la centralizzazione OpenFindability viene realizzata. L'inventario dei tre target, la validazione entitlements e i controlli tecnici restano validi. Non duplicare la gestione delle identità Apple sia nel repo app sia nel runner centrale.

**Nessun workflow è stato creato, nessun segreto è stato caricato, nessuna release è stata avviata con questo documento.**
