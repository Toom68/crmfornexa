import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "http";
import { inspectWebsite } from "@/lib/inspect";

// A fake renovator site: homepage links to /blog, /blog/feed is an RSS feed
// whose newest post is 120 days old.
let server: Server;
let base: string;

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Old post</title><pubDate>${new Date(Date.now() - 120 * 86_400_000).toUTCString()}</pubDate></item>
<item><title>Older post</title><pubDate>${new Date(Date.now() - 400 * 86_400_000).toUTCString()}</pubDate></item>
</channel></rss>`;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/") {
      res.setHeader("content-type", "text/html");
      res.end(`<html><head><title>Test Renos</title><link rel="alternate" type="application/rss+xml" href="/blog/feed"></head>
<body><nav><a href="/blog">Blog</a></nav></body></html>`);
    } else if (req.url === "/blog/feed") {
      res.setHeader("content-type", "application/rss+xml");
      res.end(RSS);
    } else if (req.url === "/blog") {
      res.setHeader("content-type", "text/html");
      res.end("<html><body><h1>Blog</h1></body></html>");
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(() => server.close());

describe("inspectWebsite", () => {
  it("detects the blog and reads the last post date from RSS", async () => {
    const r = await inspectWebsite(base);
    expect(r.ok).toBe(true);
    expect(r.blogUrl).toContain("/blog");
    expect(r.lastPostSource).toBe("rss");
    expect(r.postDates.length).toBe(2);
    const days = (Date.now() - r.postDates[0].getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(100);
    expect(r.evidence.length).toBeGreaterThan(0);
  });

  it("a dead site is a failed inspection, not a negative finding", async () => {
    const r = await inspectWebsite("http://127.0.0.1:1/unreachable");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(r.postDates).toEqual([]);
  });
});
