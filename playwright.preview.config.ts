import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A separate Vite-only harness: no seed, database or API process. */
export default defineConfig({
  testDir: "./tests/ui-preview",
  outputDir: join(tmpdir(), "computing-lab-ui-preview-results"),
  testMatch: /.*\.e2e\.ts/,
  workers: 2,
  timeout: 60_000,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4174/", trace: "retain-on-failure" },
  webServer: {
    command: "bun run dev --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174/__dev/labs/decoding",
    env: { ...process.env, VITE_BASE_PATH: "/" },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
