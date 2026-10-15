# Audit del repository pubblico — 15 ottobre 2026

## Ambito e metodo

Repository: `eliazv/OpenFindability`, pubblico, base `master`.

Verifiche condotte in sola lettura tramite GitHub:

- Enumerazione degli **8 branch head** presenti e dei percorsi dei file raggiungibili da ogni branch.
- Ispezione dei diff degli **173 commit** della cronologia di `master`, più i due commit aggiunti sulla branch documentale `docs/seo-geo-monitoring-2026-10-15`; le altre branch non hanno commit aggiuntivi rispetto alla cronologia già ispezionata.
- Ricerca dei percorsi tipici di dati privati: `.env`, database SQLite, `secrets/`, `private-notes/`, report privati, certificati, keystore, CSV/XLSX.
- Ricerca nei diff di firme comuni di token GitHub, Google, AWS, Slack, Stripe/OpenAI, refresh token, JWT, private key e URL di spreadsheet; lettura dei file di configurazione e di alcune vecchie note/script.
- Verifica di `.gitignore`, `SECURITY.md`, `scripts/audit-public-repo.mjs` e della strategia locale-first.

## Risultati

**Non sono state individuate credenziali effettive né database privati nei file correnti delle branch o nei diff storici esaminati.** `.env.example` usa valori dimostrativi; la cartella `data/` contiene nel tree pubblico solo il marker `.gitkeep`.

La cronologia conserva **documentazione tecnica e brainstorming precedenti** (anche riferimenti a nomi di progetti e siti usati come esempi). Non sono chiavi d'accesso, ma vanno considerati pubblici: eliminare un file da `master` non lo elimina automaticamente dalla history.

### Protezioni migliorate nella PR collegata

1. `.gitignore`: proteggere **tutte** le sottocartelle di `data/`, non solo i file JSON/DB di primo livello; escludere CSV, fogli, Parquet, Arrow, DuckDB, NDJSON e cartelle temporanee/di export.
2. `audit-public-repo.mjs`: segnalare questi percorsi/estensioni e aggiungere firme di token comunemente usate dai provider moderni.
3. Mantenere il riconoscimento dei file `.env.example` e `data/.gitkeep` come eccezioni previste.

I nuovi ignore prevengono errori futuri, ma **non rimuovono** eventuali file già tracciati. Prima di pubblicare nuovi connettori e il warehouse cloud, usare solo dati demo sintetici nei fixture e non serializzare API token nei report.

## Limiti dell'audit

Non è una certificazione di assenza di segreti. In questa sessione non era disponibile una clone locale Git completa, quindi **non è stato possibile eseguire** `pnpm run audit:secrets:history` o Gitleaks sul database di oggetti Git locale. L'ispezione dei diff GitHub è sensibile a modifiche esposte nei patch; può non rilevare ogni contenuto binario, oggetto non più raggiungibile o stringa non corrispondente alle firme usate. Un file rinominato con diff vuoto è stato ispezionato indirettamente attraverso la sua versione precedente.

Non è possibile controllare il working tree locale dell'utente, eventuali file non committati o lo stato effettivo di **GitHub Secret Scanning / Push Protection** dal solo metadata disponibile.

### Verifiche locali consigliate prima del merge o di pubblicare

```bash
pnpm run audit:secrets
pnpm run audit:secrets:history
gitleaks git --redact --log-opts="--all"
git ls-files
git status --short
```

In `git ls-files`, se appare un file sensibile già tracciato, `.gitignore` **non basta**: rimuoverlo dall'indice con `git rm --cached -- <file>`, poi valutare l'esposizione nella history. Se una credenziale fosse mai stata pubblicata, **revocarla/ruotarla prima** di riscrivere la history. Non pubblicare report con valori di segreti.

Controllare nella UI GitHub `Settings → Security & analysis` la disponibilità e l'attivazione di secret scanning e push protection.

## Giudizio

Il tree pubblico corrente appare ragionevolmente pulito e già organizzato per separare codice open source da dati runtime. **Rischio residuo non nullo**: errori umani su export/future integrazioni, pattern di segreti non riconosciuti e contenuti di commit storici non completamente verificabili senza una scansione locale indipendente.

Queste modifiche non attivano GitHub Actions né inviano statistiche o credenziali a servizi esterni.
