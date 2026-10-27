# Setup release iOS centralizzate

OpenFindability rimane il punto di comando per tutte le app. Sorgenti, firma e compilazione sono configurati una volta per progetto; non serve un workflow nel repository di ogni app. Le build iOS richiedono macOS e Xcode: Windows puo' avviare e controllare il lavoro, ma non compilare un IPA da solo.

Questa guida pubblica contiene solo esempi fittizi. Inventari reali, percorsi personali, Team ID, Bundle ID, profili e stato del setup vanno in `private-notes/ios-release/`; configurazioni operative in `secrets/ios/` e nel database locale. Credenziali in `.env`, `secrets/` o GitHub Secrets. Non committare output Apple o configurazioni reali nel template pubblico `integrations/ios-release-runner/apps.json`.

La rimozione da un file attuale non cancella le versioni gia' committate: l'eventuale bonifica della cronologia Git e' un'operazione distinta.

## Quanti repository servono?

| Modalita' | Repository aggiuntivi | Stato |
| --- | --- | --- |
| GitHub Actions macOS, runner centrale privato | Uno per tutte le app | Backend predisposto; richiede bootstrap e prova macOS |
| Deposito Match nello stesso runner, branch separato `signing` | Nessuno oltre al runner | Supportato tramite `MATCH_GIT_BRANCH` |
| Deposito Match privato separato | Uno opzionale | Separazione degli accessi, non requisito |
| Mac proprio/remoto controllato direttamente | Nessuno obbligatorio | Possibile architettura, backend SSH non implementato |

Il repository pubblico OpenFindability conserva il codice generico e la CLI. Il runner privato ospita allowlist reale e workflow privilegiato; il suo branch `signing` contiene solo il deposito cifrato Match, senza workflow. `main` contiene il runner. Match usa `clone_branch_directly: true`: non deve interpretare il codice del runner come deposito firme.

Quindi non servono due repository nuovi ne' un repository nuovo per ogni app. Tutte le operazioni abituali partono da OpenFindability. Il Mac remoto e' l'esecutore; il secondo repository firme rimane opzionale. Non viene creato alcun repository automaticamente.

## Compatibilita' e mapping per app

- Flutter: progetto iOS e Pods esistenti, target/estensioni espliciti, versione Flutter fissata.
- Capacitor: build web con script npm configurato, `cap sync ios --deployment`, progetto/workspace Xcode e Pods esistenti, versione Node fissata.
- Repository con piu' app: `workingDirectory` indica la sottocartella di ciascuna app. La radice da sola non basta se contiene piu' identita' iOS.
- Ogni app richiede App ID/profili/capability propri. Lo stesso certificato Distribution puo' servire app dello stesso Team; non elimina i profili delle estensioni.
- Configurazioni particolari (flavor Flutter, SPM senza CocoaPods, altri framework) richiedono un adattamento e vengono rifiutate finche' non supportate. La compatibilita' del builder non equivale a una release macOS gia' verificata per tutte le app.

Il mapping locale contiene `repository`, `appId`, `teamId`, `bundleIds` (app per prima), `framework` e, per sottocartelle, `workingDirectory`. Il runner verifica una propria allowlist privata con SHA approvati, target, entitlements e toolchain: i dati inviati dalla CLI non possono sostituirla.

## Setup una volta sola

1. Creare un repository runner privato; copiare il pacchetto `integrations/ios-release-runner/` alla radice e spostare il solo YAML in `.github/workflows/release-ios.yml`. Lasciare workflow_dispatch sul default branch.
2. Per usare un solo repository, inizializzare un branch separato `signing` per Match, senza copiare il codice del runner. Un secondo deposito privato resta un'alternativa.
3. Creare Environment `ios-release`, limitato al default branch. Configurare le credenziali qui sotto. Reviewer opzionali secondo il piano GitHub.
4. Sul Mac risolvere e committare `Gemfile.lock`, importare certificato/profili in Match e provare la lettura readonly. Non revocare certificati esistenti e non usare `match nuke`.
5. Compilare l'allowlist privata, confermare Xcode disponibile su `macos-15`, Flutter/Node e lockfile, poi approvare un commit e abilitare l'app. Le action del template sono fissate a SHA.
6. Prima prova senza firma, poi IPA firmato, poi upload TestFlight esplicitamente richiesto. Verificare costi e quote macOS del runner privato.

