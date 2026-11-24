# Store Studio condiviso: piano

Data: 24/11/2026. Stato: motore condiviso e migrazione Azzurro implementati; caricamento sugli store rinviato.

Obiettivo: un solo strumento per creare gli screenshot degli store, usato da tutti i progetti. Lo strumento sta in OpenFindability; i set (slide, titoli, dati demo), i componenti specifici dell'app e gli export restano nel repo di ogni progetto.

## Verdetto

Fattibile e conveniente, **a condizione di separare motore e contenuto**. Spostare l'attuale `store/studio/` di Scadenzario in blocco è sconsigliato: oggi i due livelli sono mescolati.

Conviene davvero con almeno 2–3 app sugli store. Il grosso del lavoro per ogni app resta comunque ricostruire la sua interfaccia in HTML: si risparmia il motore, non le schermate.

## Situazione attuale (Scadenzario, `store/studio/`)

Circa 1.500 righe, zero dipendenze npm: Node + Chrome headless + server locale.

**Generico, da portare in OpenFindability**

- `serve.mjs`: server locale e `POST /api/save`
- `export.mjs`: PNG alle misure esatte degli store via Chrome headless
- `render.html`, `editor.html`, `index.html` (galleria delle proposte)
- tela panoramica tagliata in slide, coordinate `x/y/w/rot/z` in larghezze di slide
- formati iOS 1320×2868 e Android 1080×1920, override per piattaforma (`over.android`)
- titoli con `*evidenziato*`, `\n`, `bottomTitle`; testi per lingua `{ "it": …, "en": … }`
- cornici telefono (Dynamic Island / foro fotocamera, barra di stato), onda SVG continua
- controllo del layout `cut` / `overlap` / `border`, `--check`, `--strict`
- segnaposto (`placeholder`) bloccati all'export

**Specifico di Scadenzario, resta nel repo**

- componenti `deadline`, `list`, `budget`, `calendar`, `quickAdd`, `integrations`, notifiche
- dati demo dentro `sets/*.json`
- riferimenti fissi da rimuovere dal motore: la stringa "Scadenzario" nelle notifiche (`studio.js`, `campaign.js`) e `/website/public/favicon.png`
- elenco delle proposte scritto a mano in `index.html`

Il problema principale: generico e specifico convivono in `studio.js` e `campaign.js`, e ci sono due renderer (originale e "campaign").

## Architettura proposta

### In OpenFindability: `studio/`

```
studio/
  serve.mjs        server, più progetti in parallelo
  export.mjs       CLI di export
  engine.js        panorama, coordinate, titoli, cornici, sfondo, helper
  check.js         controllo cut/overlap/border
  components.js    tipi generici: text, image, panel, phone, review, widget
  engine.css
  index.html       galleria dei set del progetto scelto
  editor.html      editor
  render.html      pagina usata dall'export
```

Comandi:

```bash
pnpm studio                                          # → http://127.0.0.1:5177/
pnpm studio:export --slug scadenzario --set blue --strict
pnpm studio:export --repo C:/percorso/repo --set main --platform ios --locale it
```

