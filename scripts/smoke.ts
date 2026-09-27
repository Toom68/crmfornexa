import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const user = await p.user.findFirstOrThrow();
  const biz = await p.business.upsert({
    where: { domain: "smoke-test.example.com" },
    create: {
      name: "Smoke Test Renos",
      domain: "smoke-test.example.com",
      website: "https://smoke-test.example.com",
      isSample: true,
      city: "Melbourne",
      contacts: { create: { email: "hi@smoke-test.example.com", isPrimary: true } },
    },
    update: {},
  });
  const msg = await p.message.create({
    data: {
      businessId: biz.id,
      contactId: (await p.contact.findFirst({ where: { businessId: biz.id } }))!.id,
      channel: "EMAIL",
      direction: "OUTBOUND",
      status: "QUEUED",
      subject: "test",
      bodyText: "hello",
      sentById: user.id,
    },
  });
  await p.job.create({ data: { type: "send_message", payload: { messageId: msg.id } } });
  console.log("queued message", msg.id);
}
main().finally(() => p.$disconnect());
