import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      APP_SECRET: "test-secret",
      DATABASE_URL: "postgresql://nexa:nexa@localhost:5432/nexa_crm",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
