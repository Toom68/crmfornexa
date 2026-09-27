import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const biz = await p.business.findUniqueOrThrow({ where: { domain: "smoke-test.example.com" } });
  const msg = await p.message.findFirstOrThrow({ where: { businessId: biz.id } });
  const job = await p.job.findFirstOrThrow({ where: { type: "send_message" } });
  console.log({
    messageStatus: msg.status,
    provider: msg.provider,
    sentAt: msg.sentAt,
    businessStage: biz.salesStage,
    nextAction: biz.nextAction,
    nextActionAt: biz.nextActionAt,
    jobStatus: job.status,
  });
}
main().finally(() => p.$disconnect());
