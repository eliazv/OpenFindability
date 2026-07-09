# Configurazione AdMob (guida rapida)

AdMob non supporta service account: serve OAuth2 come proprietario dell'account. Il file `secrets/google/play-console-key.json` **non c'entra** — è per Play Console, non per AdMob.

## 1. Google Cloud Console

1. Progetto Cloud (già fatto: `marafone-3d627`).
2. Abilita "AdMob API" in Library.
3. Credenziali OAuth2 tipo **Desktop app** (già creato: `secrets/google/client_secret_...json`).

## 2. `.env`

```env
ADMOB_CLIENT_ID=<client-id>.apps.googleusercontent.com
ADMOB_CLIENT_SECRET=<client-secret>
ADMOB_PUBLISHER_ID=pub-xxxxxxxxxxxxxxxx
ADMOB_REFRESH_TOKEN=
```

Valori reali presi dal file `secrets/google/client_secret_*.json` (gitignored) e da AdMob → Impostazioni account. `ADMOB_REFRESH_TOKEN` va compilato allo step 3.

## 3. Ottenere il refresh token

Sul tuo PC (serve browser vero, non funziona in sessioni remote/headless):

```bash
pnpm run admob:auth
```

Apri l'URL stampato, accedi con l'account Google proprietario di AdMob (`pub-3013811216506035`), autorizza. Copia il `ADMOB_REFRESH_TOKEN` stampato nel `.env`.

## 4. Configurare i progetti

Per ogni progetto app, imposta `admobAppId` (Android/principale) e, se l'app esiste anche su iOS con un App ID diverso, anche `admobAppIdIos` — i ricavi delle due piattaforme vengono sommati in un'unica snapshot per progetto:

```bash
pnpm run project:add -- --name "Nome" --slug slug --type app \
  --admob-app-id ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy \
  --admob-app-id-ios ca-app-pub-xxxxxxxxxxxxxxxx~zzzzzzzzzz
```

Per rivedere in ogni momento la lista App ID:

```bash
pnpm run admob:apps
```

Trovati automaticamente 18 App ID sull'account: collegati ai 2 progetti esistenti che corrispondevano (Marafone Romagnolo, Scadenzario) e creati 9 nuovi progetti per le app AdMob senza corrispondenza (L'Intesa, Ghigliottina, ContaSpicci, SlapCards, Sette e Mezzo, Solitaire Club, HostPilot, QuizPA, Schocken).

## 5. Sync

```bash
pnpm run sync:admob
```

(oppure incluso di default in `pnpm run sync`). Oltre al network report (revenue/impressions/click/richieste, sommati Android+iOS), la sync scarica anche il **mediation report** (per ad source: AdMob Network, AppLovin, Unity Ads, Meta, ecc. — e per formato: banner/interstitial/rewarded), salvato in `admobMediationMetrics` (non ancora mostrato in dashboard, consultabile con `pnpm run db:studio`).

## Stato

Tutto configurato e testato: refresh token valido, 11 progetti con AdMob collegato, sync eseguita con successo (8 con dati quel giorno, alcuni a zero perché app piccole/nuove). Nessun invito utente su admob.google.com/user-management necessario — serve solo per dare accesso ad **altri account Google**, non per l'autenticazione API del proprio account.
