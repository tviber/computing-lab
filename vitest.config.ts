import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  test: {
    environment: "jsdom",
    maxWorkers: 2,
    setupFiles: "./src/test/setup.ts",
  },
});
