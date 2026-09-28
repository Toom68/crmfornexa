import { prisma } from "./db";

/** Configurable rules — everything business-specific lives here, not in code. */
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  "business.name": "Nexa Content Studio",
  "business.fromName": "Nexa Content Studio",
  "business.abn": "",
  "followup.hours": 24,
  "prospecting.inactiveBlogDays": 90,
  "prospecting.rankTopN": 10,
  "prospecting.rankDepth": 50,
  "prospecting.categories": ["kitchen renovation", "bathroom renovation"],
  "prospecting.cities": ["Melbourne", "Sydney"],
  "outreach.defaultChannel": "EMAIL",
  "outreach.senderSignature": "The team at Nexa",
  "sms.provider": "simulated",
  "billing.abn": "",
  "billing.bsb": "",
  "billing.accountNumber": "",
  "billing.accountName": "",
  "billing.paymentInstructions": "Please use the invoice number as the payment reference.",
  "billing.taxRateBps": 1000, // 10% GST — set 0 if not GST-registered
  "billing.invoiceDueDays": 14,
  "billing.adhocArticlePriceCents": 35000,
};

export async function getSetting<T>(key: string): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row) return row.value as T;
  return DEFAULT_SETTINGS[key] as T;
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = await prisma.setting.findMany();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function setSetting(key: string, value: unknown) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}
