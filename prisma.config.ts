import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Prisma CLI commands use Supavisor session mode; the app uses transaction mode.
    // Allow client generation without database credentials; migrations require this URL.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
