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

`apps.json` contiene solo esempi fittizi disabilitati. Salvare il mapping reale in una posizione privata e nel repository runner privato. `requiredEntitlements` è la policy per ogni bundle firmato; `targets` mappa nomi Xcode ai Bundle ID. Il runner imposta push a `production` soltanto nel checkout effimero. Non richiama il Fastfile delle app e non crea workflow al loro interno.

Flutter: `workingDirectory` supporta app in sottocartelle; `pubspec.lock` e `ios/Podfile.lock` devono essere committati. Il builder mantiene Pods e workaround del sorgente approvato. Al momento supporta scheme Runner senza flavor.

Capacitor: `framework: capacitor`, `nodeVersion` fissata, `webBuildScript` (default `build`), `xcodeProject` e `workspace` (default `ios/App/App.*`), scheme e target reali. Richiede `package-lock.json` e Podfile.lock committati. Esegue `npm ci`, script web, `npx --no-install cap sync ios --deployment`, poi archive/export Xcode. Versione e build richieste vengono applicate ai target nel checkout temporaneo dopo gli eventuali script di versione dell'app. Se la build web richiede variabili o asset privati, configurarli nel runner prima della prova; non vengono inventati dal builder. SPM senza Pods non è ancora supportato.

Per usare un solo repository privato, Match può usare un branch `signing` separato dallo stato del runner su `main`: impostare `MATCH_GIT_URL` al repository runner e `MATCH_GIT_BRANCH=signing`. Quel branch va inizializzato come deposito Match, senza workflow o codice runner. Il clone diretto del branch evita di leggere il default branch come deposito firme. In alternativa usare un deposito firme distinto; i branch non costituiscono separazione dei permessi.

Le build delle app eseguono codice: gli SHA in `approvedShas` devono essere revisionati. I segreti Apple sono visibili solo nello step di firma, che esegue comunque codice dell'app. Usare runner GitHub effimeri, mai riutilizzare questa procedura direttamente su un Mac personale persistente. Una GitHub App distinta legge solo i repo sorgenti; Match usa una credenziale di sola lettura sul proprio deposito cifrato.

Il gruppo concurrency per slug non interrompe la run attiva. GitHub mantiene una sola run pending per gruppo e può sostituire una pending precedente: inviare una richiesta per app alla volta e controllare lo stato prima di ripetere. Anche il numero build è ricontrollato lato Apple prima di upload; publisher esterni al runner devono essere coordinati.

Artifact: solo `output/`, conservato per tre giorni. `release.json` distingue `built_unsigned`, `built`, `uploaded_processing_unconfirmed`. Nessun log di firma, archivio Xcode o profilo viene caricato come artifact. Un errore di upload può avere esito ambiguo: controllare ASC prima di ritentare. La disponibilità ai tester e l'export compliance restano verifiche Apple separate.

Verifica offline della policy: `python -m unittest discover -s integrations/ios-release-runner -p test_validate.py` da OpenFindability; `python -m unittest test_validate.py` dal repo runner.

Verifica offline della preparazione dei builder senza Xcode/Fastlane: `ruby integrations/ios-release-runner/test_builders.rb`. Controlla lockfile, cartelle di lavoro, comandi Flutter/Capacitor e override della versione nativa dopo la build web; non sostituisce una build su Mac.

Il pacchetto e i builder Flutter/Capacitor sono verificati offline su Windows. La compilazione Xcode, la risoluzione Gemfile.lock, la firma e i comportamenti nativi richiedono una prova macOS per ogni app. Un backend Mac/SSH senza GitHub rimane un'estensione futura.
