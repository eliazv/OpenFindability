# OpenFindability → Codemagic → App Store Connect (iOS)

Stato: **integrazione codice + template del runner predisposti, NON attivati su Codemagic**. Nessun token reale, certificato o build macOS viene creato dal repository pubblico. Serve un bootstrap una tantum con account Codemagic, repository runner privato e credenziali Apple. Un dispatch accettato NON significa IPA caricato su TestFlight.

## Obiettivo e provider

- Provider predefinito per `release.ts ios`: **Codemagic** (non usa GitHub Actions).
- `--provider github` mantiene il runner GitHub esistente solo quando scelto esplicitamente.
- Un solo repository runner **privato**, con `codemagic.yaml` alla radice, serve un numero configurabile di app Flutter e Capacitor; nessun workflow CI nei singoli repository.
- Le app sorgenti vengono lette dal repository + **SHA completo approvato** nell'`apps.json` privato. Nessun checkout di PR non revisionate.
- Modalità: solo preflight (zero minuti), build unsigned, IPA firmato, IPA firmato + **upload App Store Connect/TestFlight**. Nessuna submission per revisione App Store, distribuzione esterna o rollout di produzione automatici.
- In tutti i casi OpenFindability usa i propri controlli App Store Connect per verificare Bundle ID, app numerica e build number; GitHub Actions non viene chiamato dal provider Codemagic.

## 1. Preparare il repository runner privato

1. Crea un repository GitHub **privato** dedicato (ad es. `mobile-release-runner`). Copia il contenuto di `integrations/ios-release-runner/` nella sua **radice**: `codemagic.yaml`, `codemagic_runner.py`, `validate.py`, `verify_ipa.py`, `apps.json`, `Gemfile`, `fastlane/`, ecc. **Non** copiare i segreti o le identità reali nel repository pubblico.
2. Il template GitHub `release-ios.yml` è opzionale e non va installato in `.github/workflows` se vuoi evitare minuti GitHub. Il file `codemagic.yaml` deve stare alla radice e NON sotto `.github`.
3. Su un Mac con Ruby/Bundler, dal checkout privato genera e verifica `Gemfile.lock` (es. `bundle lock`) e committalo. Le build Codemagic rifiutano l'esecuzione se manca; non generarlo durante CI senza controllo.
4. Configura in `apps.json` ogni progetto: `enabled: true` solo dopo verifica, `repository`, `appId` numerico Apple, `teamId`, `bundleIds`, `framework`, `workingDirectory`, versioni esatte `flutterVersion` oppure `nodeVersion`, `xcodeVersion`, `scheme`, `targets`, `approvedShas`, `requiredEntitlements`. L'app deve avere progetto iOS, lockfile, scheme e profili coerenti.
5. Il runner riusa gli stessi builder Fastlane di GitHub: **Flutter** (`flutter pub get` con lockfile, Pods, build IPA); **Capacitor** (`npm ci`, script web, `cap sync ios --deployment`, Xcode). Alcune configurazioni speciali (flavor, SPM senza Pods, signing specifico, estensioni) richiedono un adattamento e test separati.

## 2. Attivare Codemagic una volta

