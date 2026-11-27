import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { basePathForVite } from "./src/shared/basePath.ts";

export default defineConfig(({ mode }) => {
  const cwd = fileURLToPath(new URL(".", import.meta.url));
  const env = loadEnv(mode, cwd, "");
  const base = basePathForVite(env.VITE_BASE_PATH ?? env.BASE_PATH ?? "/");
  const classroom = mode === "classroom";

  return {
    appType: "spa",
    base,
    plugins: [
      solid(),
      tailwindcss(),
      ...(classroom
        ? [
            {
              name: "classroom-entry",
              transformIndexHtml: {
                order: "pre" as const,
                handler: (html: string) => html.replace("/src/main.tsx", "/src/classroom-main.tsx"),
              },
            },
          ]
        : []),
    ],
    build: { outDir: classroom ? "dist-classroom" : "dist", manifest: true },
    server: {
      host: true,
      proxy: classroom
        ? {
            "/api": {
              target: `http://localhost:${env.LAB_PORT ?? 8788}`,
              changeOrigin: true,
            },
          }
        : undefined,
    },
  };
});
