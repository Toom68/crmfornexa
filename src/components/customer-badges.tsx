import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PLAN_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
};

export function PlanStatusBadge({ status }: { status: string }) {
  const variant =
    status === "APPROVED" ? "default" : status === "AWAITING_APPROVAL" ? "outline" : "secondary";
  return (
    <Badge
      variant={variant}
      className={status === "AWAITING_APPROVAL" ? "border-amber-400 text-amber-600" : undefined}
    >
      {PLAN_LABELS[status] ?? status}
    </Badge>
  );
}

const ITEM_LABELS: Record<string, string> = {
  PLANNED: "Planned",
  IN_PRODUCTION: "Writing",
  READY: "Ready",
  DELIVERED: "Delivered",
  DROPPED: "Dropped",
};

export function PlanItemStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={status === "DELIVERED" ? "default" : status === "READY" ? "outline" : "secondary"}
      className={cn(status === "READY" && "border-primary/40 text-primary")}
    >
      {ITEM_LABELS[status] ?? status}
    </Badge>
  );
}

const QUOTE_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

export function QuoteStatusBadge({ status }: { status: string }) {
  const variant =
    status === "ACCEPTED" ? "default" : status === "DECLINED" || status === "EXPIRED" ? "destructive" : "secondary";
  return <Badge variant={variant}>{QUOTE_LABELS[status] ?? status}</Badge>;
}

const INVOICE_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  OVERDUE: "Overdue",
  VOID: "Void",
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  const variant =
    status === "PAID" ? "default" : status === "OVERDUE" ? "destructive" : "secondary";
  return <Badge variant={variant}>{INVOICE_LABELS[status] ?? status}</Badge>;
}

const SUB_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  CANCELLED: "Cancelled",
};

export function SubscriptionStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "ACTIVE" ? "default" : "secondary"}>{SUB_LABELS[status] ?? status}</Badge>
  );
}

export function PackageBadge({
  name,
  articlesPerMonth,
  className,
}: {
  name: string;
  articlesPerMonth?: number;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("border-primary/30 bg-primary/5 text-primary", className)}>
      {name}
      {typeof articlesPerMonth === "number" ? ` · ${articlesPerMonth}/mo` : ""}
    </Badge>
  );
}

export function CustomerBadge() {
  return <Badge className="border-primary/30 bg-primary/10 text-primary">Customer</Badge>;
}