1. Registra il repository runner privato in Codemagic, concedendogli accesso tramite GitHub. In Codemagic usa il progetto configurato con YAML. Non impostare webhook automatici nel runner: le build devono partire soltanto dalle API di OpenFindability o da un operatore consapevole.
2. Crea **due gruppi di variabili**, con accesso limitato **solo all'app runner**, tramite UI Codemagic:
   - `ios_source`: `SOURCE_READ_TOKEN`, segreto. Token GitHub fine-grained con **Contents: read** soltanto sui repository delle app autorizzate. Mai usare un PAT con scrittura/account completo; valuta una GitHub App se il numero di repo cresce.
   - `ios_signing`: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT` (contenuto chiave `.p8`), `MATCH_PASSWORD`, `MATCH_GIT_BASIC_AUTHORIZATION`, `MATCH_GIT_URL`, `MATCH_GIT_BRANCH`. Segna come segreti i valori sensibili; `MATCH_GIT_BASIC_AUTHORIZATION` è la stringa Base64 di `username:token` per un token **read-only** sul deposito cifrato Fastlane Match.
3. Se non hai già Match, trasferisci con cautela le identità Apple Distribution e i provisioning profile validi nel deposito Match cifrato; **non usare `match nuke`** e non revocare certificati funzionanti. Lo stesso repository privato runner può avere branch `signing` con deposito Match; un deposito distinto è preferibile per separare gli accessi. `MATCH_GIT_URL` deve puntare al repository giusto e `MATCH_GIT_BRANCH` normalmente è `signing`.
4. La chiave App Store Connect deve avere privilegi appropriati (di norma **App Manager**), l'app deve esistere nell'account Apple, e l'abbonamento Apple Developer deve essere attivo. Usa una chiave API **dedicata** a Codemagic ove possibile.
5. Recupera dal progetto Codemagic il suo **App ID di 24 caratteri**, e da Account settings un **API token**. Non inserirli nel codice o in `apps.json`.

### Perché ci sono due workflow?

`ios-central-unsigned` importa soltanto `ios_source`, quindi non può accedere alle credenziali Apple. `ios-central-signed` importa anche `ios_signing`. Il comando `codemagic_runner.py checkout --scope ...` confronta modalità e workflow, valida la policy privata, poi effettua il checkout della commit esatta via Git con GIT_ASKPASS (token non presente negli argomenti del processo). Prima della build verifica Xcode/Flutter/Node rispetto al pin approvato.

## 3. Configurazione locale OpenFindability

Aggiungi al tuo `.env` locale:

```dotenv
CODEMAGIC_API_TOKEN=                         # Account settings > API token, PRIVATO
CODEMAGIC_RUNNER_APP_ID=                      # ID app Codemagic del runner, 24 hex
CODEMAGIC_RUNNER_BRANCH=main                  # branch del runner con codemagic.yaml
CODEMAGIC_INSTANCE_TYPE=mac_mini_m2          # gratuito ove previsto; mac_mini_m4 solo con billing
```

Nessuna variabile `OPENFINDABILITY_RELEASE_RUNNER_*` è richiesta per Codemagic. OpenFindability **non** copia i segreti di firma sul provider tramite API: devono essere configurati nel runner Codemagic.

Ogni progetto OpenFindability richiede `iosReleaseConfig`. Esempio (file privato `secrets/ios/demo.json`, mai nel repository pubblico):

```json
{
  "repository": "owner/demo-app",
  "appId": 1234567890,
  "teamId": "ABCDEFGHIJ",
  "bundleIds": ["com.example.demo"],
  "framework": "flutter",
  "workingDirectory": ".",
  "flutterVersion": "3.38.0",
  "xcodeVersion": "26.6"
}
```

Per Capacitor sostituisci `framework` con `capacitor` e `flutterVersion` con `nodeVersion` (es. `24.20.0`). `xcodeVersion` e la versione del framework sono obbligatorie con Codemagic: senza, la CLI non avvia la build. Il file `apps.json` del runner include inoltre scheme, target, entitlement e allowlist SHA; deve essere coerente con la configurazione locale. Tieni una copia privata in `secrets/ios/runner-apps.json`: se esiste, preflight e build confrontano abilitazione, SHA, identità e versioni prima di avviare la macchina. La copia non sostituisce il controllo sul runner, che resta l'unico vincolante. Per sincronizzare il mapping locale:

```bash
npx tsx scripts/update-project.ts --slug demo --ios-config secrets/ios/demo.json
```

L'app deve avere anche `appStoreTrackId` numerico configurato e il Bundle ID su App Store Connect deve combaciare.

## 4. Comandi (dalla root di OpenFindability)

```bash
# Nessun dispatch, nessun consumo di minuti Codemagic.
npx tsx scripts/release.ts ios --slug demo --sha <40-char-approved-sha> --build-name 1.2.3 --build-number auto

# Compila su Codemagic senza firma.
npx tsx scripts/release.ts ios --slug demo --sha <40-char-approved-sha> --build-name 1.2.3 --build-number auto --build --unsigned

# IPA firmato scaricabile da Codemagic, NON caricato su Apple.
npx tsx scripts/release.ts ios --slug demo --sha <40-char-approved-sha> --build-name 1.2.3 --build-number auto --build

# Carica build firmata su App Store Connect / TestFlight (NO review/production).
npx tsx scripts/release.ts ios --slug demo --sha <40-char-approved-sha> --build-name 1.2.3 --build-number auto --build --apply

# Controlla sia lo stato Apple sia il job Codemagic tramite l'ID restituito.
npx tsx scripts/release.ts ios-status --slug demo --build-id <codemagic-build-id>