Il motore espone ai componenti di progetto un `ctx` con `esc`, `t` (testo per lingua), `icon`, `frame` (cornice telefono), `platform`, `locale`, `app` (nome e icona dell'app, dal config).

### In ogni repo: `store/studio/`

```
store/studio/
  studio.config.json   { "name": "Scadenzario", "icon": "../../website/public/favicon.png",
                         "sets": "sets", "components": "components.js",
                         "css": "components.css", "export": "export", "defaultSet": "blue" }
  sets/*.json          slide, titoli, dati demo, con "engine": 1
  components.js        export default { deadline: (el, ctx) => html, budget: …, calendar: … }
  components.css
  assets/
  export/              gitignored
```

`"engine": N` nei JSON è il contratto: se il motore cambia in modo incompatibile, i set vecchi degli altri progetti danno un errore chiaro invece di rompersi in silenzio.

### Server: più progetti senza riavviare

- `/engine/*` → `studio/` di OpenFindability
- `/p/<slug>/*` → cartella `store/studio/` del repo di quel progetto (con controllo che impedisca di uscire dalla cartella)
- `GET /api/projects` → progetti che hanno `store/studio/studio.config.json`
- `POST /api/save?project=<slug>&set=<nome>` → scrive nel repo del progetto, mai in OpenFindability

Il percorso del repo arriva dalla tabella progetti di OpenFindability: oggi c'è `flutterProjectPath`. Se non coincide con la radice del repo (o il progetto non è Flutter), serve un campo nuovo, per esempio `repoPath`. Lettura del database con `node:sqlite` integrato in Node 24, così lo studio resta senza dipendenze. Override sempre possibile con `--repo`.

## Header e selettori

Oggi l'header della galleria ha **Formato** e **Lingua**; quello dell'editor ha piattaforma, lingua, zoom, aggiungi, annulla, salva.

Con lo studio condiviso l'header diventa:

| Selettore | Dove | Comportamento |
|---|---|---|
| **Progetto** (nuovo) | galleria ed editor | elenco da `/api/projects`, con nome e icona dell'app |
| **Set** (nuovo, oggi scritto a mano) | galleria ed editor | set trovati in `sets/` del progetto; parte da `defaultSet` |
| Formato | come ora | mostra solo le piattaforme definite nel set |
| Lingua | come ora | mostra solo le lingue del set |
| Zoom, Aggiungi, Annulla, Salva | solo editor | come ora; "Salva" scrive nel repo del progetto attivo |

Stato nell'URL, così ogni vista è un link: `/?project=scadenzario&set=blue&platform=ios&locale=it`.

Cambiando progetto: formato e lingua restano se il nuovo set li supporta, il set torna al `defaultSet`. Con modifiche non salvate nell'editor, conferma prima di cambiare. "Aggiungi…" elenca i componenti generici più quelli del progetto attivo.

Opzionale: nella pagina progetto della dashboard Next.js, un link "Apri Store Studio" a `http://127.0.0.1:5177/?project=<slug>`. Lo studio resta uno script separato, non una route Next.js.

## Migrazione

1. **Riferimento**: esportare i PNG attuali del set che si tiene (`node store/studio/export.mjs --set scadenzario-blue`) e copiarli fuori da `export/`.
2. **Pulizia**: tenere solo la variante usata (Azzurro, `campaign`). L'"Originale" usa un renderer diverso e raddoppierebbe il motore; Originale e Lime vanno archiviati, non migrati.
3. **Separazione**: spostare la parte generica in `OpenFindability/studio/`, lasciare in Scadenzario solo config, set, `components.js`, `components.css`, assets. Togliere i riferimenti fissi al nome e all'icona.
4. **Verifica**: riesportare e confrontare pixel per pixel con il riferimento; devono uscire identici. `--strict` pulito su iOS e Android, IT ed EN.
5. **Documentazione**: in OpenFindability aggiornare `AGENTS.md` (lo studio è uno script locale separato e senza dipendenze, eccezione voluta alla regola "solo Next.js") e la guida; in Scadenzario aggiornare `store/studio/README.md` (ora rimanda a OpenFindability).
6. **Dopo**: `pnpm studio:push --slug x`, prova senza modifiche per default e `--apply` per caricare, verso gli esperimenti PPO di App Store Connect e la scheda Play, con i connettori già presenti in OpenFindability.

## Scelte scartate

- **Git submodule**: sincronizzazione scomoda, nessun vantaggio su un percorso locale.
- **Pacchetto npm**: eccessivo per uno strumento locale su una sola macchina.
- **Route nella dashboard Next.js**: legherebbe lo studio a build e dipendenze di Next; un server di 60 righe basta.
- **Tutto il contenuto in OpenFindability**: gli screenshot devono essere versionati accanto al codice dell'app che mostrano.

## Rischi

- Il repo di un progetto da solo non basta più per esportare i suoi screenshot: serve anche OpenFindability.
- Una modifica al motore tocca tutti i progetti: va mantenuta la compatibilità, o si alza `engine` e si aggiornano i set.
- `flutterProjectPath` potrebbe non essere la radice del repo: va controllato per ogni progetto prima di usarlo.


## Implementazione e uso

Eseguire dalla radice di OpenFindability con Node 24:

```powershell
pnpm studio
pnpm studio --repo C:/percorso/repo --slug nome-app
pnpm studio:export --slug scadenzario --set scadenzario-blue --strict
pnpm studio:export --repo C:/percorso/repo --set main --platform ios --locale it
pnpm studio:export --slug scadenzario --check --strict
pnpm test:studio
```

`pnpm studio` scopre i repository già registrati tramite `flutterProjectPath`, purché contengano il config. `--repo` aggiunge o sostituisce un progetto solo per la sessione; funziona anche per app non Flutter senza cambiare il database. Aprire `http://127.0.0.1:5177/`. Il server deve essere avviato manualmente.

Il motore effettivo è in `studio/engine.js`, con helper, contratto, componenti generici, CSS, server, export e UI condivisa. In Scadenzario sono rimasti config, Azzurro, componenti app, CSS, font e icona. Originale, Lime e il set Notion, insieme al vecchio strumento, sono conservati in `store/studio/archive/` e non compaiono nello studio condiviso.

L'header raggruppa progetto/set e formato/lingua, mostra l'icona e separa le azioni dell'editor. I collegamenti mantengono tutti i selettori; il cambio progetto/set richiede di confermare lo scarto delle modifiche. Un formato o una lingua non disponibili vengono adattati automaticamente. La galleria mostra il set selezionato con collegamenti alle singole schermate; scegliere un altro set dal selettore.

Per aggiungere un progetto: creare il config e almeno un JSON con `engine: 1`, `platforms`, `locales`, `slides`, `elements`. `components.js` deve esportare un oggetto di funzioni `(el, ctx) => html`; usare `ctx.esc` sui dati testuali. Ogni elemento ha ID univoco, tipo (o `kind`), coordinate `x/y/w` e, per contenitori con altezza fissa, `h`; `over.<platform>` conserva gli override. Le coordinate mantengono il contratto originale del panorama. La versione incompatibile viene rifiutata esplicitamente.

La dashboard Next.js include nella pagina del progetto la scheda ?Screenshot per gli store?, con comando di avvio e pulsante ?Apri Store Studio?. Il caricamento `studio:push` rimane una fase successiva. Nessuna pubblicazione sugli store viene eseguita dal nuovo studio.


### Se non compaiono set

Lo studio usa il percorso registrato nel progetto: `--repo` vale solo per la sessione corrente. Per collegare un repository in modo permanente, dalla cartella OpenFindability:

```powershell
npx tsx scripts/update-project.ts --slug <slug> --flutter-path "C:/percorso/repository"
```

Nella radice indicata deve esistere `store/studio/studio.config.json`. Ricaricare la pagina dello studio: il registro viene letto nuovamente senza riavviare il server. Gli screenshot non vengono copiati dentro OpenFindability: galleria ed editor leggono gli stessi set nel repository dell?app. Nella dashboard del progetto compare ?Screenshot per gli store?; avviare manualmente `pnpm studio` e usare ?Apri Store Studio?.
