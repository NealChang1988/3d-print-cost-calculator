import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CURRENCY_HINT,
  DISCLAIMER,
    FAILURE_HINT,
    FAQ_NUMBERS,
    FEEDBACK_EMAIL,
    HOME_DESCRIPTION,
    HOME_EXAMPLES_LINK,
    HOW_KEEP,
  HOW_TIME,
  KWH_HINT,
  LEDE,
  MARKUP_NOTE,
  MARGIN_NOTE,
  PRICE_HINT,
  PRIVACY,
  SLICER_HINT,
  SYNONYM_DESCRIPTION,
  TIME_HINT,
  SYNONYM_INTRO,
  SYNONYM_LEDE,
  TOOL_HOME,
  TOOL_SYNONYM,
  WATT_HINT,
  WEAR_HINT,
  howMaterial,
} from "../src/copy.js";
import { WORKED } from "../src/examples.js";
import { faviconPng, ogPng } from "./png.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function normalizeSiteUrl(raw) {
  const value = raw || "http://127.0.0.1:8787";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SITE_URL must be an absolute http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SITE_URL must be http or https");
  }
  if (url.username || url.password) throw new Error("SITE_URL must not include a password");
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("SITE_URL must be an origin without a path");
  }
  if (url.search || url.hash) throw new Error("SITE_URL must not include a query or hash");
  return url.origin;
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fill(template, map) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(map, key)) throw new Error(`Missing placeholder ${key}`);
    return esc(map[key]);
  });
}

export function beaconTag(token) {
  const value = String(token || "").trim();
  if (!value) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("CF_BEACON_TOKEN has unexpected characters");
  return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${value}"}'></script>\n`;
}

function workedSection() {
  const articles = WORKED.map((example) => `    <article class="worked-item" id="example-${example.id}">
      <h3>${esc(example.heading)}</h3>
      ${example.steps.map((step) => `<p>${esc(step)}</p>`).join("\n      ")}
      <p><strong>${esc(example.priceLabel)}</strong></p>
      <button type="button" class="load-example" data-example="${example.id}">Load example ${example.id}</button>
    </article>`).join("\n");
  return `<section class="worked" id="worked-examples" aria-labelledby="worked-title">
    <h2 id="worked-title">Worked examples</h2>
    <p>${esc(SYNONYM_INTRO)}</p>
    ${articles}
  </section>
  <section class="faq" aria-labelledby="syn-faq-title">
    <h2 id="syn-faq-title">FAQ</h2>
    <h3>Why are these prices so exact?</h3>
    <p>They are practice numbers so you can check every line. They are not a quote and not a shop price.</p>
    <h3>Does resin use different math?</h3>
    <p>No. Example D only swaps grams for milliliters. Material, electricity, markup, and the suggested price use the same steps, and that example ends at $2.31.</p>
    <h3>Are my numbers sent anywhere?</h3>
    <p>${esc(FAQ_NUMBERS)}</p>
  </section>
  <p class="also"><a href="/">Open ${esc(TOOL_HOME)} without these examples.</a></p>`;
}

function chooseTail(html, kind) {
  if (kind === "home") {
    return html
      .replace(/<!--SYNONYM_AFTER-->[\s\S]*?<!--\/SYNONYM_AFTER-->/, "")
      .replaceAll("<!--HOME_AFTER-->", "")
      .replaceAll("<!--/HOME_AFTER-->", "");
  }
  return html
    .replace(/<!--HOME_AFTER-->[\s\S]*?<!--\/HOME_AFTER-->/, workedSection())
    .replaceAll("<!--SYNONYM_AFTER-->", "")
    .replaceAll("<!--/SYNONYM_AFTER-->", "");
}

