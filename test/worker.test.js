import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, noindexEnabled, robotsDisallow } from "../src/worker.js";

function assets(body = "asset", status = 200) {
  return {
    async fetch() {
      return new Response(body, {
        status,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  };
}

test("preview NOINDEX sends noindex and Disallow", async () => {
  assert.equal(noindexEnabled({ NOINDEX: "true" }), true);
  assert.equal(noindexEnabled({ NOINDEX: "1" }), true);
  assert.equal(noindexEnabled({ NOINDEX: true }), true);
  const robots = await handle(new Request("https://preview.example/robots.txt"), {
    NOINDEX: "true",
    ASSETS: assets("User-agent: *\nAllow: /\n"),
  });
  assert.equal(robots.headers.get("X-Robots-Tag"), "noindex");
  assert.equal(await robots.text(), robotsDisallow());
  assert.match(robotsDisallow(), /Disallow: \/\n/);

  const page = await handle(new Request("https://preview.example/"), {
    NOINDEX: "true",
    ASSETS: assets("<p>ok</p>"),
  });
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex");
  assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(await page.text(), "<p>ok</p>");
});

test("production does not add noindex", async () => {
  assert.equal(noindexEnabled({ NOINDEX: "false" }), false);
  assert.equal(noindexEnabled({}), false);
  const page = await handle(new Request("https://example.com/"), {
    NOINDEX: "false",
    ASSETS: assets("<p>ok</p>"),
  });
  assert.equal(page.headers.get("X-Robots-Tag"), null);
  assert.equal(await page.text(), "<p>ok</p>");

  const robots = await handle(new Request("https://example.com/robots.txt"), {
    NOINDEX: "false",
    ASSETS: assets("User-agent: *\nAllow: /\n", 200),
  });
  assert.equal(robots.headers.get("X-Robots-Tag"), null);
  assert.equal(await robots.text(), "User-agent: *\nAllow: /\n");
});

test("missing assets do not throw an unhandled error", async () => {
  const response = await handle(new Request("https://example.com/"), { NOINDEX: "false" });
  assert.equal(response.status, 500);
  assert.match(await response.text(), /Assets are not configured/);
});
