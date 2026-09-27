import crypto from "crypto";

/** {{merge_field}} substitution. Unknown fields are left intact so mistakes are visible. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => vars[key] ?? match);
}

export const TEMPLATE_VARS = [
  "business_name",
  "contact_name",
  "article_title",
  "article_link",
  "sender_name",
  "sender_signature",
  "business_website",
  "unsubscribe_url",
] as const;

/** HMAC-signed unsubscribe token for a contact — no DB state needed. */
export function unsubscribeToken(contactId: string): string {
  const sig = crypto
    .createHmac("sha256", process.env.APP_SECRET ?? "dev")
    .update(`unsub:${contactId}`)
    .digest("base64url")
    .slice(0, 24);
  return `${contactId}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [contactId, sig] = token.split(".");
  if (!contactId || !sig) return null;
  const expected = crypto
    .createHmac("sha256", process.env.APP_SECRET ?? "dev")
    .update(`unsub:${contactId}`)
    .digest("base64url")
    .slice(0, 24);
  if (sig.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? contactId : null;
}
