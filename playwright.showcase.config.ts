import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/showcase",
  testMatch: /.*\.e2e\.ts/,
  workers: 2,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4175", trace: "retain-on-failure" },
  webServer: {
    command: "bun run vite preview --host 127.0.0.1 --port 4175 --strictPort",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
  },
});
