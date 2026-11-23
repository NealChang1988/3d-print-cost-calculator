# 3D Print Cost Calculator

A static two-page calculator. The math runs in the browser. Nothing you type is uploaded.

`npm test` checks the worked examples, parsing, error text, page copy, and a 375px layout pass.

## Build

`SITE_URL` is the origin baked into the canonical URL, Open Graph image URL, and sitemap. It has no path.

```sh
npm install
SITE_URL=https://example.com npm run build
```

If `SITE_URL` is omitted, the build uses `http://127.0.0.1:8787` and prints a warning.

## Deploy

Wrangler runs `node scripts/build.js` before `deploy` and `preview`, so `SITE_URL` still has to be set in that command’s environment. The worker name is `3d-print-cost-calculator`.

Preview on `*.workers.dev` (`previews.vars.NOINDEX=true`). Responses include `X-Robots-Tag: noindex`, and `/robots.txt` is `Disallow: /`.

```sh
SITE_URL=https://YOUR-PREVIEW-ORIGIN npx wrangler preview
```

Production is indexable (`vars.NOINDEX=false`). Use this when the custom domain is ready. A production deploy is indexable even on its `workers.dev` hostname, so use `wrangler preview` until you want that.

```sh
SITE_URL=https://example.com npx wrangler deploy
```

Local preview of the worker and assets:

```sh
SITE_URL=http://127.0.0.1:8787 npx wrangler dev
```
