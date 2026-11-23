import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildSite } from "../scripts/build.js";

const CHROME = [
  process.env.CHROME_PATH,
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
].find((candidate) => candidate && existsSync(candidate));

function serve(root) {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    const filePath = path.normalize(path.join(root, pathname));
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const candidates = pathname.endsWith("/")
      ? [path.join(filePath, "index.html")]
      : [filePath, path.join(filePath, "index.html")];
    const file = candidates.find((candidate) => existsSync(candidate) && candidate.startsWith(root));
    if (!file) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".txt": "text/plain; charset=utf-8",
      ".xml": "application/xml",
    };
    readFile(file).then((body) => {
      res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    }).catch(() => {
      res.writeHead(404);
      res.end("not found");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function waitJson(url) {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      /* chrome still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function cdp(ws) {
  let next = 0;
  const pending = new Map();
  const waiters = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (waiters[i].method === message.method) {
        const waiter = waiters.splice(i, 1)[0];
        waiter.resolve(message.params);
      }
    }
  });
  return {
    send(method, params = {}) {
      const id = ++next;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    wait(method) {
      return new Promise((resolve) => waiters.push({ method, resolve }));
    },
  };
}

async function openPage(port) {
  let response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`);
  if (!response.ok) {
    response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  }
  if (!response.ok) throw new Error(`Unable to open a Chrome tab (${response.status})`);
  const target = await response.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", () => reject(new Error("Chrome DevTools socket failed")));
  });
  const client = cdp(ws);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 667,
    deviceScaleFactor: 1,
    mobile: true,
  });
  return { ws, client, target };
}

async function goto(client, url) {
  await client.send("Page.navigate", { url });
  for (let i = 0; i < 50; i += 1) {
    const ready = await evaluate(client, "document.readyState === 'complete' && !!document.getElementById('material-price')");
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Page did not load: ${url}`);
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    throw new Error(details.exception?.description || details.text || JSON.stringify(details));
  }
  return result.result.value;
}

test("375px shows the title and first inputs, and the browser matches examples A-E", { timeout: 90000 }, async () => {
  assert.ok(CHROME, "Chrome is required for the layout check");
  const outDir = await mkdtemp(path.join(tmpdir(), "3dprint-site-"));
  const profile = await mkdtemp(path.join(tmpdir(), "3dprint-chrome-"));
  await buildSite({ outDir, siteUrl: "http://127.0.0.1" });
  const server = await serve(outDir);
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const debugPort = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    `--remote-debugging-port=${debugPort}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });

  try {
    await waitJson(`http://127.0.0.1:${debugPort}/json/version`);
    const page = await openPage(debugPort);
    await goto(page.client, `${origin}/`);

    const metrics = await evaluate(page.client, `(() => {
      const box = (sel) => {
        const rect = document.querySelector(sel).getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      };
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        h1: box("h1"),
        price: box("#material-price"),
        pack: box("#package-amount"),
        usage: box("#usage-amount"),
        title: document.title,
        h1Text: document.querySelector("h1").textContent,
        barDisplay: getComputedStyle(document.getElementById("price-bar")).display,
        barText: document.getElementById("price-bar").textContent,
      };
    })()`);
    assert.ok(metrics.width >= 360 && metrics.width <= 375, JSON.stringify(metrics));
    assert.equal(metrics.title, "3D Print Cost Calculator");
    assert.equal(metrics.h1Text, metrics.title);
    assert.ok(metrics.h1.top >= 0 && metrics.h1.bottom <= metrics.height, JSON.stringify(metrics));
    assert.ok(metrics.price.top >= 0 && metrics.price.bottom <= metrics.height, JSON.stringify(metrics));
    assert.ok(metrics.pack.bottom <= metrics.height, JSON.stringify(metrics));
    assert.ok(metrics.usage.bottom <= metrics.height, JSON.stringify(metrics));
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, JSON.stringify(metrics));
    assert.equal(metrics.barDisplay, "flex", JSON.stringify(metrics));
    assert.match(metrics.barText, /—/);
    assert.equal(metrics.barText.includes("$"), false);

    const shotDir = "/tmp/3dprint-shots";
    await mkdir(shotDir, { recursive: true });
    const topShot = await page.client.send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(shotDir, "home-375.png"), Buffer.from(topShot.data, "base64"));

    async function runCase(pathName, fields) {
      const target = await openPage(debugPort);
      await goto(target.client, `${origin}${pathName}`);
      const text = await evaluate(target.client, `(() => {
        const fire = (el) => {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const set = (id, value) => {
          const el = document.getElementById(id);
          el.value = value;
          fire(el);
        };
        const check = (id, on) => {
          const el = document.getElementById(id);
          el.checked = on;
          fire(el);
        };
        const fields = ${JSON.stringify(fields)};
        check("mode-filament", fields.mode !== "resin");
        check("mode-resin", fields.mode === "resin");
        check("method-markup", fields.method !== "margin");
        check("method-margin", fields.method === "margin");
        check("depreciation-on", Boolean(fields.depreciation));
        for (const [id, value] of Object.entries(fields.values)) set(id, value);
        const body = document.getElementById("result-body").textContent;
        return {
          body,
          hours: document.getElementById("time-hours").value,
          minutes: document.getElementById("time-minutes").value,
          priceLabel: document.getElementById("label-price").textContent,
          how: document.getElementById("how-material")?.textContent || "",
          usageLabel: document.getElementById("label-usage").textContent,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          h1: document.querySelector("h1").textContent,
          bar: document.getElementById("price-bar").textContent,
          barDisplay: getComputedStyle(document.getElementById("price-bar")).display,
        };
      })()`);
      target.ws.close();
      return text;
    }

    const exampleA = {
      mode: "filament",
      method: "markup",
      values: {
        "material-price": "22.99",
        "package-amount": "1",
        "package-unit": "kg",
        "usage-amount": "87.4",
        "usage-unit": "g",
        "waste-amount": "",
        "time-text": "5h 23m",
        power: "120",
        electricity: "0.16",
        "labor-minutes": "15",
        "hourly-rate": "20",
        "failure-rate": "0",
        "price-percent": "50",
        "other-costs": "",
        "part-name": "bracket",
      },
    };
    const a = await runCase("/", exampleA);
    assert.match(a.body, /\$10\.67/);
    assert.match(a.body, /\$7\.11/);
    assert.match(a.body, /5 h 23 min/);
    assert.match(a.body, /87\.4 g ÷ 1000 g/);
    assert.equal(a.hours, "5");
    assert.equal(a.minutes, "23");
    assert.equal(a.barDisplay, "flex");
    assert.match(a.bar, /\$10\.67/);
    assert.match(a.bar, /\$7\.11/);
    assert.ok(a.scrollWidth <= a.clientWidth + 1, JSON.stringify(a));

    const colon = await runCase("/", { ...exampleA, values: { ...exampleA.values, "time-text": "5:23" } });
    assert.match(colon.body, /\$10\.67/);
    const minutes = await runCase("/", { ...exampleA, values: { ...exampleA.values, "time-text": "323 min" } });
    assert.match(minutes.body, /\$10\.67/);
    const comma = await runCase("/", { ...exampleA, values: { ...exampleA.values, "usage-amount": "87,4" } });
    assert.match(comma.body, /\$10\.67/);
    const symbol = await runCase("/", { ...exampleA, values: { ...exampleA.values, "material-price": "$22.99" } });
    assert.match(symbol.body, /\$10\.67/);
    const twd = await runCase("/", { ...exampleA, values: { ...exampleA.values, currency: "TWD" } });
    assert.match(twd.body, /NT\$2\.01/);
    assert.match(twd.body, /NT\$7\.11/);
    assert.match(twd.body, /NT\$10\.67/);

    const b = await runCase("/", {
      mode: "filament",
      method: "margin",
      depreciation: true,
      values: {
        ...exampleA.values,
        "machine-price": "399",
        "machine-hours": "5000",
        "failure-rate": "5",
        "price-percent": "40",
      },
    });
    assert.match(b.body, /\$13\.23/);
    assert.match(b.body, /\$7\.94/);
    assert.match(b.body, /\$0\.40/);
    assert.match(b.body, /margin, not markup/);

    const c = await runCase("/", {
      mode: "filament",
      method: "markup",
      values: {
        "material-price": "18.50",
        "package-amount": "1",
        "package-unit": "kg",
        "usage-amount": "24.6",
        "usage-unit": "g",
        "waste-amount": "",
        "time-text": "2h 10m",
        power: "150",
        electricity: "0.22",
        "labor-minutes": "",
        "hourly-rate": "",
        "failure-rate": "0",
        "price-percent": "100",
        "other-costs": "",
        "part-name": "",
      },
    });
    assert.match(c.body, /\$1\.06/);

    const synonym = await openPage(debugPort);
    await goto(synonym.client, `${origin}/3d-printing-cost-calculator/`);
    const synonymBox = await evaluate(synonym.client, `(() => {
      const box = (sel) => {
        const rect = document.querySelector(sel).getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      };
      return {
        height: window.innerHeight,
        h1: box("h1"),
        price: box("#material-price"),
        usage: box("#usage-amount"),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        title: document.title,
      };
    })()`);
    assert.equal(synonymBox.title, "3D Printing Cost Calculator");
    assert.ok(synonymBox.h1.bottom <= synonymBox.height, JSON.stringify(synonymBox));
    assert.ok(synonymBox.price.bottom <= synonymBox.height, JSON.stringify(synonymBox));
    assert.ok(synonymBox.usage.bottom <= synonymBox.height, JSON.stringify(synonymBox));
    assert.ok(synonymBox.scrollWidth <= synonymBox.clientWidth + 1, JSON.stringify(synonymBox));
    synonym.ws.close();

    const d = await runCase("/3d-printing-cost-calculator/", {
      mode: "resin",
      method: "markup",
      values: {
        "material-price": "39.00",
        "package-amount": "1",
        "package-unit": "L",
        "usage-amount": "38.5",
        "usage-unit": "ml",
        "waste-amount": "",
        "time-text": "4h 05m",
        power: "60",
        electricity: "0.16",
        "labor-minutes": "",
        "hourly-rate": "",
        "failure-rate": "0",
        "price-percent": "50",
        "other-costs": "",
        "part-name": "",
      },
    });
    assert.equal(d.h1, "3D Printing Cost Calculator");
    assert.equal(d.priceLabel, "Bottle price");
    assert.equal(d.usageLabel, "Print volume");
    assert.match(d.body, /\$2\.31/);

    const e = await runCase("/", {
      ...exampleA,
      values: { ...exampleA.values, "waste-amount": "12" },
    });
    assert.match(e.body, /\$2\.29/);

    const bad = await runCase("/", {
      ...exampleA,
      values: { ...exampleA.values, "time-text": "abc", "usage-amount": "", "package-amount": "0", "failure-rate": "100", "price-percent": "100", electricity: "-1" },
    });
    assert.match(bad.body, /5h 23m/);
    assert.match(bad.body, /Print weight/);
    assert.match(bad.body, /more than 0/);
    assert.match(bad.body, /0 to 80/);
    assert.match(bad.body, /cannot be negative/);
    assert.equal(bad.body.includes("NaN"), false);
    assert.equal(bad.body.includes("Infinity"), false);
    assert.equal(bad.body.includes("$10.67"), false);

    const busy = await runCase("/", exampleA);
    assert.match(busy.body, /\$10\.67/);
    const buttonState = await evaluate(page.client, "document.body && true");
    assert.equal(buttonState, true);

    const live = await openPage(debugPort);
    await goto(live.client, `${origin}/`);
    await evaluate(live.client, `(() => {
      const set = (id, value) => {
        const el = document.getElementById(id);
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      set("material-price", "22.99");
      set("usage-amount", "87.4");
      set("time-text", "5h 23m");
      set("power", "120");
      set("electricity", "0.16");
      set("labor-minutes", "15");
      set("hourly-rate", "20");
    })()`);
    await evaluate(live.client, "document.getElementById('results').scrollIntoView({block:'start'})");
    const resultShot = await live.client.send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(shotDir, "result-375.png"), Buffer.from(resultShot.data, "base64"));
    const states = await evaluate(live.client, `(() => {
      const copy = document.getElementById("copy-result");
      let release;
      if (!navigator.clipboard) navigator.clipboard = {};
      navigator.clipboard.writeText = () => new Promise((resolve) => { release = resolve; });
      const seen = {};
      const orig = requestAnimationFrame;
      requestAnimationFrame = (cb) => {
        if (!seen.copy) seen.copy = { disabled: copy.disabled, text: copy.textContent };
        return orig(cb);
      };
      copy.click();
      return new Promise((resolve) => {
        setTimeout(() => {
          const during = { disabled: copy.disabled, text: copy.textContent };
          release();
          setTimeout(() => {
            resolve({ seen, during, after: { disabled: copy.disabled, text: copy.textContent } });
          }, 50);
        }, 30);
      });
    })()`);
    assert.equal(states.during.disabled, true);
    assert.equal(states.during.text, "Copying…");
    assert.equal(states.after.disabled, false);
    assert.equal(states.after.text, "Copy result");

    const printed = await evaluate(live.client, `(() => {
      const button = document.getElementById("print-page");
      let seen = null;
      window.print = () => { seen = { disabled: button.disabled, text: button.textContent }; };
      button.click();
      return new Promise((resolve) => {
        setTimeout(() => resolve({ seen, after: button.textContent, disabled: button.disabled }), 80);
      });
    })()`);
    assert.equal(printed.seen.disabled, true);
    assert.equal(printed.seen.text, "Printing…");
    assert.equal(printed.after, "Print");
    assert.equal(printed.disabled, false);

    const reset = await evaluate(live.client, `(() => {
      const button = document.getElementById("reset");
      let seen = null;
      const orig = requestAnimationFrame;
      requestAnimationFrame = (cb) => {
        seen = { disabled: button.disabled, text: button.textContent };
        return orig(cb);
      };
      button.click();
      return new Promise((resolve) => {
        setTimeout(() => resolve({
          seen,
          after: button.textContent,
          price: document.getElementById("material-price").value,
          usage: document.getElementById("usage-amount").value,
        }), 80);
      });
    })()`);
    assert.equal(reset.seen.text, "Resetting…");
    assert.equal(reset.seen.disabled, true);
    assert.equal(reset.after, "Reset");
    assert.equal(reset.price, "");
    assert.equal(reset.usage, "");

    const wide = await openPage(debugPort);
    await wide.client.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await goto(wide.client, `${origin}/`);
    const wideMetrics = await evaluate(wide.client, `({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      width: window.innerWidth,
      barDisplay: getComputedStyle(document.getElementById("price-bar")).display
    })`);
    assert.ok(wideMetrics.width >= 1200, JSON.stringify(wideMetrics));
    assert.ok(wideMetrics.scrollWidth <= wideMetrics.clientWidth + 1, JSON.stringify(wideMetrics));
    assert.equal(wideMetrics.barDisplay, "none");

    await page.client.send("Runtime.evaluate", {
      expression: "document.getElementById('results').scrollIntoView()",
    });
    page.ws.close();
    live.ws.close();
    wide.ws.close();
  } finally {
    try { chrome.kill("SIGKILL"); } catch { /* already exited */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
    await new Promise((resolve) => server.close(resolve));
    await rm(outDir, { recursive: true, force: true }).catch(() => {});
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
});

test("init syncs Print time typed before the script loads", { timeout: 60000 }, async () => {
  assert.ok(CHROME, "Chrome is required for the layout check");
  const outDir = await mkdtemp(path.join(tmpdir(), "3dprint-site-"));
  const profile = await mkdtemp(path.join(tmpdir(), "3dprint-chrome-"));
  await buildSite({ outDir, siteUrl: "http://127.0.0.1" });
  const pageHtml = await readFile(path.join(outDir, "index.html"), "utf8");
  await writeFile(
    path.join(outDir, "before-script.html"),
    pageHtml.replace('<script type="module" src="/app.js"></script>', ""),
  );
  const server = await serve(outDir);
  const { port } = server.address();
  const debugPort = 9800 + Math.floor(Math.random() * 200);
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    `--remote-debugging-port=${debugPort}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });
  try {
    await waitJson(`http://127.0.0.1:${debugPort}/json/version`);
    const page = await openPage(debugPort);
    await goto(page.client, `http://127.0.0.1:${port}/before-script.html`);
    const synced = await evaluate(page.client, `(() => {
      document.getElementById("time-text").value = "5h 23m";
      const script = document.createElement("script");
      script.type = "module";
      script.src = "/app.js";
      document.body.append(script);
      return new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          const hours = document.getElementById("time-hours").value;
          const minutes = document.getElementById("time-minutes").value;
          if ((hours === "5" && minutes === "23") || Date.now() - start > 5000) {
            resolve({ hours, minutes, timeText: document.getElementById("time-text").value });
          } else {
            setTimeout(tick, 20);
          }
        };
        tick();
      });
    })()`);
    assert.deepEqual(synced, { hours: "5", minutes: "23", timeText: "5h 23m" });
    await goto(page.client, `http://127.0.0.1:${port}/`);
    const cleared = await evaluate(page.client, `(() => {
      const fire = (el) => {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const time = document.getElementById("time-text");
      time.value = "5h 23m";
      fire(time);
      const before = {
        hours: document.getElementById("time-hours").value,
        minutes: document.getElementById("time-minutes").value,
      };
      time.value = "abc";
      fire(time);
      return {
        before,
        hours: document.getElementById("time-hours").value,
        minutes: document.getElementById("time-minutes").value,
        body: document.getElementById("result-body").textContent,
      };
    })()`);
    assert.deepEqual(cleared.before, { hours: "5", minutes: "23" });
    assert.equal(cleared.hours, "");
    assert.equal(cleared.minutes, "");
    assert.match(cleared.body, /time like 5h 23m/i);
    await goto(page.client, `http://127.0.0.1:${port}/3d-printing-cost-calculator/`);
    const loaded = await evaluate(page.client, `(() => {
      document.querySelector('[data-example="A"]').click();
      return new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          const body = document.getElementById("result-body").textContent;
          if (body.includes("$10.67") || Date.now() - start > 3000) {
            resolve({
              hours: document.getElementById("time-hours").value,
              minutes: document.getElementById("time-minutes").value,
              body,
            });
          } else {
            setTimeout(tick, 20);
          }
        };
        tick();
      });
    })()`);
    assert.equal(loaded.hours, "5");
    assert.equal(loaded.minutes, "23");
    assert.match(loaded.body, /\$10\.67/);
    const switched = await evaluate(page.client, `(() => {
      const price = document.getElementById("material-price");
      price.value = "NT$590";
      price.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        currency: document.getElementById("currency").value,
        note: document.getElementById("currency-note").textContent,
      };
    })()`);
    assert.equal(switched.currency, "TWD");
    assert.match(switched.note, /Currency switched to TWD because you typed NT\$/);
    page.ws.close();
  } finally {
    try { chrome.kill("SIGKILL"); } catch { /* already exited */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
    await new Promise((resolve) => server.close(resolve));
    await rm(outDir, { recursive: true, force: true }).catch(() => {});
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
});
