# Gestione CREO

Gestionale ordini clienti di **CREO Positano Glasses** — sostituisce ClickUp con un sistema su misura.

**App:** https://creopositano.pages.dev (protetta da password)

## Architettura

- **Frontend**: `public/` — vanilla JS + Chart.js (CDN), PWA installabile, tema scuro. Nessun build step.
- **API**: `functions/api/[[path]].js` — Cloudflare Pages Functions. Login con cookie firmato HMAC, CRUD ordini, automazioni, cataloghi, registro attività con annulla/ripristina, export CSV, webhook Shopify, parsing ordini con Workers AI.
- **Database**: Cloudflare D1 `creopositano-db` (binding `DB`). Schema in `schema.sql`.
- **AI**: Workers AI (binding `AI`, llama 3.3 70b) per creare ordini da testo libero.

## Deploy

```bash
npm i -D wrangler
npx wrangler pages deploy public --project-name creopositano
```

Prima del primo deploy: creare il database D1 e applicare `schema.sql`, poi impostare i secrets:

```bash
npx wrangler d1 create creopositano-db   # aggiorna database_id in wrangler.toml
npx wrangler d1 execute creopositano-db --remote --file schema.sql
npx wrangler pages secret put APP_PASSWORD  # password di accesso
npx wrangler pages secret put BACKUP_KEY    # chiave per /api/export
npx wrangler pages secret put HOOK_KEY      # chiave per /api/shopify-hook
```

## Integrazioni

- **Shopify**: webhook "Creazione ordine" (JSON) → `https://creopositano.pages.dev/api/shopify-hook?key=<HOOK_KEY>`. Gli ordini del sito entrano da soli nella lista.
- **Backup su Google Drive**: `backup_creo_drive.gs` — Google Apps Script con trigger settimanale (lunedì): salva il CSV completo in Drive → CREO → CLIENTI e cancella i backup più vecchi di 60 giorni.
- **Export manuale**: nell'app, ⚙ → Backup → "Scarica adesso" (oppure `GET /api/export?key=<BACKUP_KEY>`).

## Dati

Import iniziale da ClickUp (CSV export + API) con `scripts/import.mjs` → genera i file seed SQL. I seed e le chiavi **non sono nel repository** (dati clienti e segreti restano su Cloudflare).

`data/catalogs.json` contiene i cataloghi iniziali dei campi (statuti, reparti, stili, modelli, colori) usati dal seed; a runtime vivono nella tabella `meta` e si modificano dall'app (⚙ → Campi e opzioni).

## Note

- Cache-busting: gli asset sono versionati (`app.js?v=N`); a ogni modifica incrementare `N` in `index.html` e il nome cache in `public/sw.js`.
- Il sito è escluso dai motori di ricerca (meta noindex, robots.txt, header X-Robots-Tag).
