import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 NexaCRM/1.0";
const TIMEOUT_MS = 15_000;

export interface SiteInspection {
  ok: boolean;
  error?: string;
  siteTitle?: string;
  siteSummary?: string;
  blogUrl?: string;
  feedUrl?: string;
  /** Dates found for blog posts, newest first. */
  postDates: Date[];
  lastPostSource?: "rss" | "sitemap" | "page-date-heuristic";
  /** URLs examined — retained as evidence for the team to verify. */
  evidence: { url: string; note: string }[];
}

async function fetchText(url: string): Promise<{ url: string; text: string; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    return { url: res.url, text: await res.text(), contentType };
  } catch {
    return null;
  }
}

const BLOG_PATH_HINTS = [
  "blog", "news", "articles", "journal", "insights", "resources", "learn", "advice", "tips",
];
const FEED_PATHS = ["/feed", "/feed.xml", "/rss", "/rss.xml", "/blog/feed", "/blog/rss.xml", "/atom.xml"];

/** Parse RSS/Atom feed XML into post dates. */
function datesFromFeed(xml: string): Date[] {
  const $ = cheerio.load(xml, { xml: true });
  const dates: Date[] = [];
  $("item > pubDate, entry > published, entry > updated, item > dc\\:date").each((_, el) => {
    const d = new Date($(el).text().trim());
    if (!isNaN(d.getTime())) dates.push(d);
  });
  return dates.sort((a, b) => b.getTime() - a.getTime());
}

/** Pull lastmod dates for blog-ish URLs out of a sitemap (or sitemap index, shallow). */
async function datesFromSitemap(sitemapXml: string, depth = 0): Promise<{ dates: Date[]; sourceUrl?: string }> {
  const $ = cheerio.load(sitemapXml, { xml: true });
  const dates: Date[] = [];
  // nested sitemaps
  if (depth === 0) {
    const childSitemaps: string[] = [];
    $("sitemap > loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (BLOG_PATH_HINTS.some((h) => loc.toLowerCase().includes(h))) childSitemaps.push(loc);
    });
    for (const child of childSitemaps.slice(0, 2)) {
      const res = await fetchText(child);
      if (res) {
        const inner = await datesFromSitemap(res.text, 1);
        if (inner.dates.length) return { dates: inner.dates, sourceUrl: child };
      }
    }
  }
  $("url").each((_, el) => {
    const loc = $(el).find("loc").first().text().trim();
    const lastmod = $(el).find("lastmod").first().text().trim();
    if (!lastmod) return;
    if (depth === 0 && !BLOG_PATH_HINTS.some((h) => loc.toLowerCase().includes(h))) return;
    const d = new Date(lastmod);
    if (!isNaN(d.getTime())) dates.push(d);
  });
  dates.sort((a, b) => b.getTime() - a.getTime());
  return { dates };
}

/** Heuristic date scrape from a blog index page (time tags, JSON-LD, common classes). */
function datesFromPage(html: string): Date[] {
  const $ = cheerio.load(html);
  const dates: Date[] = [];
  $("time[datetime]").each((_, el) => {
    const d = new Date($(el).attr("datetime") ?? "");
    if (!isNaN(d.getTime())) dates.push(d);
  });
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).contents().text());
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        const raw = item?.datePublished ?? item?.dateCreated ?? item?.["@graph"]?.[0]?.datePublished;
        if (raw) {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) dates.push(d);
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  return dates.sort((a, b) => b.getTime() - a.getTime());
}

export async function inspectWebsite(website: string): Promise<SiteInspection> {
  const out: SiteInspection = { ok: false, postDates: [], evidence: [] };
  const base = website.includes("://") ? website : `https://${website}`;
  const home = await fetchText(base);
  if (!home) {
    out.error = `Could not fetch ${base} — site down, blocked, or timed out`;
    return out; // FETCH_FAILED — never a negative signal
  }
  out.ok = true;
  out.evidence.push({ url: home.url, note: "homepage fetched" });

  const $ = cheerio.load(home.text);
  out.siteTitle = $("title").first().text().trim() || undefined;
  out.siteSummary =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    undefined;

  const origin = new URL(home.url).origin;

  // 1. Feed advertised in <head>
  let feedUrl: string | undefined;
  $('link[type="application/rss+xml"], link[type="application/atom+xml"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href && !feedUrl) feedUrl = new URL(href, home.url).toString();
  });

  // 2. Blog link in nav/body
  let blogUrl: string | undefined;
  $("a[href]").each((_, el) => {
    if (blogUrl) return;
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().toLowerCase();
    const lower = href.toLowerCase();
    if (BLOG_PATH_HINTS.some((h) => lower.includes(`/${h}`) || text.trim() === h)) {
      try {
        const abs = new URL(href, home.url);
        if (abs.hostname.replace(/^www\./, "") === new URL(home.url).hostname.replace(/^www\./, "")) {
          blogUrl = abs.toString();
        }
      } catch { /* skip bad hrefs */ }
    }
  });
  out.blogUrl = blogUrl;
  if (blogUrl) out.evidence.push({ url: blogUrl, note: "blog link found on homepage" });

  // 3. Try discovered + common feed paths
  const feedCandidates = [feedUrl, ...FEED_PATHS.map((p) => origin + p)].filter(Boolean) as string[];
  for (const candidate of feedCandidates.slice(0, 6)) {
    const res = await fetchText(candidate);
    if (!res || !res.contentType.match(/xml|rss|atom|text/i)) continue;
    const dates = datesFromFeed(res.text);
    if (dates.length) {
      out.feedUrl = candidate;
      out.postDates = dates;
      out.lastPostSource = "rss";
      out.evidence.push({ url: candidate, note: `feed parsed — ${dates.length} dated posts` });
      return out;
    }
  }

  // 4. Sitemap lastmod dates for blog-ish URLs
  const sitemap = await fetchText(`${origin}/sitemap.xml`) ?? await fetchText(`${origin}/sitemap_index.xml`);
  if (sitemap && sitemap.text.includes("<")) {
    const { dates, sourceUrl } = await datesFromSitemap(sitemap.text);
    if (dates.length) {
      out.postDates = dates;
      out.lastPostSource = "sitemap";
      out.evidence.push({ url: sourceUrl ?? sitemap.url, note: `sitemap dates — newest ${dates[0].toISOString().slice(0, 10)}` });
      return out;
    }
    out.evidence.push({ url: sitemap.url, note: "sitemap checked — no dated blog URLs" });
  }

  // 5. Blog page heuristics
  if (blogUrl) {
    const blogPage = await fetchText(blogUrl);
    if (blogPage) {
      const dates = datesFromPage(blogPage.text);
      if (dates.length) {
        out.postDates = dates;
        out.lastPostSource = "page-date-heuristic";
        out.evidence.push({ url: blogPage.url, note: `page dates — newest ${dates[0].toISOString().slice(0, 10)}` });
      } else {
        out.evidence.push({ url: blogPage.url, note: "blog page has no reliable publication dates" });
      }
    }
  }
  return out;
}
