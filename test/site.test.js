import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  DISCLAIMER,
  FEEDBACK_EMAIL,
  HOME_DESCRIPTION,
  HOW_KEEP,
  HOW_TIME,
  MARKUP_NOTE,
  MARGIN_NOTE,
  FAQ_NUMBERS,
  HOME_EXAMPLES_LINK,
  LEDE,
  PRIVACY,
  SYNONYM_DESCRIPTION,
  SYNONYM_LEDE,
  TOOL_HOME,
  TOOL_SYNONYM,
  howMaterial,
} from "../src/copy.js";
import { buildSite } from "../scripts/build.js";

const BANNED = [
  /\bprusa\b/i,
  /\bbambu\b/i,
  /\bcreality\b/i,
  /\bender-?\d/i,
  /\banycubic\b/i,
  /\belegoo\b/i,
  /\bformlabs\b/i,
  /\bultimaker\b/i,
  /\bflashforge\b/i,
  /\bprintpal\b/i,
  /\b3dprintforce\b/i,
  /\bguarantee/i,
  /\byou will (make|earn|profit)/i,
];

const LATER = [
  "3d-print-price-calculator",
  "filament-cost-calculator",
  "resin-print-cost-calculator",
];

async function built() {
  const outDir = await mkdtemp(path.join(tmpdir(), "3dprint-"));
  await buildSite({ outDir, siteUrl: "https://calc.example" });
  const home = await readFile(path.join(outDir, "index.html"), "utf8");
  const other = await readFile(path.join(outDir, "3d-printing-cost-calculator", "index.html"), "utf8");
  return { outDir, home, other };
}

function section(html, className) {
  const match = html.match(new RegExp(`<section class="${className}"[\\s\\S]*?</section>`));
  assert.ok(match, className);
  return match[0];
}

test("pages use the exact tool names and only the two v1 routes", async () => {
  const { outDir, home, other } = await built();
  assert.match(home, new RegExp(`<title>${TOOL_HOME}</title>`));
  assert.match(other, new RegExp(`<title>${TOOL_SYNONYM}</title>`));
  assert.match(home, new RegExp(`<h1>${TOOL_HOME}</h1>`));
  assert.match(other, new RegExp(`<h1>${TOOL_SYNONYM}</h1>`));
  assert.match(home, new RegExp(`<nav aria-label="Tool">\\s*<a [^>]*>${TOOL_HOME}</a>`));
  assert.match(other, new RegExp(`<nav aria-label="Tool">\\s*<a [^>]*>${TOOL_SYNONYM}</a>`));
  assert.equal(section(home, "calculator"), section(other, "calculator"));
  assert.match(home, new RegExp(`<meta name="description" content="${HOME_DESCRIPTION}">`));
  assert.match(other, new RegExp(`<meta name="description" content="${SYNONYM_DESCRIPTION}">`));
  assert.notEqual(HOME_DESCRIPTION, SYNONYM_DESCRIPTION);
  for (const later of LATER) {
    assert.equal(home.includes(later), false);
    assert.equal(other.includes(later), false);
    assert.equal((await readdir(outDir)).includes(later), false);
  }
  const sitemap = await readFile(path.join(outDir, "sitemap.xml"), "utf8");
  assert.match(sitemap, /<loc>https:\/\/calc\.example\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/calc\.example\/3d-printing-cost-calculator\/<\/loc>/);
  assert.equal(sitemap.match(/<loc>/g).length, 2);
});

test("markup and margin notes are both on the page and use different names", async () => {
  const { home } = await built();
  assert.ok(home.includes(MARKUP_NOTE));
  assert.ok(home.includes(MARGIN_NOTE));
  assert.match(home, /50% markup/);
  assert.match(home, /40% margin/);
  assert.match(home, />Markup</);
  assert.match(home, />Margin</);
  assert.equal(home.includes("Markup margin"), false);
});

test("no tax fields, no profit promise, no printer brands", async () => {
  const { outDir, home, other } = await built();
  const labels = [...home.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gi)].map((match) => match[0]);
  assert.equal(labels.some((label) => /tax|vat/i.test(label)), false);
  assert.equal(/<input[^>]*(tax|vat)/i.test(home), false);
  assert.equal(home.includes("<form"), false);
  assert.equal(other.includes("<form"), false);
  const files = ["index.html", "app.js", "calc.js", "copy.js", "styles.css"];
  let blob = "";
  for (const file of files) blob += await readFile(path.join(outDir, file), "utf8");
  blob += other;
  for (const pattern of BANNED) assert.equal(pattern.test(blob), false, pattern);
  assert.equal(/noindex/i.test(home), false);
  assert.equal(/noindex/i.test(other), false);
});

test("privacy, disclaimer, formulas, copy, print, and mailto are present", async () => {
  const { home } = await built();
  assert.ok(home.includes(PRIVACY));
  assert.ok(home.includes(DISCLAIMER));
  assert.match(home, /id="copy-result"[^>]*>Copy result</);
  assert.match(home, /id="print-page"[^>]*>Print</);
  assert.match(home, new RegExp(`mailto:${FEEDBACK_EMAIL}`));
  assert.equal(home.includes("<form"), false);
  assert.equal((home.match(/mailto:/g) || []).length, 1);
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /Copying…/);
  assert.match(app, /Printing…/);
  assert.match(app, /Resetting…/);
  assert.equal(/\bfetch\s*\(/.test(app), false);
  assert.equal(/XMLHttpRequest|sendBeacon|gtag|google-analytics|plausible/.test(app), false);
  const worker = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.equal(worker.includes("https://"), false);
  assert.equal(worker.includes("http://"), false);
});

