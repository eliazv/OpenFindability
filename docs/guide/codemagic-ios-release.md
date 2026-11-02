# Rilasci iOS da OpenFindability con Codemagic

Stato: **integrazione pronta, firma e upload non ancora provati su una build reale**. Tutto parte da OpenFindability: nessun repository aggiuntivo, nessun file nei repository delle app, nessun Mac e nessun deposito Match. iOS richiede macOS, quindi la compilazione gira su Codemagic. Un dispatch accettato NON significa IPA caricato su TestFlight.

Provider predefinito di `release.ts ios`: Codemagic. `--provider github` resta disponibile solo se scelto esplicitamente, con la procedura di [questa guida](ios-release-setup-handoff.md).

## Setup una tantum

1. Su Codemagic esiste **una sola applicazione**, collegata a OpenFindability, senza webhook: legge `codemagic.yaml` dalla radice del repository. Le applicazioni collegate ai repository delle singole app non vengono usate.
2. Nel `.env` locale, oltre ai valori App Store Connect già presenti:

   ```dotenv
   CODEMAGIC_API_TOKEN=
   CODEMAGIC_RUNNER_APP_ID=      # ID dell'applicazione collegata a OpenFindability
   CODEMAGIC_RUNNER_BRANCH=master
   CODEMAGIC_INSTANCE_TYPE=mac_mini_m2
   ```

3. `gh` deve essere autenticato con accesso admin ai repository delle app.

Tutto il resto lo fa `ios-setup --apply`. La chiave App Store Connect deve avere il ruolo App Manager o superiore, perché crea certificati e profili.

Apple consente al massimo 3 certificati Distribution. Se il limite è raggiunto e nessuno corrisponde alla chiave, la build fallisce: libera un posto dal portale Apple solo dopo aver verificato che quel certificato non serve. OpenFindability non revoca nulla.

## Aggiungere un'app

L'app deve esistere su App Store Connect e avere un progetto OpenFindability con `appStoreTrackId` (altrimenti `project:add`, o `--slug` per scegliere il progetto).

```powershell
npx tsx scripts/release.ts ios-setup --path C:\percorso\app          # mostra i valori letti
npx tsx scripts/release.ts ios-setup --path C:\percorso\app --apply  # li salva nel database locale
```

Con `--apply` il comando salva la configurazione e aggiunge solo ciò che manca: sul repository dell'app una deploy key **in sola lettura**, e su Codemagic la relativa variabile `SOURCE_KEY_<SLUG>` nel gruppo `ios_source` e, la prima volta, le credenziali Apple nel gruppo `ios_signing`. La chiave del certificato viene generata in `secrets/appstoreconnect/ios_distribution_private_key`: non cambiarla, perché il certificato su Apple corrisponde a quella. I valori sono caricati come Secret e mai stampati. Per sostituire un valore, elimina la variabile su Codemagic e rilancia il comando.

Il comando legge dalla cartella, senza eseguire codice dell'app: repository, Team ID, target, bundle ID ed entitlement. Trova l'Apple ID su App Store Connect. Le versioni arrivano da `.fvmrc`, `.nvmrc` e dai workflow del repository; per Flutter ha la precedenza sui workflow l'SDK di questo PC, se soddisfa il `pubspec.lock` committato, perché la build impone quel lockfile. **Controlla le versioni**: se sono sbagliate correggile con `--xcode`, `--flutter`, `--node` (e `--web-script` per Capacitor). Rilancia il comando quando cambi capability, target o estensioni.

## Rilasciare

```powershell
# Solo piano: nessun build e nessun minuto consumato.
npx tsx scripts/release.ts ios --path C:\percorso\app

# Compila senza firma.
npx tsx scripts/release.ts ios --path C:\percorso\app --build --unsigned

# IPA firmato, scaricabile da Codemagic, senza upload.
npx tsx scripts/release.ts ios --path C:\percorso\app --build

# IPA firmato e upload su TestFlight. Nessun invio in revisione.
npx tsx scripts/release.ts ios --path C:\percorso\app --build --apply --wait

# Stato Apple e Codemagic; annullamento (solo con --apply).
npx tsx scripts/release.ts ios-status --path C:\percorso\app --build-id <id>
npx tsx scripts/release.ts ios-cancel --path C:\percorso\app --build-id <id> [--apply]
```

