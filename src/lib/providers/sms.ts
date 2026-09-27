/**
 * SMS provider abstraction. Inbound replies require a dedicated number
 * configured with the provider's inbound webhook pointing at
 * /api/webhooks/sms. Until a provider is configured, sends are SIMULATED
 * and clearly labelled.
 */
export interface SendSmsResult {
  providerMessageId: string;
  simulated: boolean;
}

async function sendViaTwilio(to: string, body: string): Promise<SendSmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) throw new Error("Twilio is not configured");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio send failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { sid: string };
  return { providerMessageId: json.sid, simulated: false };
}

async function sendViaClickSend(to: string, body: string): Promise<SendSmsResult> {
  const key = process.env.CLICKSEND_API_KEY;
  const username = process.env.CLICKSEND_USERNAME;
  if (!key || !username) throw new Error("ClickSend is not configured");
  const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${key}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: [{ to, body, source: "nexa-crm" }] }),
  });
  if (!res.ok) throw new Error(`ClickSend send failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data?: { messages?: { message_id?: string }[] } };
  return { providerMessageId: json.data?.messages?.[0]?.message_id ?? "", simulated: false };
}

export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  const provider = process.env.SMS_PROVIDER ?? "simulated";
  if (provider === "twilio") return sendViaTwilio(to, body);
  if (provider === "clicksend") return sendViaClickSend(to, body);
  return { providerMessageId: `sim_${crypto.randomUUID()}`, simulated: true };
}
