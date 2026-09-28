import type {
  ArticleStage,
  QualificationStatus,
  SalesStage,
  TopicStatus,
} from "@/generated/prisma/enums";
import { outstandingCents } from "@/lib/billing";

/** True when the nextAction text means "a reply is waiting for you". */
export function needsReply(nextAction: string | null | undefined): boolean {
  return !!nextAction?.includes("Reply received") || !!nextAction?.includes("SMS reply");
}

const ACTIVE_STAGES: readonly SalesStage[] = [
  "NEW_PROSPECT",
  "PREPARING_OUTREACH",
  "CONTACTED",
  "INTERESTED",
  "PROPOSAL",
];

export function isActiveStage(stage: SalesStage): boolean {
  return ACTIVE_STAGES.includes(stage);
}

type NextStepKey =
  | "add_website"
  | "run_checks"
  | "await_checks"
  | "review_fit"
  | "disqualify_decide"
  | "reply"
  | "suggest_topics"
  | "start_article"
  | "finish_article"
  | "send_intro"
  | "follow_up"
  | "awaiting"
  | "won"
  | "closed"
  // customer keys
  | "chase_payment"
  | "release_article"
  | "nudge_plan"
  | "plan_next_month"
  | "prepare_invoice"
  | "customer_ok";

export type NextStep = {
  key: NextStepKey;
  title: string;
  hint: string;
  /** Where the primary CTA should take you. */
  href: string;
  /** Rough priority for sorting the Today queue. Lower = sooner. */
  rank: number;
};

/**
 * Minimal structural type — any business loaded with its topics and articles
 * (even with partial selects) can be passed in.
 */
export type WorkflowBusiness = {
  id: string;
  salesStage: SalesStage;
  qualificationStatus: QualificationStatus;
  website: string | null;
  nextAction: string | null;
  nextActionAt: Date | null;
  isCustomer: boolean;
  topics: { id: string; status: TopicStatus; title: string }[];
  articles: { id: string; topicId: string | null; stage: ArticleStage; title: string; isFreeOffer: boolean; updatedAt: Date }[];
  subscriptions?: { id: string; status: string; package: { name: string; articlesPerMonth: number } }[];
  contentPlans?: {
    id: string;
    status: string;
    periodStart: Date;
    sentAt: Date | null;
    items: { id: string; status: string; scheduledFor: Date; title: string; articleId: string | null }[];
  }[];
  invoices?: {
    id: string;
    number: string;
    status: string;
    dueDate: Date | null;
    totalCents: number;
    paidAt: Date | null;
    voidedAt: Date | null;
    payments: { amountCents: number }[];
  }[];
};

const ARTICLE_IN_FLIGHT: readonly ArticleStage[] = [
  "TOPIC_APPROVED",
  "RESEARCH",
  "DRAFT",
  "HUMAN_EDIT",
  "CLIENT_REVIEW",
  "REVISIONS",
];

function monthKey(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}

/**
 * The single source of truth for "what should I do with this record next".
 * Used by the Today queue, the lists and the record page banner.
 */
