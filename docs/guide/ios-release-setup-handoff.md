# Setup release iOS: cosa manca e cosa passarmi

Preparato il **27 ottobre 2026**. Obiettivo: avviare da Windows build centralizzate e upload **TestFlight** per Scadenzario, poi riusare il runner per altre app.

## Già preparato in OpenFindability

- `release:ios` e `release:ios-status`, senza modificare il comportamento Android.
- Preflight read-only con app Apple verificata, SHA completo e versione esplicita. Numero build `auto` basato su tutte le build ASC paginate, comprese processing/expired. Numerazione intera crescente globale; build Apple con numeri puntati bloccano il piano e richiedono riconciliazione.
- Identità remota per progetto in `iosReleaseConfig`; migrazione additiva generata, non applicata durante la preparazione. Non usa il percorso Windows sul runner.
- Dispatch verso repository privato, storico locale in `connectorRuns` e correlation ID. Nessun endpoint web di pubblicazione.
- Pacchetto runner in `integrations/ios-release-runner/`: workflow, allowlist, Fastlane Match readonly, controllo IPA e tre target, compilazione senza firma separata dall'upload.

**Non è una release già funzionante:** repository privato e deposito Match vanno predisposti, credenziali installate, toolchain macOS verificata e prima build provata. Nessun upload o rilascio Apple è stato eseguito. Il template lascia Scadenzario disabilitato e senza SHA approvati.

Verifiche eseguite su Windows: typecheck TypeScript, 5 test offline CLI/connector, 6 test della policy runner, sintassi Ruby/Python, parsing YAML e migrazione su SQLite in memoria. Il tentativo read-only `asc:apps` ha restituito `fetch failed` in questo ambiente: Apple ID e build reali non sono stati confermati via API. Il backup locale è stato tentato e bloccato dal mismatch Node/SQLite descritto sotto; database reale e migrazione non sono stati toccati.

## Identificativi già letti dal progetto locale

Ho verificato `C:/Users/zavat/Desktop/Progetti/scadenziario/ios/Runner.xcodeproj/project.pbxproj` e gli entitlements presenti sul PC:

| Elemento | Valore |
| --- | --- |
| Repository previsto | `eliazv/scadenziario` |
| Apple Team | `TP72E87G5R` |
| Target principale | `Runner` → `com.eliazavatta.scadenzario` |
| Widget | `ScadenzarioWidget` → `com.eliazavatta.scadenzario.ScadenzarioWidget` |
| Share Extension | `ScadenzarioShareExtension` → `com.eliazavatta.scadenzario.ShareExtension` |
| App Group sui tre target | `group.com.eliazavatta.scadenzario` |
| Runner | Sign in with Apple, Associated Domains, push |
| Associated Domains | `applinks:www.scadenzario.app`, `applinks:scadenzario.eliazavatta.it` |

Il nome target share è **ScadenzarioShareExtension**, non ShareExtension. Il Bundle ID termina invece con `.ShareExtension`. Gli entitlements sorgente push sono `development`: il runner li imposta a `production` nel solo checkout temporaneo e verifica il risultato firmato. Serve un profilo App Store coerente.

## 1. Dal Mac: dati e file da preparare

Passami il testo dei seguenti comandi e l'esito dell'ultima build iOS riuscita; non contengono password:

```bash
xcodebuild -version
xcode-select -p
flutter --version
pod --version
ruby --version
security find-identity -v -p codesigning
# Dalla cartella Scadenzario:
git rev-parse HEAD
git status --short
xcodebuild -list -project ios/Runner.xcodeproj
```

Indica quale commit è stato provato su iPhone e quale vuoi autorizzare nel runner. Modifiche solo locali sul Mac devono essere revisionate e committate prima: il cloud compila lo SHA remoto, non la cartella del Mac. Non passare dump completi di Keychain, `.env`, DerivedData o `xcodebuild -showBuildSettings` senza revisarli.

Per il certificato Apple Distribution esistente: apri **Accesso Portachiavi → I miei certificati**, espandi la voce e verifica che includa **la chiave privata**. Esporta certificato e chiave privata come `.p12` protetto da password. Un `.cer` da solo non basta. Servono anche i tre profili **App Store Connect** `.mobileprovision` dei Bundle ID sopra, tutti collegati al certificato valido e allo stesso Team.

