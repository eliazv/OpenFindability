# MCP Server — usare OpenFindability da altri repo

OpenFindability espone un MCP server che Claude Code può usare come tool nativo in qualsiasi progetto. Nessun copy-paste di codice, nessun server da avviare: i dati arrivano live da GSC e Umami ogni volta che un tool viene chiamato.

## Setup (una volta sola)

### 1. Installa le dipendenze di OpenFindability

```bash
cd /path/to/OpenFindability
pnpm install
```

### 2. Configura il launcher MCP (senza tsx globale)

Windows, `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "openfindability": {
      "command": "node",
      "args": ["C:\\path\\to\\OpenFindability\\scripts\\mcp-launch.mjs"]
    }
  }
}
```

macOS/Linux:

```json
{
  "mcpServers": {
    "openfindability": {
      "command": "node",
      "args": ["/path/to/OpenFindability/scripts/mcp-launch.mjs"]
    }
  }
}
```

Il launcher usa il `tsx` installato nel repository, imposta la working directory e il `TSX_TSCONFIG_PATH` in modo da risolvere correttamente gli import `@/lib/...` anche se il client è avviato da un altro progetto. Riavvia il client MCP dopo la modifica.

---

## Come funziona

- Il server legge `.env` di OpenFindability in modo assoluto — le credenziali non servono nei repo target.
- I tool `get_gsc_stats`, `get_umami_stats`, `get_project_summary`, `get_page_keywords`, `compare_periods` chiamano le API in tempo reale ad ogni invocazione.
- I tool `get_opportunities` e la gestione progetti (`create_project`, `update_project`, `delete_project`) leggono/scrivono `data/openfindability.db` (SQLite), tramite una connessione DB dedicata risolta dal path del file del server (non dalla cwd).

---

## Tool disponibili

### Esplorazione

| Tool | Quando usarlo |
|------|--------------|
| `list_projects` | Prima call da fare — elenca slug e connettori configurati |
| `list_gsc_properties` | Trova l'URL esatto di una proprietà GSC prima di creare un progetto |

### Statistiche (live)

| Tool | Cosa ritorna |
|------|-------------|
| `get_project_summary` | Overview completo: GSC + Umami + opportunity in una call. Punto di partenza ideale. |
| `get_growth_snapshot` | **Solo SQLite locale**: numeri GSC, Umami, AdMob, RevenueCat, Play/ASC, freshness e opportunità; non chiama API e non pubblica nulla. |
| `get_gsc_stats` | Snapshot giornalieri, top query, top pagine per un range di date |
| `get_umami_stats` | Visitatori e pageview Umami per una data specifica |
| `get_page_keywords` | Tutte le query GSC che rankano per una specifica URL |
| `compare_periods` | Delta tra periodo corrente e precedente (click, impression, CTR, posizione) |

### Opportunity (dal database SQLite locale)

| Tool | Note |
|------|------|
| `get_opportunities` | Calcolate sull'ultimo `pnpm sync`. Filtrabile per severity. |

### Gestione progetti

| Tool | Note |
|------|------|
| `create_project` | Aggiunge progetto al database SQLite |
| `update_project` | Modifica campi (es. aggiungi GSC property o Umami ID) |
| `delete_project` | Rimuove progetto e tutti i suoi dati. Richiede `confirm: true`. |

---

## Flusso tipico in un altro repo

### Controllare SEO del progetto corrente

```
"Guarda le statistiche SEO degli ultimi 30 giorni"
→ Claude chiama get_project_summary("mio-progetto")
→ Riceve GSC + Umami + opportunity live
```

### Ottimizzare una pagina specifica

```
"Quali keyword rankano per /blog/mio-articolo?"
→ Claude chiama get_page_keywords("mio-progetto", "/blog/mio-articolo")
→ Lista query con click, impression, posizione media
```

### Verificare trend

```
"Come è andata rispetto al mese scorso?"
→ Claude chiama compare_periods("mio-progetto", days=30)
→ Delta click/impression/CTR/posizione con percentuali
```

### Aggiungere un nuovo progetto

```
"Aggiungi il progetto nuovo-sito.it"
→ Claude chiama list_gsc_properties() per trovare l'URL property
→ Claude chiama create_project(name, slug, gscProperty, ...)
→ Da quel momento get_gsc_stats funziona subito
```

---

## Aggiornare le opportunity

Le opportunity (`get_opportunities`) sono calcolate su dati storici e richiedono una sync manuale:

```bash
cd /path/to/OpenFindability
pnpm sync
```

I tool live interrogano i provider; i tool SQLite riflettono l’ultimo salvataggio locale — nessun sync necessario.

---

## Troubleshooting

**Il server non parte**
- Verifica di aver eseguito `pnpm install` in OpenFindability: il launcher risolve `tsx/cli` dai `node_modules` locali
- Verifica i path in `~/.claude/settings.json`

**"Project not found"**
- Chiama `list_projects` per vedere gli slug disponibili
- Lo slug deve corrispondere esattamente (es. `eliazavatta-it`, non `eliazavatta.it`)

**GSC restituisce dati vuoti**
- GSC ha 2-3 giorni di delay — dati di ieri potrebbero essere parziali
- Verifica che il service account abbia accesso alla property con `list_gsc_properties`

**Errore credenziali GSC**
- Controlla `GOOGLE_SERVICE_ACCOUNT_FILE` in `OpenFindability/.env`
- Il path nel `.env` viene risolto in assoluto dal server, non serve modificarlo

**Umami restituisce errore**
- Controlla `UMAMI_API_KEY` e `UMAMI_BASE_URL` in `OpenFindability/.env`
- Verifica che `umamiWebsiteId` del progetto sia corretto con `list_projects`