export function nextStepFor(b: WorkflowBusiness): NextStep {
  const inFlight = b.articles.filter((a) => ARTICLE_IN_FLIGHT.includes(a.stage));
  const readyArticle = b.articles.find(
    (a) => a.isFreeOffer && (a.stage === "APPROVED" || a.stage === "DELIVERED"),
  );
  const approvedTopic = b.topics.find((t) => t.status === "APPROVED");

  if (b.salesStage === "DO_NOT_CONTACT") {
    return { key: "closed", title: "On the do-not-contact list", hint: "No further outreach.", href: `/prospects/${b.id}`, rank: 90 };
  }
  if (b.salesStage === "WON" && !b.isCustomer) {
    return {
      key: "won",
      title: "Deal won — convert them to a customer",
      hint: "Pick their package and start planning content.",
      href: `/prospects/${b.id}`,
      rank: 3,
    };
  }
  if (b.salesStage === "LOST") {
    return { key: "closed", title: "Marked lost", hint: "Kept for reference — no more outreach.", href: `/prospects/${b.id}`, rank: 90 };
  }

  if (needsReply(b.nextAction)) {
    return {
      key: "reply",
      title: "They replied — answer them",
      hint: b.nextAction ?? "A reply came in.",
      href: `/prospects/${b.id}`,
      rank: 0,
    };
  }

  // ---------- customer workflow ----------
  if (b.isCustomer) {
    const now = new Date();

    const overdueInvoice = b.invoices?.find(
      (i) => (i.status === "SENT" || i.status === "OVERDUE") && i.dueDate && i.dueDate < now && outstandingCents(i) > 0,
    );
    if (overdueInvoice) {
      const days = Math.round((now.getTime() - overdueInvoice.dueDate!.getTime()) / 86400_000);
      return {
        key: "chase_payment",
        title: `Chase payment — invoice ${overdueInvoice.number}`,
        hint: `Was due ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`} ($${(outstandingCents(overdueInvoice) / 100).toFixed(2)} outstanding).`,
        href: `/prospects/${b.id}?tab=billing`,
        rank: 2,
      };
    }

    const readyItem = b.contentPlans
      ?.flatMap((p) => p.items.map((i) => ({ planId: p.id, item: i })))
      .find(({ item }) => item.status === "READY" && item.scheduledFor <= now);
    if (readyItem) {
      return {
        key: "release_article",
        title: "Release their scheduled article",
        hint: `“${readyItem.item.title}” was due ${readyItem.item.scheduledFor.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} — confirm and send the link.`,
        href: `/prospects/${b.id}/plans/${readyItem.planId}`,
        rank: 4,
      };
    }

    const awaitingPlan = b.contentPlans?.find((p) => p.status === "AWAITING_APPROVAL");
    if (awaitingPlan && awaitingPlan.sentAt && now.getTime() - awaitingPlan.sentAt.getTime() > 48 * 3600_000) {
      return {
        key: "nudge_plan",
        title: "Nudge them about the content plan",
        hint: `The ${awaitingPlan.periodStart.toLocaleDateString("en-AU", { month: "long", year: "numeric" })} plan has been waiting for approval for over two days.`,
        href: `/prospects/${b.id}/plans/${awaitingPlan.id}`,
        rank: 9,
      };
    }

    const activeSub = b.subscriptions?.find((s) => s.status === "ACTIVE");
    if (activeSub) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const hasNextMonthPlan = b.contentPlans?.some(
        (p) => monthKey(p.periodStart) === monthKey(nextMonth) && p.status !== "ARCHIVED",
      );
      if (!hasNextMonthPlan) {
        return {
          key: "plan_next_month",
          title: `Plan ${nextMonth.toLocaleDateString("en-AU", { month: "long" })}'s content`,
          hint: `${activeSub.package.articlesPerMonth} articles to schedule for ${activeSub.package.name}.`,
          href: `/prospects/${b.id}?tab=plans`,
          rank: 15,
        };
      }

      // monthly invoice cadence: no SENT/PAID/OVERDUE invoice whose due month is current or later
      const hasCurrentInvoice = b.invoices?.some(
        (i) => i.status !== "VOID" && i.status !== "DRAFT" && i.dueDate && monthKey(i.dueDate) >= monthKey(now),
      );
      if (!hasCurrentInvoice) {
        return {
          key: "prepare_invoice",
          title: "Prepare this month's invoice",
          hint: `One click prefills ${activeSub.package.name} for the month.`,
          href: `/prospects/${b.id}?tab=billing`,
          rank: 16,
        };
      }
    }

    return {
      key: "customer_ok",
      title: "All on track",
      hint: b.nextAction ?? "Nothing needs attention right now.",
      href: `/prospects/${b.id}?tab=plans`,
      rank: 40,
    };
  }

  if (b.salesStage === "CONTACTED" || b.salesStage === "INTERESTED" || b.salesStage === "PROPOSAL") {
    if (b.nextActionAt && b.nextActionAt <= new Date()) {
      return {
        key: "follow_up",
        title: "Time to follow up",
        hint: `No answer yet — ${b.nextAction ?? "chase politely"}.`,
        href: `/prospects/${b.id}`,
        rank: 5,
      };
    }
    return {
      key: "awaiting",
      title: "Waiting on them",
      hint: b.nextActionAt ? `Next nudge ${b.nextActionAt < new Date() ? "was" : "is due"} ${b.nextActionAt.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}.` : "No follow-up scheduled yet.",
      href: `/prospects/${b.id}`,
      rank: 40,
    };
  }

  // Pre-outreach stages: NEW_PROSPECT / PREPARING_OUTREACH
  const qual = b.qualificationStatus as QualificationStatus;
  if (!b.website) {
    return {
      key: "add_website",
      title: "Add their website",
      hint: "Needed before the fit checks can run.",
      href: `/prospects/${b.id}`,
      rank: 20,
    };
  }
  if (qual === "UNCHECKED") {
    return {
      key: "run_checks",
      title: "Check if they're a good fit",
      hint: "Looks at their blog activity and where they rank on Google.",
      href: `/prospects/${b.id}`,
      rank: 10,
    };
  }
  if (qual === "QUEUED") {
    return { key: "await_checks", title: "Fit checks running…", hint: "Results will appear shortly.", href: `/prospects/${b.id}`, rank: 30 };
  }
  if (qual === "DISQUALIFIED") {
    return { key: "disqualify_decide", title: "Didn't qualify", hint: "Keep as a low-priority backup or mark them lost.", href: `/prospects/${b.id}`, rank: 70 };
  }

  // Fit established (STRONG / MODERATE / LOW)
  if (readyArticle) {
    return {
      key: "send_intro",
      title: "Send the intro with their free article",
      hint: "The article is ready — send it by email or SMS.",
      href: `/prospects/${b.id}`,
      rank: 8,
    };
  }
  if (inFlight.length > 0) {
    const a = inFlight.sort((x, y) => y.updatedAt.getTime() - x.updatedAt.getTime())[0];
    return {
      key: "finish_article",
      title: "Finish their free article",
      hint: `“${a.title}” is at the ${a.stage.replaceAll("_", " ").toLowerCase()} stage.`,
      href: `/articles/${a.id}`,
      rank: 6,
    };
  }
  if (!approvedTopic && b.topics.filter((t) => t.status === "PROPOSED").length === 0) {
    return {
      key: "suggest_topics",
      title: "Pick a topic for their free article",
      hint: "Get suggestions to approve before anything is written.",
      href: `/prospects/${b.id}`,
      rank: 12,
    };
  }
  if (!approvedTopic) {
    return {
      key: "suggest_topics",
      title: "Approve a topic for their free article",
      hint: "There's a proposal waiting for your sign-off.",
      href: `/prospects/${b.id}`,
      rank: 11,
    };
  }
  if (!b.articles.some((a) => a.topicId === approvedTopic.id)) {
    return {
      key: "start_article",
      title: "Start writing their free article",
      hint: `“${approvedTopic.title}” is approved and ready to draft.`,
      href: `/prospects/${b.id}`,
      rank: 7,
    };
  }

  return {
    key: "awaiting",
    title: "In progress",
    hint: "Open the record to see where things stand.",
    href: `/prospects/${b.id}`,
    rank: 50,
  };
}