# Mostra il job; con --apply ne richiede l'annullamento.
npx tsx scripts/release.ts ios-cancel --slug demo --build-id <codemagic-build-id> [--apply]

# Alternativa ESPlicita che usa minuti GitHub Actions:
npx tsx scripts/release.ts ios --provider github --slug demo --sha <40-char-approved-sha> --build-name 1.2.3 --build
```

Se vuoi selezionare la directory sorgente, usa `--path C:/work/app`: serve a identificare l'app locale, **non** carica file non committati; la build remota usa lo SHA approvato da `apps.json`.

### Stati e risultati

- `dispatch_accepted` + `buildId`: Codemagic ha accettato il job; **non** significa compilazione completata, firma valida, upload Apple eseguito, build pronta in TestFlight o App Store pubblicato.
- Lo stato Codemagic si legge tramite `GET /builds/{buildId}`. La risposta API non viene considerata prova di elaborazione Apple. Non ripetere automaticamente una richiesta dopo timeout: il job potrebbe essere già stato creato e fatturato.
- `mode=unsigned` produce `output/unsigned-app.zip`; `mode=build` produce `output/release.ipa`; `mode=testflight` produce l'IPA e chiama Fastlane `upload_to_testflight`.
- Il runner genera anche `output/release.json` con SHA, versione, build e correlation ID. Codemagic pubblica soltanto questi artefatti, non certificati o log di firma.
- `--apply` **non** invia l'app alla revisione App Store; per una release pubblica completare metadata, screenshot, privacy, compliance, scelta della build e richiesta di review in App Store Connect.
- In `connectorRuns` vengono registrati `provider`, `correlationId`, `buildId`/dispatch, piano e stato. Il preflight non registra run.

## Verifiche e rollout consigliato

1. Esegui offline `pnpm run test:ios-release`, `python -m unittest discover -s integrations/ios-release-runner -p 'test_*.py'`, `ruby integrations/ios-release-runner/test_builders.rb`, `pnpm run typecheck`.
2. Valida `codemagic.yaml` con lo schema ufficiale Codemagic nel repo runner privato e verifica la compatibilità delle versioni Xcode/Flutter/Node disponibili sulle loro macchine.
3. Fai **una sola build unsigned** di una app Flutter. Dopo, una di Capacitor, quindi una IPA firmata e infine un upload TestFlight con un build number nuovo. Verifica firma, TestFlight, entitlements, notifiche push, login, IAP e altre funzioni native sul dispositivo reale.
4. Conferma `VALID` nella risposta Apple e disponibilità ai tester; controlla che le ore/mese Codemagic e le eventuali quote di billing siano adeguate.
5. Se una build fallisce o il risultato è ambiguo, cercala con il build ID e correlation ID prima di ritentare; non associare due job allo stesso numero di versione. Un dispatch per app alla volta.

## Limiti e rischi noti

- I file sono template pubblici: la prima firma e il primo upload Apple devono essere verificati su Mac/Codemagic con credenziali e app reali. Non è possibile completarli soltanto con commit GitHub.
- La policy `approvedShas` è una barriera di autorizzazione: il codice della commit approvata gira durante la build e può in linea di principio interagire con i segreti disponibili nel workflow signed. Revisionare commit e dipendenze e limitare i token.
- Le build Android rimangono nella pipeline esistente e non vengono spostate su Codemagic.
- Codemagic REST API è in evoluzione: i metodi del connettore sono isolati in `lib/connectors/codemagic.ts`. Verificare che il build ID e i campi della risposta rispettino il contratto al primo collaudo reale.
- La documentazione API mostra come esempi di `softwareVersions` solo `xcode` e `flutter` (con prefisso `v`), mentre il connettore invia anche `node` e versioni senza prefisso. Da confermare con la prima build Flutter e la prima Capacitor: se il valore viene ignorato, il controllo toolchain ferma la build prima della firma.
- Il lockfile Bundler, il repository runner, le credenziali e il primo ciclo macOS non sono stati generati o eseguiti automaticamente.

Documentazione ufficiale:
- https://docs.codemagic.io/rest-api/builds/
- https://docs.codemagic.io/yaml-basic-configuration/yaml-getting-started/
- https://docs.codemagic.io/integrations/fastlane-integration/
- https://docs.codemagic.io/yaml-publishing/app-store-connect/
