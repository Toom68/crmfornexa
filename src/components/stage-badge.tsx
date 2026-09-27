import { Badge } from "@/components/ui/badge";
import type { SalesStage, ArticleStage, QualificationStatus } from "@/generated/prisma/enums";

const SALES_LABELS: Record<SalesStage, string> = {
  NEW_PROSPECT: "New prospect",
  PREPARING_OUTREACH: "Preparing outreach",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  PROPOSAL: "Proposal",
  WON: "Won",
  LOST: "Lost",
  DO_NOT_CONTACT: "Do not contact",
};

const ARTICLE_LABELS: Record<ArticleStage, string> = {
  TOPIC_PROPOSED: "Topic proposed",
  TOPIC_APPROVED: "Topic approved",
  RESEARCH: "Research",
  DRAFT: "Draft",
  HUMAN_EDIT: "Human edit",
  CLIENT_REVIEW: "Client review",
  REVISIONS: "Revisions",
  APPROVED: "Approved",
  DELIVERED: "Delivered",
};

const QUAL_LABELS: Record<QualificationStatus, string> = {
  UNCHECKED: "Unchecked",
  QUEUED: "Checking…",
  STRONG: "Strong match",
  MODERATE: "Moderate",
  LOW: "Low priority",
  DISQUALIFIED: "Disqualified",
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export function SalesStageBadge({ stage }: { stage: SalesStage }) {
  const variant: BadgeVariant =
    stage === "WON" ? "default" : stage === "LOST" || stage === "DO_NOT_CONTACT" ? "destructive" : stage === "INTERESTED" || stage === "PROPOSAL" ? "default" : "secondary";
  return <Badge variant={variant === "default" ? "outline" : variant}>{SALES_LABELS[stage]}</Badge>;
}

export function ArticleStageBadge({ stage }: { stage: ArticleStage }) {
  return <Badge variant="outline">{ARTICLE_LABELS[stage]}</Badge>;
}

export function QualBadge({ status }: { status: QualificationStatus }) {
  const variant: BadgeVariant =
    status === "STRONG" ? "default" : status === "DISQUALIFIED" ? "destructive" : "secondary";
  return <Badge variant={variant}>{QUAL_LABELS[status]}</Badge>;
}

export function SampleBadge() {
  return <Badge variant="outline" className="border-amber-400 text-amber-600">SAMPLE</Badge>;
}

export function salesStageLabel(s: SalesStage) {
  return SALES_LABELS[s];
}

export function articleStageLabel(s: ArticleStage) {
  return ARTICLE_LABELS[s];
}