/** Customer steps that belong on the Today page / nav badges. */
export const CUSTOMER_ATTENTION_KEYS: readonly NextStepKey[] = [
  "chase_payment",
  "release_article",
  "nudge_plan",
  "plan_next_month",
  "prepare_invoice",
];

export const NEXT_STEP_COPY: Record<NextStepKey, { cta: string }> = {
  add_website: { cta: "Add website" },
  run_checks: { cta: "Run fit checks" },
  await_checks: { cta: "View checks" },
  review_fit: { cta: "Review fit" },
  disqualify_decide: { cta: "Decide" },
  reply: { cta: "Write a reply" },
  suggest_topics: { cta: "Suggest topics" },
  start_article: { cta: "Start article" },
  finish_article: { cta: "Open article" },
  send_intro: { cta: "Send intro" },
  follow_up: { cta: "Follow up now" },
  awaiting: { cta: "Open record" },
  won: { cta: "Convert to customer" },
  closed: { cta: "Open record" },
  chase_payment: { cta: "Chase payment" },
  release_article: { cta: "Release article" },
  nudge_plan: { cta: "Open plan" },
  plan_next_month: { cta: "Plan content" },
  prepare_invoice: { cta: "Prepare invoice" },
  customer_ok: { cta: "Open customer" },
};
