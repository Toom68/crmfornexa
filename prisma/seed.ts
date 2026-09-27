import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ---- first team account (created through better-auth so the password
  // hash exactly matches whatever version is installed) ----
  const { auth } = await import("../src/lib/auth");
  const email = "admin@nexa.test";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const res = await auth.api.signUpEmail({
      body: { name: "Admin", email, password: "nexa-admin-2026" },
    });
    if (!res.user) throw new Error("signUpEmail failed");
    console.log("Created login: admin@nexa.test / nexa-admin-2026");
  }

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
  ];
  for (const t of templates) {
    const exists = await prisma.messageTemplate.findFirst({ where: { name: t.name } });
    if (!exists) await prisma.messageTemplate.create({ data: t });
  }

  // ---- clearly-labelled SAMPLE prospects (isSample = true) ----
  const samples = [
    {
      name: "Harbourview Kitchens (SAMPLE)",
      domain: "harbourview-kitchens.example.com",
      website: "https://harbourview-kitchens.example.com",
      city: "Sydney",
      state: "NSW",
      categories: ["kitchen renovation"],
    },
    {
      name: "Brighton Bathworks (SAMPLE)",
      domain: "brighton-bathworks.example.com",
      website: "https://brighton-bathworks.example.com",
      city: "Melbourne",
      state: "VIC",
      categories: ["bathroom renovation"],
    },
  ];
  for (const s of samples) {
    const exists = await prisma.business.findUnique({ where: { domain: s.domain } });
    if (!exists) {
      await prisma.business.create({
        data: {
          ...s,
          categories: s.categories,
          isSample: true,
          source: "sample",
          contacts: {
            create: {
              name: "Sample Contact",
              email: `hello@${s.domain}`,
              isPrimary: true,
              source: "sample",
              permissionBasis: "unknown",
            },
          },
        },
      });
    }
  }

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
