# Configurazione AdSense (guida rapida)

AdSense è per **revenue da annunci su siti web**, distinto da AdMob (revenue da annunci in-app). Stesso pattern OAuth2 interattivo — nessun service account.

## 1. Google Cloud Console

1. Nello stesso progetto Cloud (o uno nuovo), abilita **"AdSense Management API"** (`adsense.googleapis.com`).
   - **Non** abilitare "AdSense Platform API" (`adsenseplatform.googleapis.com`) — quella è per reseller/piattaforme che gestiscono account AdSense di terzi, non il tuo caso.
2. Credenziali OAuth2 tipo **Desktop app** (puoi crearne uno dedicato o riusare quello di AdMob se nello stesso progetto Cloud).

## 2. `.env`

```env
ADSENSE_CLIENT_ID=<client-id>.apps.googleusercontent.com
ADSENSE_CLIENT_SECRET=<client-secret>
ADSENSE_ACCOUNT_ID=
ADSENSE_REFRESH_TOKEN=
```

## 3. Ottenere il refresh token

Sul tuo PC (serve browser vero):

```bash
pnpm run adsense:auth
```

Apri l'URL stampato, accedi con l'account Google proprietario di AdSense, autorizza. Copia il `ADSENSE_REFRESH_TOKEN` stampato nel `.env`.

## 4. Trovare l'Account ID

```bash
pnpm run adsense:accounts
```

Stampa ogni account disponibile (`accounts/pub-xxxxxxxxxxxxxxxx`). Copia la parte `pub-xxxxxxxxxxxxxxxx` (senza il prefisso `accounts/`) in `ADSENSE_ACCOUNT_ID`.

## 5. Configurare il progetto

AdSense si collega a un **dominio/sito**, non a un app id:

```bash
pnpm run project:add -- --name "Nome sito" --slug slug --type web \
  --url https://example.com/ \
  --adsense-domain example.com
```

O su un progetto esistente, imposta `adsenseSiteDomain` nel DB (nessuno script di update dedicato ancora — modifica diretta via `pnpm run db:studio` o ricrea il progetto).

## 6. Sync

```bash
pnpm run sync:adsense
```

(oppure incluso di default in `pnpm run sync`). Per un backfill storico completo:

```bash
pnpm run sync:adsense:backfill
```

Salva `revenue` (da `ESTIMATED_EARNINGS`), `pageviews`, `impressions`, `clicks`, `adRequests` in `metricSnapshots` (stesso formato di GSC/Umami/AdMob — nessuna tabella nuova).