test("canonical, sitemap, robots, favicon, and og image use SITE_URL", async () => {
  const { outDir, home, other } = await built();
  assert.match(home, /<link rel="canonical" href="https:\/\/calc\.example\/">/);
  assert.match(other, /<link rel="canonical" href="https:\/\/calc\.example\/3d-printing-cost-calculator\/">/);
  assert.match(home, /property="og:image" content="https:\/\/calc\.example\/og\.png"/);
  assert.match(home, /rel="icon" href="\/favicon\.svg"/);
  const robots = await readFile(path.join(outDir, "robots.txt"), "utf8");
  assert.match(robots, /Allow: \//);
  assert.equal(robots.includes("Disallow: /"), false);
  assert.match(robots, /Sitemap: https:\/\/calc\.example\/sitemap\.xml/);
  const og = await readFile(path.join(outDir, "og.png"));
  assert.equal(og.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(og.readUInt32BE(16), 1200);
  assert.equal(og.readUInt32BE(20), 630);
  const icon = await readFile(path.join(outDir, "favicon-32.png"));
  assert.equal(icon.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const svg = await readFile(path.join(outDir, "favicon.svg"), "utf8");
  assert.equal(svg.includes("<script"), false);
  const config = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(config, /"name": "3d-print-cost-calculator"/);
  assert.match(config, /"NOINDEX": "false"/);
  assert.match(config, /"NOINDEX": "true"/);
  assert.match(config, /"directory": "\.\/dist"/);
  assert.match(config, /"run_worker_first": true/);
});

test("how to use has 3 boxes whose sentences use the field labels", async () => {
  const { home } = await built();
  const how = section(home, "how");
  assert.equal(how.match(/<li>/g).length, 3);
  assert.equal(how.match(/<svg/g).length, 3);
  assert.ok(how.includes(howMaterial("filament")));
  assert.ok(how.includes(HOW_TIME));
  assert.ok(how.includes(HOW_KEEP));
  for (const label of ["Filament", "Resin", "Spool price", "Spool weight", "Print weight", "Print time", "Hours", "Minutes", "Power (W)", "Electricity price", "Copy result", "Print"]) {
    assert.ok(home.includes(label), label);
  }
});

test("the synonym page has its own examples and both pages mention visit counts", async () => {
  const { outDir, home, other } = await built();
  assert.ok(home.includes(HOME_EXAMPLES_LINK));
  assert.equal(home.includes("Same calculator"), false);
  assert.equal(home.includes('id="worked-examples"'), false);
  assert.ok(home.includes(LEDE));
  assert.ok(other.includes(SYNONYM_LEDE));
  assert.equal(other.includes(LEDE), false);
  assert.ok(other.includes('id="worked-examples"'));
  for (const price of ["$10.67", "$13.23", "$1.06", "$2.31", "$2.29"]) {
    assert.ok(other.includes(price), price);
  }
  for (const id of ["A", "B", "C", "D", "E"]) {
    assert.ok(other.includes(`data-example="${id}"`), id);
    assert.ok(other.includes(`Load example ${id}`), id);
  }
  assert.ok(other.includes("Example D. Resin"));
  assert.match(other, /milliliters/);
  assert.equal(/millilitres|millilitre|litres|litre/i.test(home + other), false);
  assert.ok(home.includes(FAQ_NUMBERS));
  assert.ok(other.includes(FAQ_NUMBERS));
  assert.equal(home.includes("Nothing is uploaded"), false);
  assert.equal(other.includes("Nothing is uploaded"), false);
  assert.equal(home.includes("beacon.min.js"), false);
  const notFound = await readFile(path.join(outDir, "404.html"), "utf8");
  assert.equal(notFound.includes("beacon.min.js"), false);
  const css = await readFile(path.join(outDir, "styles.css"), "utf8");
  assert.match(css, /#price-bar|\.price-bar/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /max-width:\s*859px/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.ok(home.includes('id="price-bar"'));
  assert.ok(other.includes('id="price-bar"'));
});

test("CF_BEACON_TOKEN adds the analytics script only when set", async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), "3dprint-beacon-"));
  await buildSite({ outDir, siteUrl: "https://calc.example", beaconToken: "abc_123" });
  for (const file of ["index.html", "3d-printing-cost-calculator/index.html", "404.html"]) {
    const html = await readFile(path.join(outDir, file), "utf8");
    assert.match(html, /src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"/);
    assert.match(html, /data-cf-beacon='\{"token":"abc_123"\}'/);
    assert.equal(/beacon\.min\.js\?/.test(html), false);
  }
  await buildSite({ outDir, siteUrl: "https://calc.example", beaconToken: "" });
  const home = await readFile(path.join(outDir, "index.html"), "utf8");
  assert.equal(home.includes("cloudflareinsights"), false);
});

test("result example is a Before / After table", async () => {
  const { home } = await built();
  const example = section(home, "example");
  assert.match(example, /<th>Before<\/th><th>After<\/th>/);
  assert.match(example, /5h 23m/);
  assert.match(example, /87,4 g/);
  assert.match(example, /1,000/);
});
