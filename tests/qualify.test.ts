import { describe, it, expect } from "vitest";
import { scoreProspect } from "@/lib/qualify";

const base = { rankTopN: 10, inactiveBlogDays: 90 };

describe("scoreProspect — precision rules", () => {
  it("inactive blog + not found in depth = strong", () => {
    const r = scoreProspect({
      ...base,
      rankStatus: "NOT_FOUND_IN_DEPTH",
      inspectionStatus: "INACTIVE_BLOG",
      lastPostAt: new Date(Date.now() - 120 * 86_400_000),
    });
    expect(r.status).toBe("STRONG");
    expect(r.reasons.join().toLowerCase()).toContain("not found in the organic results checked");
  });

  it("inactive blog + ranking outside top N = strong", () => {
    const r = scoreProspect({
      ...base,
      rankStatus: "FOUND",
      position: 34,
      inspectionStatus: "INACTIVE_BLOG",
      lastPostAt: new Date(Date.now() - 200 * 86_400_000),
    });
    expect(r.status).toBe("STRONG");
  });

  it("NOT_FOUND_IN_DEPTH is never phrased as 'does not rank'", () => {
    const r = scoreProspect({ ...base, rankStatus: "NOT_FOUND_IN_DEPTH" });
    expect(r.reasons.join().toLowerCase()).not.toContain("does not rank");
    expect(r.reasons.join()).toContain("checked");
  });

  it("no blog is a candidate but never outranks an inactive blog", () => {
    const noBlog = scoreProspect({ ...base, rankStatus: "NOT_FOUND_IN_DEPTH", inspectionStatus: "NO_BLOG" });
    const inactive = scoreProspect({
      ...base, rankStatus: "NOT_FOUND_IN_DEPTH", inspectionStatus: "INACTIVE_BLOG",
      lastPostAt: new Date(Date.now() - 100 * 86_400_000),
    });
    expect(noBlog.score).toBeLessThan(inactive.score);
  });

  it("a failed inspection is never a negative signal", () => {
    const r = scoreProspect({ ...base, rankStatus: "FOUND", position: 5, inspectionStatus: "FETCH_FAILED" });
    expect(r.reasons.join()).toContain("no negative signal");
    // score shouldn't be boosted by blog signal
    expect(r.score).toBeLessThan(20);
  });

  it("rank check error → visibility unknown, not bad ranking", () => {
    const r = scoreProspect({ ...base, rankStatus: "ERROR", inspectionStatus: "NO_BLOG" });
    expect(r.reasons.join()).toContain("visibility unknown");
  });

  it("top-10 ranking + active blog = disqualified (they don't need us)", () => {
    const r = scoreProspect({ ...base, rankStatus: "FOUND", position: 3, inspectionStatus: "ACTIVE_BLOG" });
    expect(r.status).toBe("DISQUALIFIED");
  });

  it("unknown last-post date is not treated as inactive", () => {
    const r = scoreProspect({ ...base, rankStatus: "NOT_FOUND_IN_DEPTH", inspectionStatus: "UNKNOWN_LAST_POST" });
    expect(r.reasons.join()).toContain("date unknown");
    expect(r.score).toBeLessThan(90); // doesn't get the full inactive-blog weight
  });
});
