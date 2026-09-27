import { prisma } from "@/lib/db";
import { gmailConfigured, sendGmail } from "./gmail";
import type { SendEmailInput, SendEmailResult } from "./gmail";

/**
 * Outbound email abstraction. Gmail (OAuth) is the primary provider;
 * Mailgun is reserved for when a sending domain exists. If nothing is
 * configured, sends are SIMULATED and labelled — never sent externally.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult & { simulated: boolean }> {
  const hasGmail = await prisma.emailAccount.findFirst({ where: { provider: "gmail", status: "active" } });
  if (hasGmail && gmailConfigured()) {
    const res = await sendGmail(input);
    return { ...res, simulated: false };
  }
  return {
    providerMessageId: `sim_${crypto.randomUUID()}`,
    simulated: true,
  };
}
