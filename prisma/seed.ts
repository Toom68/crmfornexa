import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Login credentials live in Supabase Auth — create a team member there
  // (Authentication → Users, or the sign-up form on /login) and the app
  // profile row is provisioned automatically on first sign-in.
  // ---- built-in templates ----
  const templates = [
    {
      name: "Intro — free article (email)",
      channel: "EMAIL" as const,
      isBuiltIn: true,
      subject: "A free article for {{business_name}} — yours to keep",
      body: `Hi {{contact_name}},

I came across {{business_name}} while researching {{business_website}}. I've written an article for you — completely free, yours to keep and publish wherever you like:

{{article_title}}
{{article_link}}

You can read it, copy it, or download it as a Word doc or web-ready HTML from that link — no strings attached.

If it's useful, we also write monthly articles for renovation businesses. Either way, the article is yours.

{{sender_signature}}

Unsubscribe: {{unsubscribe_url}}`,
    },
    {
      name: "Intro — free article (SMS)",
      channel: "SMS" as const,
      isBuiltIn: true,
      subject: null,
      body: `Hi {{contact_name}}, it's {{sender_name}}. I wrote a free article for {{business_name}} — yours to keep: {{article_link}} Reply STOP to opt out.`,
    },
    {
      name: "Follow-up nudge (email)",
      channel: "EMAIL" as const,
      isBuiltIn: true,
      subject: "Re: {{article_title}}",
      body: `Hi {{contact_name}},

Just checking you saw the article I sent over for {{business_name}} — the link's here if it got buried: {{article_link}}

Happy to answer any questions.

{{sender_signature}}

Unsubscribe: {{unsubscribe_url}}`,
    },
    {
      name: "Content plan — approval request (email)",
      channel: "EMAIL" as const,
      isBuiltIn: true,
      subject: "Your {{plan_month}} content plan",
      body: `Hi {{contact_name}},

Here's what we're planning to write for {{business_name}} in {{plan_month}}:

{{plan_link}}

Take a look — you can approve it there or tell us what to change. Once you approve, we'll get writing and deliver each article on its scheduled date.

{{sender_signature}}`,
    },
    {
      name: "Content plan — approval request (SMS)",
      channel: "SMS" as const,
      isBuiltIn: true,
      subject: null,
      body: `Hi {{contact_name}}, your {{plan_month}} content plan is ready to review: {{plan_link}} — approve it there or reply with changes. {{sender_name}}`,
    },
    {
      name: "Plan approval reminder (email)",
      channel: "EMAIL" as const,
      isBuiltIn: true,
      subject: "Re: Your {{plan_month}} content plan",
      body: `Hi {{contact_name}},

Quick nudge — the {{plan_month}} plan for {{business_name}} is still waiting on your tick:

{{plan_link}}

If anything looks off, just reply here and we'll adjust it.

{{sender_signature}}`,
    },
    {
      name: "Quote sent (email)",
      channel: "EMAIL" as const,
      isBuiltIn: true,
      subject: "Quote {{quote_number}} for {{business_name}}",
      body: `Hi {{contact_name}},

Here's your quote — you can view it and accept it online:

{{quote_link}}

Any questions, just reply to this email.

{{sender_signature}}`,
    },
    {
      name: "Invoice (email)",
      channel: "EMAIL" as const,
      isBuiltIn: true,
      subject: "Invoice {{invoice_number}} for {{business_name}}",
      body: `Hi {{contact_name}},

Your invoice is ready — it has the totals and our bank details for transfer:

{{invoice_link}}

Thanks!

{{sender_signature}}`,
    },
    {
      name: "Payment received (email)",
      channel: "EMAIL" as const,
      isBuiltIn: true,
      subject: "Payment received — thank you",
      body: `Hi {{contact_name}},

Just confirming we've received your payment — thank you. Receipt details are on your invoice if you need them for your records.

{{sender_signature}}`,
    },
    {
      name: "Article delivered (email)",
      channel: "EMAIL" as const,
      isBuiltIn: true,
      subject: "Your article is ready: {{article_title}}",
      body: `Hi {{contact_name}},

Your latest article is ready — read it, copy it, or download it (Word doc or web-ready HTML) here:

{{article_title}}
{{article_link}}

You publish it whenever you're ready — if anything needs a tweak, reply and we'll fix it.

{{sender_signature}}`,
    },
    {
      name: "Article delivered (SMS)",
      channel: "SMS" as const,
      isBuiltIn: true,
      subject: null,
      body: `Hi {{contact_name}}, your article "{{article_title}}" is ready: {{article_link}} — download it as a Word doc or HTML. {{sender_name}}`,
    },
  ];
  for (const t of templates) {
    const exists = await prisma.messageTemplate.findFirst({ where: { name: t.name } });
    if (!exists) await prisma.messageTemplate.create({ data: t });
  }

  // ---- default packages (editable in Settings → Packages) ----
  const defaultPackages = [
    { name: "Starter", description: "Two articles a month", articlesPerMonth: 2, priceCents: 70000 },
    { name: "Growth", description: "Four articles a month", articlesPerMonth: 4, priceCents: 120000 },
    { name: "Authority", description: "Eight articles a month", articlesPerMonth: 8, priceCents: 200000 },
  ];
  for (const p of defaultPackages) {
    const exists = await prisma.articlePackage.findFirst({ where: { name: p.name } });
    if (!exists) await prisma.articlePackage.create({ data: p });
  }

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
