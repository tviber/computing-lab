import { execFileSync } from "node:child_process";
import { copyFileSync } from "node:fs";

execFileSync(
  "bun",
  ["build", "server/index.ts", "--target=node", "--outdir=dist-server", "--packages=external"],
  { stdio: "inherit" },
);
copyFileSync("server/db/schema.sql", "dist-server/schema.sql");