export async function buildSite({ outDir = path.join(root, "dist"), siteUrl, beaconToken } = {}) {
  const explicit = siteUrl || process.env.SITE_URL;
  if (!explicit) {
    console.warn("SITE_URL is not set. Using http://127.0.0.1:8787 for canonical, sitemap, and og:image URLs.");
  }
  const origin = normalizeSiteUrl(explicit);
  const beacon = beaconTag(beaconToken ?? process.env.CF_BEACON_TOKEN ?? "");
  await mkdir(outDir, { recursive: true });
  await mkdir(path.join(outDir, "3d-printing-cost-calculator"), { recursive: true });

  const template = await readFile(path.join(root, "src", "page.html"), "utf8");
  const shared = {
    LEDE,
    PRIVACY,
    DISCLAIMER,
    HOW_MATERIAL: howMaterial("filament"),
    HOW_TIME,
    HOW_KEEP,
    MARKUP_NOTE,
    MARGIN_NOTE,
    SLICER_HINT,
    KWH_HINT,
    WATT_HINT,
    FAILURE_HINT,
    WEAR_HINT,
    TIME_HINT,
    PRICE_HINT,
    CURRENCY_HINT,
    EMAIL: FEEDBACK_EMAIL,
    FAQ_NUMBERS,
    EXAMPLES_LINK: HOME_EXAMPLES_LINK,
    OG_IMAGE: `${origin}/og.png`,
  };
  const pages = [
    {
      file: "index.html",
      kind: "home",
      title: TOOL_HOME,
      description: HOME_DESCRIPTION,
      lede: LEDE,
      self: "/",
      canonical: `${origin}/`,
      otherHref: "/3d-printing-cost-calculator/",
      otherName: TOOL_SYNONYM,
    },
    {
      file: "3d-printing-cost-calculator/index.html",
      kind: "synonym",
      title: TOOL_SYNONYM,
      description: SYNONYM_DESCRIPTION,
      lede: SYNONYM_LEDE,
      self: "/3d-printing-cost-calculator/",
      canonical: `${origin}/3d-printing-cost-calculator/`,
      otherHref: "/",
      otherName: TOOL_HOME,
    },
  ];
  for (const page of pages) {
    let html = fill(template, {
      ...shared,
      TITLE: page.title,
      DESCRIPTION: page.description,
      LEDE: page.lede,
      CANONICAL: page.canonical,
      SELF: page.self,
      OTHER_HREF: page.otherHref,
      OTHER_NAME: page.otherName,
    });
    html = chooseTail(html, page.kind).replace("<!--BEACON-->", beacon);
    if (html.includes("{{")) throw new Error(`Unresolved placeholder in ${page.file}`);
    await writeFile(path.join(outDir, page.file), html);
  }

  await cp(path.join(root, "src", "app.js"), path.join(outDir, "app.js"));
  await cp(path.join(root, "src", "calc.js"), path.join(outDir, "calc.js"));
  await cp(path.join(root, "src", "copy.js"), path.join(outDir, "copy.js"));
  await cp(path.join(root, "src", "examples.js"), path.join(outDir, "examples.js"));
  await cp(path.join(root, "src", "styles.css"), path.join(outDir, "styles.css"));
  await writeFile(path.join(outDir, "og.png"), ogPng());
  await writeFile(path.join(outDir, "favicon-32.png"), faviconPng());
  await writeFile(path.join(outDir, "favicon.svg"), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#efe6d4"/>
  <rect x="6" y="8" width="20" height="4" rx="1" fill="#0d5c56"/>
  <rect x="9" y="14" width="14" height="4" rx="1" fill="#1c1915"/>
  <rect x="6" y="20" width="20" height="4" rx="1" fill="#0d5c56"/>
</svg>
`);
  await writeFile(path.join(outDir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
  await writeFile(path.join(outDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/</loc></url>
  <url><loc>${origin}/3d-printing-cost-calculator/</loc></url>
</urlset>
`);
  await writeFile(path.join(outDir, "404.html"), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page not found</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css">
  ${beacon}
</head>
<body>
  <main>
    <h1>Page not found</h1>
    <p><a href="/">3D Print Cost Calculator</a></p>
  </main>
</body>
</html>
`);
  return { outDir, origin };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  buildSite().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
