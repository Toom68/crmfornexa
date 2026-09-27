/**
 * DataForSEO — pay-as-you-go SERP and business-listing data.
 * Used for (a) discovering candidate businesses and (b) checking where a
 * business's domain sits in organic results for a keyword+city.
 * Costs ~A$0.0006 per organic SERP page; a top-50 check is ~A$0.003.
 */

const BASE = "https://api.dataforseo.com/v3";

function authHeader() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

export function dataforseoConfigured() {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const auth = authHeader();
  if (!auth) throw new Error("DataForSEO is not configured (DATAFORSEO_LOGIN/PASSWORD)");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DataForSEO ${path} failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { tasks?: { result?: T; status_message?: string }[]; cost?: number };
  const task = json.tasks?.[0];
  if (!task?.result) throw new Error(`DataForSEO returned no result: ${task?.status_message ?? "unknown"}`);
  return task.result;
}

export interface SerpItem {
  type: string;
  rank_absolute: number;
  rank_group?: number;
  domain?: string;
  url?: string;
  title?: string;
  description?: string;
}

export interface OrganicResult {
  items: SerpItem[];
  se_results_count?: number;
}

/** Live organic SERP. depth defaults to 50 (5 pages). */
export async function googleOrganic(opts: {
  keyword: string;
  locationName: string; // e.g. "Melbourne,Victoria,Australia"
  device?: "desktop" | "mobile";
  depth?: number;
}): Promise<OrganicResult> {
  const results = await post<OrganicResult[]>("/serp/google/organic/live/regular", [
    {
      keyword: opts.keyword,
      location_name: opts.locationName,
      language_name: "English",
      device: opts.device ?? "desktop",
      os: "windows",
      depth: opts.depth ?? 50,
      calculate_rectangles: false,
    },
  ]);
  return results[0] ?? { items: [] };
}

export interface MapsItem {
  type: string;
  title?: string;
  url?: string;      // business website when present
  domain?: string;
  phone?: string;
  address?: string;
  rating?: { value?: number };
}

/** Google Maps/local results — business discovery source (kept distinct from organic rank). */
export async function googleMapsSearch(opts: {
  keyword: string;
  locationName: string;
  depth?: number;
}): Promise<MapsItem[]> {
  const results = await post<{ items?: MapsItem[] }[]>("/serp/google/maps/live/advanced", [
    {
      keyword: opts.keyword,
      location_name: opts.locationName,
      language_name: "English",
      depth: opts.depth ?? 100,
      device: "desktop",
      os: "windows",
    },
  ]);
  return results[0]?.items ?? [];
}

/** Extract the organic position of a domain, plus a compact evidence snapshot. */
export function domainPosition(items: SerpItem[], domain: string) {
  const organic = items.filter((i) => i.type === "organic");
  const hit = organic.find((i) => i.domain?.replace(/^www\./, "") === domain);
  return {
    position: hit?.rank_absolute ?? null,
    topUrls: organic.slice(0, 12).map((i) => ({ url: i.url, rank: i.rank_absolute, title: i.title })),
    organicCount: organic.length,
  };
}
