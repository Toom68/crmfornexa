import { google, type gmail_v1 } from "googleapis";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

function oauthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function gmailConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function gmailAuthUrl(state: string): string | null {
  const client = oauthClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // ensure a refresh token is returned
    scope: SCOPES,
    state,
  });
}

/** Exchange an OAuth code and store the connected account (tokens encrypted). */
export async function connectGmail(code: string, connectedById?: string) {
  const client = oauthClient();
  if (!client) throw new Error("Google OAuth is not configured");
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token — reconnect with consent prompt");
  client.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress;
  if (!email) throw new Error("Could not read Gmail profile");

  const existing = await prisma.emailAccount.findFirst({ where: { provider: "gmail", email } });
  const data = {
    provider: "gmail",
    email,
    refreshTokenEnc: encrypt(tokens.refresh_token),
    accessTokenEnc: tokens.access_token ? encrypt(tokens.access_token) : null,
    accessTokenExpAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    lastHistoryId: profile.data.historyId ?? null,
    status: "active",
    connectedById: connectedById ?? null,
  };
  const account = existing
    ? await prisma.emailAccount.update({ where: { id: existing.id }, data })
    : await prisma.emailAccount.create({ data });
  return account;
}

async function authedGmail(account: { id: string; refreshTokenEnc: string }) {
  const client = oauthClient();
  if (!client) throw new Error("Google OAuth is not configured");
  client.setCredentials({ refresh_token: decrypt(account.refreshTokenEnc) });
  const { credentials } = await client.refreshAccessToken();
  client.setCredentials(credentials);
  if (credentials.access_token) {
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEnc: encrypt(credentials.access_token),
        accessTokenExpAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      },
    });
  }
  return google.gmail({ version: "v1", auth: client });
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
}

export interface SendEmailResult {
  providerMessageId: string;
  threadId?: string;
  rfcMessageId?: string;
}

/** Find a threadId to reply within, using an existing outbound message if supplied. */
async function threadFor(
  gmail: gmail_v1.Gmail,
  inReplyTo?: string,
): Promise<string | undefined> {
  if (!inReplyTo) return undefined;
  const prev = await prisma.message.findFirst({ where: { rfcMessageId: inReplyTo } });
  return prev?.providerThreadId ?? undefined;
}

export async function sendGmail(input: SendEmailInput): Promise<SendEmailResult> {
  const account = await prisma.emailAccount.findFirst({ where: { provider: "gmail", status: "active" } });
  if (!account) throw new Error("No Gmail account connected — connect one in Settings → Integrations");
  const gmail = await authedGmail(account);

  const threadId = await threadFor(gmail, input.inReplyTo);
  const headers = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
    input.inReplyTo ? `References: ${input.inReplyTo}` : null,
  ].filter(Boolean);
  const raw = Buffer.from(`${headers.join("\r\n")}\r\n\r\n${input.text}`, "utf8").toString("base64url");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId },
  });
  return {
    providerMessageId: res.data.id ?? "",
    threadId: res.data.threadId ?? undefined,
  };
}

export interface ParsedInbound {
  providerMessageId: string;
  threadId?: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  from: string;
  to?: string;
  subject?: string;
  text: string;
  html?: string;
  date?: Date;
}

/** Poll all connected Gmail accounts for new INBOX messages via history.list. */
export async function pollGmail(): Promise<ParsedInbound[]> {
  const accounts = await prisma.emailAccount.findMany({ where: { provider: "gmail", status: "active" } });
  const out: ParsedInbound[] = [];
  for (const account of accounts) {
    const gmail = await authedGmail(account);
    // Fallback when we have no cursor yet: just look at the most recent inbox messages.
    let historyId = account.lastHistoryId;
    const newIds: string[] = [];
    if (historyId) {
      try {
        const history = await gmail.users.history.list({
          userId: "me",
          startHistoryId: historyId,
          historyTypes: ["messageAdded"],
          labelId: "INBOX",
        });
        for (const h of history.data.history ?? []) {
          for (const added of h.messagesAdded ?? []) {
            if (added.message?.id) newIds.push(added.message.id);
          }
        }
        historyId = history.data.historyId ?? historyId;
      } catch {
        // historyId expired — fall back to latest messages
        historyId = null;
      }
    }
    if (!historyId) {
      const list = await gmail.users.messages.list({ userId: "me", labelIds: ["INBOX"], maxResults: 10 });
      for (const m of list.data.messages ?? []) if (m.id) newIds.push(m.id);
    }
    for (const id of newIds.slice(0, 25)) {
      const msg = await gmail.users.messages.get({ userId: "me", id, format: "raw" });
      if (!msg.data.raw) continue;
      const parsed = await simpleParser(Buffer.from(msg.data.raw, "base64url"));
      // Skip our own outbound mail — it lives in INBOX copies of threads too.
      if (parsed.from?.value?.[0]?.address?.toLowerCase() === account.email.toLowerCase()) continue;
      out.push({
        providerMessageId: id,
        threadId: msg.data.threadId ?? undefined,
        rfcMessageId: parsed.messageId,
        inReplyTo: parsed.inReplyTo,
        from: parsed.from?.value?.[0]?.address ?? parsed.from?.text ?? "",
        to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to[0]?.value?.[0]?.address : parsed.to.value?.[0]?.address) ?? undefined : undefined,
        subject: parsed.subject,
        text: parsed.text ?? "",
        html: typeof parsed.html === "string" ? parsed.html : undefined,
        date: parsed.date ?? undefined,
      });
    }
    // advance cursor
    const profile = await gmail.users.getProfile({ userId: "me" });
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { lastHistoryId: profile.data.historyId ?? historyId, lastPolledAt: new Date() },
    });
  }
  return out;
}