**Non incollare qui `.p12`, password o chiavi private.** Conserva i file in una posizione protetta sul Mac per il bootstrap Match, con backup cifrato. Passami soltanto conferma della presenza, scadenza e percorso locale. La password Match e quella `.p12` si impostano fuori dal repository. Non revocare certificati esistenti e non usare `match nuke`.

## 2. Dal portale Apple Developer

In **Certificates, Identifiers & Profiles**, conferma:

- membership attiva e Team ID corretto;
- i tre App ID espliciti, con App Group condiviso configurato;
- sul Runner: Push Notifications, Sign in with Apple e Associated Domains;
- certificato Distribution valido con chiave privata disponibile sul Mac;
- tre profili App Store validi, ricreati solo se necessario dopo variazioni capability.

Passami nomi e scadenze di certificato/profili e conferma delle capability. Se una capability manca, va abilitata e il profilo rigenerato. Non serve registrare UDID per i profili App Store/TestFlight.

## 3. Da App Store Connect

In **Le mie app → Scadenzario → Informazioni app**, passami l'**Apple ID numerico** e conferma il Bundle ID. In TestFlight indica l'ultima coppia versione/build, eventuali build ancora processing e stato export compliance. Il codice interroga comunque Apple prima di scegliere il numero successivo.

In **Utenti e accesso → Integrazioni → API App Store Connect**: verifica se la Team Key già usata da OpenFindability ha accesso all'app e ruolo adeguato all'upload (App Manager è la scelta pratica da verificare con l'amministratore). Servono **Key ID**, **Issuer ID** e file `.p8` originale. Apple consente di scaricare la privata una sola volta. Questa non è la chiave Sign in with Apple usata da Firebase.

Passami Key ID/Issuer ID e il percorso del `.p8`, oppure conferma che la chiave locale configurata è quella giusta. Il contenuto privato va direttamente in GitHub Secret `ASC_KEY_CONTENT` (PEM completo multilinea, non base64) e non in chat. Conferma anche accordi Apple accettati e quale gruppo tester interno useremo. La pipeline non pubblica sull'App Store e non invita automaticamente tester esterni.

## 4. GitHub: setup una volta sola

Creare due repository **privati**:

1. `eliazv/mobile-release-runner`: copiare il pacchetto runner alla radice, spostando lo YAML in `.github/workflows/release-ios.yml`, sul default branch `main`.
2. Un deposito firme, ad esempio `eliazv/mobile-signing`: archiviazione cifrata Fastlane Match; scrittura solo nel bootstrap controllato sul Mac, sola lettura in CI.

Nel runner creare Environment **`ios-release`**, limitato al default branch. Configurare:

| Tipo | Nome | Contenuto |
| --- | --- | --- |
| Secret | `SOURCE_APP_ID` | ID della GitHub App per checkout |
| Secret | `SOURCE_APP_PRIVATE_KEY` | PEM della GitHub App |
| Secret | `ASC_KEY_ID` | ID chiave Apple |
| Secret | `ASC_ISSUER_ID` | Issuer Apple |
| Secret | `ASC_KEY_CONTENT` | `.p8` completo |
| Secret | `MATCH_PASSWORD` | password cifratura deposito Match |
| Secret | `MATCH_GIT_BASIC_AUTHORIZATION` | base64 di `utente:token`, token read-only sul solo deposito firme |
| Variable | `MATCH_GIT_URL` | URL HTTPS del deposito privato Match |

La GitHub App deve avere **Contents: read**, installata solo sui repository sorgenti abilitati. Il token locale `OPENFINDABILITY_RELEASE_RUNNER_TOKEN` è distinto: fine-grained, **Actions: write** e Metadata read sul solo repository runner; salvarlo nella `.env` locale. Non serve dare al runner scrittura sui repository delle app.

Prima di abilitare firma: sul Mac risolvere e committare `Gemfile.lock`, fissare le action ancora a tag a SHA revisionati, verificare disponibilità dell'Xcode scelto nell'immagine `macos-15`, costo/quote GitHub e accessi ai due repository. Flutter `3.47.6` nel template viene dal piano: va confermato con la toolchain realmente usata. L'Environment con reviewer è opzionale e dipende dal piano GitHub; allowlist privata e SHA approvati restano obbligatori.

## 5. Bootstrap Match dal Mac

Dal repository runner privato, dopo `bundle install`, usare `bundle exec fastlane match import --type appstore` seguendo i prompt per importare `.p12`, eventuale `.cer` richiesto e profili esistenti. Ripetere per tutti i profili. Impostare deposito Git privato e Team corretti: la credenziale di bootstrap deve poter scrivere nel deposito. Non salvare password nei comandi committati o nella history.

Verificare poi la lettura con `bundle exec fastlane match appstore --readonly --app_identifier com.eliazavatta.scadenzario,com.eliazavatta.scadenzario.ScadenzarioWidget,com.eliazavatta.scadenzario.ShareExtension --team_id TP72E87G5R`. Match richiede auth e configurazione del deposito: completarle tramite variabili sicure o prompt. La CI non crea né ripara profili.

## 6. Attivazione da Windows

Usare Node 24 (indicato in `.node-version` e `package.json`). Dopo un cambio runtime eseguire `pnpm rebuild better-sqlite3`: il progetto autorizza esplicitamente questo script nativo. Il backup reale ? stato eseguito e verificato dopo la correzione. Continuare a eseguire `pnpm run db:backup` prima di modifiche rischiose: le migrazioni si applicano automaticamente aprendo lo store.

Creare `secrets/ios/scadenzario.json` con questa configurazione, sostituendo `123` con l'Apple ID reale:

```json
{
  "repository": "eliazv/scadenziario",
  "appId": 123,
  "teamId": "TP72E87G5R",
  "bundleIds": ["com.eliazavatta.scadenzario", "com.eliazavatta.scadenzario.ScadenzarioWidget", "com.eliazavatta.scadenzario.ShareExtension"],
  "framework": "flutter"
}
```

```powershell
npx tsx scripts/update-project.ts --slug scadenzario --ios-config secrets/ios/scadenzario.json --app-store-track-id <APPLE_ID>
# .env: OPENFINDABILITY_RELEASE_RUNNER_REPO, _REF, _TOKEN + credenziali ASC già supportate
npx tsx scripts/release.ts ios --slug scadenzario --sha <SHA_40_CARATTERI> --build-name <X.Y.Z> --build-number auto
# Prima abilitare appId, Xcode, approvedShas ed enabled nel apps.json PRIVATO.
npx tsx scripts/release.ts ios --slug scadenzario --sha <SHA_40_CARATTERI> --build-name <X.Y.Z> --build --unsigned
# Poi, dopo bootstrap firma:
npx tsx scripts/release.ts ios --slug scadenzario --sha <SHA_40_CARATTERI> --build-name <X.Y.Z> --build
npx tsx scripts/release.ts ios --slug scadenzario --sha <SHA_40_CARATTERI> --build-name <X.Y.Z> --build-number auto --apply
npx tsx scripts/release.ts ios-status --slug scadenzario
```

I segnaposto `<...>` vanno sostituiti, non sono comandi da copiare letteralmente. Il preflight richiede credenziali Apple read-only ma non il token runner. `--build` avvia un job remoto con costi GitHub; `--apply` autorizza anche l'upload TestFlight. Usare una richiesta per app alla volta. In caso di timeout non ripetere il dispatch prima di aver cercato il correlation ID nelle run.

## 7. Criteri per dichiarare il setup finito

Build unsigned riuscita → IPA firmato con tutti e tre i Bundle ID e versioni coerenti → upload confermato → build esatta `VALID` in ASC → export compliance risolta e disponibile al gruppo interno → installazione iPhone e prova login Apple/Google, RevenueCat/IAP, push, widget, Share Extension. Lo storico iniziale conserva dispatch e correlation ID; `ios-status` legge run GitHub e build Apple live, senza fingere che dispatch accettato significhi build processata. Non è ancora una dashboard release o un reconciler automatico degli stati.

## Risposta minima da passarmi

1. Output toolchain Mac e SHA remoto da autorizzare.
2. Apple ID app, conferma Team/capability e ultima versione/build TestFlight.
3. Presenza e scadenze `.p12` con chiave privata + tre profili; percorso protetto sul Mac.
4. Key ID/Issuer ID e conferma disponibilità `.p8` (contenuto privato solo nei secrets).
5. URL runner privato e deposito Match, GitHub App installata, secrets configurati.

Riferimenti ufficiali: [dispatch GitHub](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event), [Fastlane Match](https://docs.fastlane.tools/actions/match/), [upload TestFlight](https://docs.fastlane.tools/actions/pilot/), [build Apple](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-builds).
