import type { InspectionStatus, QualificationStatus } from "@/generated/prisma/enums";

/**
 * Prospect qualification. Signals:
 *  - Weak organic visibility for a relevant keyword+city (not in top-N,
 *    or not found within checked depth — recorded precisely).
 *  - An established but inactive blog (no post in >= inactiveBlogDays).
 * Businesses with no blog are prospects too, just lower priority.
 * Fetch failures NEVER count as a negative signal.
 */
export function scoreProspect(opts: {
  rankStatus?: "FOUND" | "NOT_FOUND_IN_DEPTH" | "ERROR";
  position?: number | null;
  rankTopN: number;
  inspectionStatus?: InspectionStatus;
  lastPostAt?: Date | null;
  inactiveBlogDays: number;
}): { score: number; status: QualificationStatus; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // --- visibility signal ---
  let visibilityKnown = false;
  if (opts.rankStatus === "FOUND") {
    visibilityKnown = true;
    if ((opts.position ?? 0) > opts.rankTopN) {
      score += 40;
      reasons.push(`Ranks #${opts.position} organically — outside top ${opts.rankTopN}`);
    } else {
      reasons.push(`Ranks #${opts.position} organically — already in top ${opts.rankTopN}`);
    }
  } else if (opts.rankStatus === "NOT_FOUND_IN_DEPTH") {
    visibilityKnown = true;
    score += 45;
    reasons.push(`Not found in the organic results checked (top ${opts.rankTopN}+)`);
  } else if (opts.rankStatus === "ERROR") {
    reasons.push("Ranking check failed — visibility unknown");
  }

  // --- blog activity signal ---
  if (opts.inspectionStatus === "INACTIVE_BLOG" && opts.lastPostAt) {
    const days = Math.floor((Date.now() - opts.lastPostAt.getTime()) / 86_400_000);
    score += 45;
    reasons.push(`Blog inactive — last post ~${days} days ago (≥ ${opts.inactiveBlogDays}d threshold)`);
  } else if (opts.inspectionStatus === "ACTIVE_BLOG") {
    score += 5;
    reasons.push("Blog is active — weaker signal");
  } else if (opts.inspectionStatus === "NO_BLOG") {
    score += 15;
    reasons.push("No blog found — candidate, but lower priority");
  } else if (opts.inspectionStatus === "UNKNOWN_LAST_POST") {
    score += 25;
    reasons.push("Blog found but last-post date unknown — needs manual check");
  } else if (opts.inspectionStatus === "FETCH_FAILED" || opts.inspectionStatus === "ERROR") {
    reasons.push("Website inspection failed — no negative signal recorded");
  }

  let status: QualificationStatus;
  if (!visibilityKnown && !opts.inspectionStatus) status = "QUEUED";
  else if (score >= 70) status = "STRONG";
  else if (score >= 45) status = "MODERATE";
  else if (score >= 15) status = "LOW";
  else status = "DISQUALIFIED";

  return { score, status, reasons };
}
