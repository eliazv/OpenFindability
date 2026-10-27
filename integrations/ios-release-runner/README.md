# Runner iOS centrale privato

Pacchetto da copiare alla radice di un repository GitHub **privato** dedicato.
Spostare soltanto `release-ios.yml` in `.github/workflows/release-ios.yml`.
Il workflow non deve essere attivato nel repository pubblico OpenFindability.

1. Completare [il documento di consegna](../../docs/guide/ios-release-setup-handoff.md).
2. Compilare `appId`, versione Xcode e SHA approvato in `apps.json`; verificare Flutter e impostare `enabled: true` solo dopo la revisione.
3. Creare Environment `ios-release`, limitato al default branch; impostare secrets e variabile Match come indicato nella guida. I reviewer dell'Environment sono opzionali secondo le funzionalità disponibili nel piano GitHub.
4. Prima esecuzione `mode=unsigned`; non richiede segreti Apple, richiede checkout via GitHub App.
5. Su Mac eseguire `bundle install`, verificare e committare `Gemfile.lock`. Le action sono fissate a SHA dei rispettivi repository; aggiornare questi riferimenti solo con una revisione esplicita. Il template usa macos-15: verificare che l'Xcode scelto sia disponibile sull'immagine.
6. Configurare Match sul Mac, importare certificato esistente e profili senza revocarli; CI usa soltanto `readonly: true`.
7. `mode=build` produce IPA firmato verificato; `mode=testflight` aggiunge upload senza submission/review o distribuzione esterna automatica.

`requiredEntitlements` è la policy per ogni bundle firmato; `targets` mappa nomi reali Xcode ai Bundle ID. Il runner corregge push a `production` soltanto nel checkout effimero. Non richiama il Fastfile delle app e non crea workflow al loro interno. Mantiene Pods e workaround nativi del sorgente approvato. Flutter `pubspec.lock` e `ios/Podfile.lock` devono essere committati; `pod install --deployment` rifiuta aggiornamenti della lockfile.

Le build delle app eseguono codice: gli SHA in `approvedShas` devono essere revisionati. I segreti Apple sono visibili solo nello step di firma, che esegue comunque codice dell'app. Usare runner GitHub effimeri, mai riutilizzare questa procedura direttamente su un Mac personale persistente. Una GitHub App distinta legge solo i repo sorgenti; Match usa una credenziale di sola lettura sul proprio deposito cifrato.

Il gruppo concurrency per slug non interrompe la run attiva. GitHub mantiene una sola run pending per gruppo e può sostituire una pending precedente: inviare una richiesta per app alla volta e controllare lo stato prima di ripetere. Anche il numero build è ricontrollato lato Apple prima di upload; publisher esterni al runner devono essere coordinati.

Artifact: solo `output/`, conservato per tre giorni. `release.json` distingue `built_unsigned`, `built`, `uploaded_processing_unconfirmed`. Nessun log di firma, archivio Xcode o profilo viene caricato come artifact. Un errore di upload può avere esito ambiguo: controllare ASC prima di ritentare. La disponibilità ai tester e l'export compliance restano verifiche Apple separate.

Verifica offline della policy: `python -m unittest discover -s integrations/ios-release-runner -p test_validate.py` da OpenFindability; `python -m unittest test_validate.py` dal repo runner.

Il pacchetto è preparato e verificato staticamente su Windows; la compilazione Xcode, la risoluzione Gemfile.lock e la firma richiedono la prima esecuzione macOS. Capacitor richiede un builder dedicato e viene rifiutato da questa versione.
