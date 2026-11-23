/**
 * Static-asset worker. Preview sets NOINDEX=true and is not indexed.
 * Production sets NOINDEX=false. Calculator input never reaches this worker.
 */

export function noindexEnabled(env) {
  const value = env && env.NOINDEX;
  return value === true || value === "true" || value === "1";
}

export function robotsDisallow() {
  return "User-agent: *\nDisallow: /\n";
}

function withNoindex(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function handle(request, env) {
  const url = new URL(request.url);
  if (noindexEnabled(env) && url.pathname === "/robots.txt") {
    return withNoindex(new Response(robotsDisallow(), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    }));
  }
  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return new Response("Assets are not configured.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const asset = await env.ASSETS.fetch(request);
  if (noindexEnabled(env)) return withNoindex(asset);
  return asset;
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      console.error(JSON.stringify({
        message: "request failed",
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : String(error),
      }));
      return new Response("Something went wrong.", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  },
};
