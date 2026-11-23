# 3D Print Cost Calculator

A static two-page calculator. The math runs in the browser. The numbers you type are not uploaded. Page visits can be counted with Cloudflare Web Analytics when `CF_BEACON_TOKEN` is set at build time.

`npm test` checks the worked examples, parsing, error text, page copy, and a 375px layout pass.

## Build

`SITE_URL` is the origin baked into the canonical URL, Open Graph image URL, and sitemap. It has no path.

```sh
npm install
SITE_URL=https://example.com CF_BEACON_TOKEN= npm run build
```

`CF_BEACON_TOKEN` is optional. Leave it empty and the pages include no analytics script. If `SITE_URL` is omitted, the build uses `http://127.0.0.1:8787` and prints a warning.

## Deploy

Wrangler runs `node scripts/build.js` before deploy, so `SITE_URL` and `CF_BEACON_TOKEN` have to be set in that command’s environment. Do not commit the token.

Preview worker `3d-print-cost-calculator-preview` (`NOINDEX=true` in the `preview` environment). Responses include `X-Robots-Tag: noindex`, and `/robots.txt` is `Disallow: /`.

```sh
SITE_URL=https://3d-print-cost-calculator-preview.YOUR-SUBDOMAIN.workers.dev CF_BEACON_TOKEN=your-token npx wrangler deploy --env preview
```

`npx wrangler preview` is the branch preview on the main worker. It also sets `NOINDEX=true`.

Production worker `3d-print-cost-calculator` is indexable (`NOINDEX=false`).

```sh
SITE_URL=https://example.com CF_BEACON_TOKEN=your-token npx wrangler deploy
```

Local preview of the worker and assets:

```sh
SITE_URL=http://127.0.0.1:8787 npx wrangler dev
```