Con `--path` la CLI usa l'ultimo commit del branch corrente e si ferma se ci sono modifiche non committate o il branch non coincide con GitHub. La versione viene da `pubspec.yaml` (Flutter) o dal progetto Xcode (Capacitor) e il build number è il successivo a quelli su App Store Connect. `--sha`, `--build-name` e `--build-number` li sostituiscono. La build usa sempre il commit su GitHub, mai i file locali.

Se il `Podfile.lock` è più vecchio di `pubspec.lock` o `package-lock.json`, caso normale quando si sviluppa da Windows, il piano lo segnala e Codemagic risolve di nuovo i pod invece di fermarsi. `--refresh-pods` forza lo stesso comportamento. Il nuovo `Podfile.lock` è un artefatto della build: committalo nel repository dell'app per fissare quelle versioni. I pod nativi possono quindi differire da quelli dell'ultima build, perciò prova l'app su TestFlight.

`--wait` attende la fine della build, fino a due ore, e restituisce un errore se non termina con successo. In caso di fallimento stampa il passaggio fallito e le righe di errore del log. Interrompere l'attesa non ferma la build.

## Cosa significano i risultati

- `dispatch_accepted` + `buildId`: Codemagic ha accettato il job, niente di più. Dopo un timeout **non ripetere** il comando senza controllare Codemagic: il job potrebbe esistere già.
- Artefatti: `unsigned-app.zip` oppure `release.ipa`, più `release.json` con SHA, versione, build e correlation ID.
- Un'app è su TestFlight solo quando la build esatta risulta `VALID` su App Store Connect. Prima di una release pubblica restano metadata, compliance, scelta della build e richiesta di revisione.
- In `connectorRuns` il tentativo risulta `partial` con `state=dispatching`; solo `dispatch_accepted` conta come successo.

## Primo collaudo

1. Build senza firma di un'app Flutter, poi di una Capacitor.
2. IPA firmato dell'app con più estensioni, poi upload su TestFlight con un build number nuovo.
3. Prova sul dispositivo: login, push, acquisti e funzioni native.

Il piano gratuito include 500 minuti M2 al mese e una build alla volta, condivisi tra tutte le app. Lancia un dispatch per app alla volta. Ogni workflow conserva la cache di pod, pacchetti Dart e gem, quindi le build successive alla prima sono più rapide. Per risparmiare minuti, il preflight controlla prima il `pubspec.lock` quando questo PC ha la stessa versione di Flutter della build.

## Limiti e rischi noti

- **Approvazione:** il comando di rilascio è l'approvazione. Chi possiede `CODEMAGIC_API_TOKEN` può avviare una build firmata di qualunque commit delle app configurate: tieni il token solo nel `.env`.
- **Segreti in build:** il codice dell'app e le sue dipendenze girano con le credenziali Apple e le deploy key in sola lettura di tutte le app nell'ambiente. Rilascia solo commit che hai revisionato.
- **Branch del runner:** chi può pushare sul branch indicato da `CODEMAGIC_RUNNER_BRANCH` controlla `codemagic.yaml` e quindi i segreti: proteggilo.
- **Da confermare con la prima build:** `fetch-signing-files` con più estensioni, Ruby 4 con il `Gemfile.lock` generato su Windows, `node` in `softwareVersions` (non documentato dall'API) e le versioni Flutter senza prefisso `v`. Se una versione viene ignorata, il controllo toolchain ferma la build prima della firma.
- **Non supportati senza adattamenti:** flavor Flutter e Capacitor con solo SPM. Android resta nella pipeline esistente.

Documentazione ufficiale:
- https://docs.codemagic.io/rest-api/builds/
- https://docs.codemagic.io/yaml-code-signing/alternative-code-signing-methods/
- https://docs.codemagic.io/yaml-code-signing/signing-ios/
