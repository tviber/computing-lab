import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
  plugins: [solid()],
  test: {
    environment: "jsdom",
    maxWorkers: 2,
    setupFiles: "./src/test/setup.ts",
  },
});
