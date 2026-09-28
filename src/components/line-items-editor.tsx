"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { computeTotals, formatMoney, type LineItem } from "@/lib/billing";

type Row = { description: string; quantity: number; unitPriceDollars: string };

function toLineItems(rows: Row[]): LineItem[] {
  return rows
    .map((r) => ({
      description: r.description.trim(),
      quantity: Math.max(1, Math.round(Number(r.quantity) || 1)),
      unitPriceCents: Math.round((Number(r.unitPriceDollars) || 0) * 100),
    }))
    .filter((l) => l.description.length > 0);
}

export function LineItemsEditor({
  name = "lines",
  taxRateBps = 1000,
  defaults = [{ description: "", quantity: 1, unitPriceDollars: "" }],
  prefill,
}: {
  name?: string;
  taxRateBps?: number;
  defaults?: Row[];
  prefill?: { label: string; onClick: () => void }[];
}) {
  const [rows, setRows] = useState<Row[]>(defaults);

  const items = toLineItems(rows);
  const totals = computeTotals(items, taxRateBps);
  const json = JSON.stringify(items);

  function update(i: number, patch: Partial<Row>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={json} />
      {prefill && prefill.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {prefill.map((p) => (
            <Button key={p.label} type="button" size="sm" variant="outline" onClick={p.onClick}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {p.label}
            </Button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              {i === 0 && <Label className="text-xs text-muted-foreground">Description</Label>}
              <Input
                value={r.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="e.g. Growth — 4 articles/month"
              />
            </div>
            <div className="w-20 space-y-1">
              {i === 0 && <Label className="text-xs text-muted-foreground">Qty</Label>}
              <Input
                type="number"
                min={1}
                value={r.quantity}
                onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                className="text-center"
              />
            </div>
            <div className="w-28 space-y-1">
              {i === 0 && <Label className="text-xs text-muted-foreground">Unit price ($)</Label>}
              <Input
                type="number"
                min={0}
                step="0.01"
                value={r.unitPriceDollars}
                onChange={(e) => update(i, { unitPriceDollars: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="w-24 pb-1 text-right text-sm text-muted-foreground">
              {items[i] ? formatMoney(items[i].quantity * items[i].unitPriceCents) : ""}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-0.5"
              onClick={() => setRows(rows.length === 1 ? rows : rows.filter((_, idx) => idx !== i))}
              aria-label="Remove line"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows([...rows, { description: "", quantity: 1, unitPriceDollars: "" }])}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />Add line
        </Button>
        <div className="text-right text-sm">
          <div className="text-muted-foreground">Subtotal {formatMoney(totals.subtotalCents)}</div>
          <div className="text-muted-foreground">
            {taxRateBps > 0 ? `GST (${taxRateBps / 100}%)` : "Tax"} {formatMoney(totals.taxCents)}
          </div>
          <div className="font-medium">Total {formatMoney(totals.totalCents)}</div>
        </div>
      </div>
    </div>
  );
}
