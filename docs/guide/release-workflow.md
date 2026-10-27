# Release Android — pubblicare un'app Flutter su Google Play

OpenFindability compila un progetto Flutter, verifica la firma dell'AAB e lo carica su un track di
Google Play. Fastlane non serve e le credenziali Play non vanno copiate nei singoli progetti: si
riusa il service account già configurato qui (`GOOGLE_SERVICE_ACCOUNT_FILE` o
`GOOGLE_SERVICE_ACCOUNT_JSON`, API Android Publisher).

Per iOS sono ora preparati CLI e pacchetto runner centrale privato. Vedere [Setup release iOS e dati necessari da Mac/Apple](ios-release-setup-handoff.md). Build e firma richiedono il completamento del setup e una verifica macOS.

Indice:

- [Se sei un agente in un altro repo](#se-sei-un-agente-in-un-altro-repo)
- [Configurazione iniziale di un'app](#configurazione-iniziale-di-unapp)
- [Comandi](#comandi)
- [Version code](#version-code)
- [Firma](#firma)
- [Cosa succede su Play](#cosa-succede-su-play)
- [Storico dei rilasci](#storico-dei-rilasci)
- [Errori frequenti](#errori-frequenti)
- [Come funziona](#come-funziona)
- [Limiti noti](#limiti-noti)

## Se sei un agente in un altro repo

L'utente ti ha chiesto di pubblicare l'app del repo in cui stai lavorando. Segui questi passi.

1. Esegui i comandi **con la cartella di OpenFindability come directory di lavoro** e passa il repo
   dell'app con `--path`. Gli import `@/`, il file `.env` e il database si risolvono dalla cartella
   di OpenFindability: lanciato da un'altra directory lo script non parte.
2. Usa `npx tsx scripts/release.ts ...` e non `pnpm run ... --`. Su Windows e PowerShell il
   passthrough di pnpm rovina il quoting degli argomenti.
3. Parti sempre dal preflight, cioè senza `--build` né `--apply`. Non compila e non carica nulla.
4. Usa `--apply` solo se l'utente ha chiesto esplicitamente di pubblicare, e sul track che ha
   indicato. Senza indicazioni il track è `internal`. `--track production` raggiunge gli utenti
   reali: non sceglierlo di tua iniziativa.
5. Se il preflight segnala un version code già usato, proponi `--build-number auto` oppure un bump
   di `pubspec.yaml`, e chiedi all'utente quale preferisce prima di procedere.
6. Alla fine riporta version code, track e firmatario stampati dallo script. Se qualcosa fallisce,
   riporta il messaggio di errore così com'è.

```bash
cd <cartella OpenFindability>

# 1. Cosa c'è ora su Play
npx tsx scripts/release.ts status --path <repo dell'app>

# 2. Preflight: package, firma, version code. Non scrive nulla.
npx tsx scripts/release.ts android --path <repo dell'app> --track internal

# 3. Build, upload e commit sul track
npx tsx scripts/release.ts android --path <repo dell'app> --track internal --apply
```

Lo script riconosce il progetto dall'`applicationId` in `android/app/build.gradle(.kts)`, che deve
coincidere con il `playConsolePackageName` di un progetto OpenFindability. Se nessun progetto
coincide, vedi [Configurazione iniziale di un'app](#configurazione-iniziale-di-unapp).

La build dura alcuni minuti (circa cinque per un'app di medie dimensioni). Lancia il comando con un
timeout adeguato e non interromperlo.

## Configurazione iniziale di un'app

Da fare una volta per ogni app.

1. **Il progetto deve esistere in OpenFindability con il package Play.** `pnpm run discover:apps`
   crea i progetti mancanti a partire dalle app visibili al service account. In alternativa:

   ```bash
   pnpm run project:update -- --slug <slug> --play-console com.example.app
   ```

2. **Il service account deve poter rilasciare l'app.** In Play Console: Utenti e autorizzazioni →
   il service account → accesso all'app → autorizzazioni di rilascio (track di test e, se serve,
   produzione). Il permesso che basta per leggere le recensioni non basta per caricare un bundle.

3. **L'app deve già esistere su Play.** L'API non crea app nuove, e il primo bundle di un'app va
   caricato a mano da Play Console.

4. **La firma release deve essere configurata.** Vedi [Firma](#firma). Il template Flutter firma
   le build release con la chiave di debug finché non lo cambi, e Play rifiuta quei bundle.

5. **Facoltativo: salva il percorso del progetto Flutter**, così in seguito basta `--slug`:

   ```bash
   pnpm run project:update -- --slug <slug> --flutter-path C:/percorso/dell/app
   ```

Servono inoltre `flutter` e un JDK (per `keytool`) nel PATH della macchina.

## Comandi

### `release:status`

```bash
npx tsx scripts/release.ts status --slug <slug>
npx tsx scripts/release.ts status --path <repo dell'app>
```

Elenca i track dell'app con nome del rilascio, version code, stato e percentuale di rollout. È di
sola lettura.

```txt
Play tracks for "scadenzario" (com.eliazavatta.scadenzario):

  production: 1.20.6 — codes 97 — completed
  beta: (unnamed) — codes - — draft
  alpha: 77 (1.18.0) — codes 77 — completed
  internal: (unnamed) — codes - — draft
```

### `release:android`

```bash
npx tsx scripts/release.ts android (--slug <slug> | --path <dir>) [opzioni] [--build | --apply]
```

Le tre modalità:

| Flag | Cosa fa | Scrive qualcosa? |
|------|---------|------------------|
| (nessuno) | Preflight: legge `pubspec.yaml` e Gradle, legge i track da Play, controlla il version code. | No |
| `--build` | Preflight, poi `flutter build appbundle --release` e verifica della firma. | Solo l'AAB in `build/` dell'app |
| `--apply` | Come `--build`, poi upload dell'AAB, assegnazione al track e commit. | Sì, su Play |

Le opzioni:

| Opzione | Note |
|---------|------|
| `--path <dir>` | Root del progetto Flutter. Se omesso si usa il `flutterProjectPath` salvato sul progetto. |
| `--slug <slug>` | Progetto OpenFindability. Facoltativo quando `--path` basta a riconoscerlo. |
| `--track <nome>` | `internal` (default), `alpha`, `beta`, `production` o il nome di un track di test chiuso. |
| `--build-number <n\|auto>` | Version code. `auto` usa il più alto presente su Play più uno. Default: quello di `pubspec.yaml`. |
| `--build-name 1.2.3` | Version name. Default: quello di `pubspec.yaml`. |
| `--flavor <nome>` | Flavor Flutter. |
| `--aab <file>` | Salta la build e usa un bundle già pronto, per esempio quello di un `--build` precedente. |
| `--notes "..."` | Novità della versione, massimo 500 caratteri. |
| `--notes-file <file>` | Come `--notes`, letto da file. Da preferire per testi con spazi o a capo. |
| `--notes-language it-IT` | Locale Play completo: `it-IT`, non `it`. Default `it-IT`. |
| `--status <stato>` | `completed` (default), `draft`, `inProgress`, `halted`. |
| `--rollout 0.2` | Rilascio graduale al 20%. Implica `inProgress`. |

Esempio di preflight:

```txt
Release (preflight only) for "scadenzario":

  package:      com.eliazavatta.scadenzario
  version:      1.20.6 (code 98)
  highest live: 97
  track:        internal (completed)
  signing:      Flutter project's own Gradle config

Preflight only — nothing was built or uploaded. Re-run with --build to build, or --apply to build and publish.
```

Esempi d'uso:

```bash
# Test interno, version code calcolato da Play
npx tsx scripts/release.ts android --slug scadenzario --build-number auto --apply

# Produzione al 20% con note di rilascio
npx tsx scripts/release.ts android --slug scadenzario --track production --rollout 0.2 \
  --notes-file novita.txt --apply

# Compilare e controllare ora, caricare dopo lo stesso bundle
npx tsx scripts/release.ts android --slug scadenzario --build
npx tsx scripts/release.ts android --slug scadenzario \
  --aab C:/percorso/app/build/app/outputs/bundle/release/app-release.aab --apply
```

Gli script `pnpm run release:status` e `pnpm run release:android` sono equivalenti, con il limite
di quoting su Windows descritto sopra.

## Version code

Play rifiuta un version code che non supera quelli già caricati. Il preflight legge il codice più
alto presente su tutti i track e si ferma prima della build se quello di `pubspec.yaml` (o di
`--build-number`) non lo supera.

`--build-number` e `--build-name` vengono passati a `flutter build` e **non modificano
`pubspec.yaml`**. Dopo un rilascio con `auto`, allinea il pubspec a mano, altrimenti il prossimo
rilascio senza `auto` riparte dal numero vecchio e viene bloccato dal preflight.

Con `--aab` il controllo non si applica: il version code è dentro il bundle e lo comunica Play al
momento dell'upload.

## Firma

Lo script sceglie la firma in quest'ordine.

1. **Centrale.** Se esiste `secrets/android/<slug>/key.properties`, quel keystore viene usato per
   la build al posto di qualunque configurazione del progetto. Il formato è quello di Flutter:

   ```properties
   storePassword=...
   keyPassword=...
   keyAlias=upload
   storeFile=upload-keystore.jks
   ```

   `storeFile` è relativo al file stesso, quindi il `.jks` sta nella stessa cartella:

   ```txt
   secrets/android/<slug>/key.properties
   secrets/android/<slug>/upload-keystore.jks
   ```

   Il progetto dell'app non richiede modifiche a Gradle. I valori non possono contenere `"` o `%`.

2. **Del progetto.** Se quel file non esiste vale la firma dichiarata nel Gradle dell'app
   (`android/key.properties` e simili).

Dopo la build, e anche con `--aab`, il bundle viene controllato con `keytool -printcert -jarfile`:

- se è firmato con la chiave di debug Android, lo script si ferma senza caricare nulla;
- se la firma centrale è configurata e il certificato del bundle non corrisponde a quel keystore
  (confronto delle impronte SHA-256), lo script si ferma senza caricare nulla;
- se `keytool` non è disponibile compare un avviso e la verifica viene saltata.

Il keystore deve essere quello registrato come upload key dell'app in Play Console. Una chiave
diversa passa i controlli locali ma viene rifiutata da Play all'upload.

`secrets/` è ignorata da git. Conserva una copia dei keystore fuori dal PC: vedi
[`docs/operations/sensitive-files.md`](../operations/sensitive-files.md).

## Cosa succede su Play

- Niente è pubblicato finché l'ultimo passaggio, il commit, non riesce. Un errore durante upload o
  assegnazione al track lascia solo una sessione di modifica abbandonata, che scade da sola.
- `completed` mette il rilascio a disposizione di tutti gli utenti del track. Su `internal` è
  disponibile ai tester in pochi minuti. Su `production` passa prima dalla revisione di Google.
- `draft` carica il bundle e prepara il rilascio senza inviarlo: va completato da Play Console.
  È l'unico stato accettato da un'app mai pubblicata.
- `--rollout` avvia un rilascio graduale. Per aumentare la percentuale o completarlo usa Play
  Console: lo script non gestisce l'avanzamento di un rollout già avviato.

## Storico dei rilasci

Ogni esecuzione con `--build` o `--apply` aggiunge una riga a `connectorRuns` con
`source: "play_release"`. In `stats` trovi modalità, track, stato, version name, version code,
esito dell'upload e la risposta grezza di Play. Anche i fallimenti vengono registrati, con il
messaggio di errore. Il preflight non registra nulla.

Per consultarlo: `pnpm run db:studio`, tabella `connector_runs`, filtro `source = play_release`.

## Errori frequenti

| Messaggio | Causa e rimedio |
|-----------|-----------------|
| `No project has playConsolePackageName "..."` | Nessun progetto ha quel package. Passa `--slug` o configura il package con `project:update --play-console`. |
| `applicationId is "X" but the project's Play package is "Y"` | `--path` punta all'app sbagliata, oppure il package sul progetto è errato. Con `--flavor` diventa solo un avviso. |
| `Version code N is not higher than M` | Codice già usato su Play. Usa `--build-number auto` o aggiorna `pubspec.yaml`. |
| `pubspec.yaml has no build number` | La riga `version:` non ha la parte `+N`. Aggiungila o passa `--build-number`. |
| `is signed with the Android debug key` | La build release usa la firma di debug. Configura la firma centrale o quella del progetto. |
| `not by the central keystore` | Il bundle non è firmato dal keystore in `secrets/android/<slug>/`. Con `--aab` significa che il bundle è stato prodotto con un'altra chiave. |
| `key.properties is missing: ...` | Mancano campi nel file di firma centrale. |
| `Could not start flutter` | `flutter` non è nel PATH. |
| HTTP 403 da Play | Il service account non ha i permessi di rilascio su quell'app. |
| HTTP 404 da Play | Il package non esiste su Play, o il service account non vede l'app. |
| `Only releases with status draft may be created on draft app` | App mai pubblicata: usa `--status draft`. |

## Come funziona

- `lib/release.ts` contiene la pipeline: lettura di `pubspec.yaml` e Gradle, preflight, build,
  verifica della firma, upload. Non importa il database, così resta richiamabile da qualunque
  contesto.
- `scripts/release.ts` è la CLI: risolve il progetto, stampa il riepilogo e registra l'esecuzione
  in `connectorRuns`.
- `lib/connectors/play-console.ts` espone `getPlayTracks` e `uploadPlayBundle`, che usano le
  `edits` dell'API Android Publisher: `edits.insert` → `edits.bundles.upload` →
  `edits.tracks.update` → `edits.commit`.
- La firma centrale usa le proprietà `android.injected.signing.*` dell'Android Gradle Plugin, che
  sostituiscono la firma di ogni variante. Vengono passate come `-Dorg.gradle.project.*` nella
  variabile `GRADLE_OPTS`. La strada più ovvia, le variabili `ORG_GRADLE_PROJECT_*`, funziona con
  `gradlew` ma non attraverso `flutter build` su Windows: Dart converte in maiuscolo i nomi delle
  variabili d'ambiente e Gradle distingue maiuscole e minuscole, quindi la proprietà si perde
  senza alcun errore. Per questo la firma del bundle viene sempre riverificata dopo la build.

## Limiti noti

- **L'upload non è ancora stato eseguito su un'app reale.** Stato dei track, preflight, build con
  firma centrale e verifica della firma sono stati provati su Scadenzario. Il primo `--apply`
  conviene farlo su `internal`.
- Solo Android e solo progetti Flutter.
- Nessuna sezione Release nella dashboard: lo storico si legge da `connectorRuns`.
- Nessun avanzamento o arresto di un rollout già avviato, e nessuna promozione di un rilascio da
  un track all'altro: si fanno da Play Console.
- Le note di rilascio si caricano in una sola lingua per esecuzione.
- `pubspec.yaml` non viene mai aggiornato dallo script.
