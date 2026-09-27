import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  await p.account.deleteMany({});
  await p.user.deleteMany({});
  console.log("users cleared");
}
main().finally(() => p.$disconnect());
