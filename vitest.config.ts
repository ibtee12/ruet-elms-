import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