| Tipo | Nome | Scopo |
| --- | --- | --- |
| Secret runner | `SOURCE_APP_ID`, `SOURCE_APP_PRIVATE_KEY` | GitHub App con Contents read sui soli sorgenti autorizzati |
| Secret runner | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT` | Team API Key Apple; contenuto PEM `.p8` completo |
| Secret runner | `MATCH_PASSWORD` | Password cifratura deposito Match |
| Secret runner | `MATCH_GIT_BASIC_AUTHORIZATION` | Base64 di utente:token per lettura deposito firme |
| Variable runner | `MATCH_GIT_URL` | URL HTTPS del runner stesso oppure del deposito separato |
| Variable runner | `MATCH_GIT_BRANCH` | `signing` nel caso di repository unico |
| `.env` locale | `OPENFINDABILITY_RELEASE_RUNNER_REPO`, `_REF`, `_TOKEN` | Dispatch; token Actions write limitato al runner |

Se codice runner e firme condividono repository, il token Match read-only legge comunque quel repository: i branch non sono confini di autorizzazione. La cifratura Match e gli accessi al repository restano necessari. La credenziale di bootstrap ha scrittura; la CI soltanto lettura.

## Dati da raccogliere su Mac e Apple

Salvare i risultati nel documento privato del setup:

- `xcodebuild -version`, `xcode-select -p`, `flutter --version` oppure `node --version`, `pod --version`, `ruby --version`.
- Dal repository app: SHA remoto e stato modifiche, elenco scheme/target Xcode, eventuali passaggi web o nativi particolari. Non inviare dump indiscriminati di build settings o Keychain.
- Certificato Apple Distribution valido con chiave privata esportabile in `.p12`; un `.cer` da solo non basta. Scadenza e backup protetto.
- Profili App Store Connect per app ed estensioni, stesso Team e certificato, capability coerenti. Non servono UDID per questi profili.
- Membership/accordi Apple attivi, Apple ID numerico e Bundle ID dell'app, Team ID, App Group e altre capability richieste.
- API Key ASC con ruolo/accesso adeguati all'upload: Key ID, Issuer ID e `.p8` originale. La chiave Sign in with Apple e' un'altra cosa.
- Ultima build TestFlight, processing/compliance e gruppo tester interno scelto.

Non mettere `.p12`, `.p8`, password o chiavi GitHub nei documenti o in chat. Tenerli sul Mac o trasferirli direttamente nelle posizioni protette e nei Secrets del runner.

## Uso dai repository delle app

Eseguire la CLI con OpenFindability come directory corrente, passando il percorso dell'app:

```powershell
npx tsx scripts/release.ts ios --path C:/work/demo-app --sha <SHA_COMPLETO> --build-name 1.2.3 --build-number auto
# Compilazione remota senza firma
npx tsx scripts/release.ts ios --path C:/work/demo-app --sha <SHA_COMPLETO> --build-name 1.2.3 --build --unsigned
# IPA firmato, nessun upload
npx tsx scripts/release.ts ios --path C:/work/demo-app --sha <SHA_COMPLETO> --build-name 1.2.3 --build
# Upload TestFlight, nessuna pubblicazione App Store
npx tsx scripts/release.ts ios --path C:/work/demo-app --sha <SHA_COMPLETO> --build-name 1.2.3 --build-number auto --apply
npx tsx scripts/release.ts ios-status --path C:/work/demo-app
```

I segnaposto vanno sostituiti. In alternativa usare `--slug demo`. La prima associazione del progetto si salva con `project:update --ios-config secrets/ios/demo.json`. `--path` identifica soltanto la configurazione locale: la build remota usa il repository configurato e lo SHA esplicito, non carica la cartella Windows o modifiche non committate.

Usare Node 24 e pnpm 10. Dopo cambi runtime: `pnpm rebuild better-sqlite3`; prima di modifiche rischiose allo store: `pnpm run db:backup`. I problemi di rete EACCES del sandbox si verificano ripetendo la lettura con accesso rete autorizzato, senza disabilitare TLS.

## Quando il setup e' finito

Build senza firma riuscita, IPA verificato con tutti i target, upload confermato e build esatta `VALID` in ASC, compliance risolta, installazione da TestFlight e prova delle funzionalita' native e acquisti. Dispatch accettato non significa TestFlight pronto. Dopo timeout cercare il correlation ID prima di riprovare. Una richiesta per app alla volta.

Fonti: [Capacitor iOS](https://capacitorjs.com/docs/ios), [sync con lockfile](https://capacitorjs.com/docs/cli/commands/sync), [Match e branch](https://docs.fastlane.tools/actions/match/), [build Xcode/Fastlane](https://docs.fastlane.tools/actions/build_app/).
