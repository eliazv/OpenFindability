# Navigazione sidebar-first e impostazioni

Branch `feat/growth-intelligence-data-foundations`, prosecuzione dei fix 403 e sortable.

## Struttura

Rimosso l'header globale desktop. La sidebar contiene:
- Marchio/link Panoramica e pulsante di compressione (Ctrl+B), disponibili anche nel rail compresso.
- Ricerca immediatamente sotto il marchio (Ctrl/Cmd+K).
- Progetti ordinabili e nascondibili con il precedente editor dnd-kit; indicatore dei progetti nascosti cliccabile per riaprire l'editor.
- Footer fisso della sidebar: Store Studio e Impostazioni. Centro dati e Strumenti non occupano più voci permanenti.

Impostazioni è un dialog Radix con tema chiaro/scuro, organizzazione progetti, accesso a Centro dati e Strumenti. Le pagine di gestione mantengono i percorsi `/data` e `/tools`, con ritorno a Impostazioni. Non vengono caricate o duplicate le tabelle pesanti nel dialog. Il tema conserva il cookie esistente.

La ricerca è un dialog compatto ispirato alle command palette, con risultati raggruppati, ricerca per più termini e accenti, icone di progetto, frecce, Invio ed Esc. Ricerca nei progetti nascosti solo se l'utente digita una query. Le sezioni sono condivise con le tab progetto, evitando la sezione Store per progetti solo web. Nessun nuovo package: Dialog, Sheet, Button, Input e Separator seguono i componenti shadcn/Radix già presenti. La logica di ricerca è specifica del prodotto; non è un'ulteriore libreria di command palette.

Su mobile rimane una barra non fissa, con apertura sidebar e ricerca. I link chiudono la navigazione mobile; i dialog sono montati fuori dal drawer per non dipendere dal suo ciclo di vita. Il progresso del sync resta visibile solo quando c'è una sincronizzazione attiva.

## Verifiche

3/3 test della ricerca passati su Node 22 dopo transpile TypeScript dei sorgenti originali verificati tramite SHA Git. Coprono risultati iniziali, progetti nascosti, sezioni valide e ricerca accent-insensitive a più termini. Suite completa, build e verifica desktop/mobile con browser non eseguite: ambiente senza dipendenze del progetto/pnpm.

Smoke test locale: desktop sidebar aperta e compressa, ricerca Ctrl+K e tastiera, tema persistente dopo reload, navigazione mobile e chiusura dei drawer, accesso a data/tools e ritorno al dialog, salvataggio ordine/visibilità, recupero artwork. Non ci sono nuove migrazioni o dipendenze in questo intervento.
