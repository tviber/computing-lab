// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ overrideConfig: { rules: { "prettier/prettier": "off" } } });
const domainPath = "src/features/calculator/domain/constraint-probe.ts";
const lessonPath = "src/features/calculator/lesson/constraint-probe.ts";

async function ruleIds(code: string, filePath = domainPath): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((message) => message.ruleId);
}

describe("pure-layer lint constraints", () => {
  it.each([
    'export { createSignal } from "solid-js";',
    'export { render } from "@solidjs/web";',
    'export { useNavigate } from "@solidjs/router";',
    'export { Button } from "@ui-sdk/solid/button";',
    'export { useAuth } from "../../../shared/auth";',
    'export { LabAccessGate } from "../../../shared/lab";',
    'export { unsafe } from "../../../shared/lab/saveStatusHook.ts";',
    'export { AppPageLayout } from "../../../shared/layout";',
    'export { hiddenCases } from "../../../../server/judge/testcases.ts";',
    'export { fixture } from "../preview/fixtures.ts";',
    'export { readFile } from "fs/promises";',
    'export { DatabaseSync } from "node:sqlite";',
  ])("rejects forbidden imports and re-exports: %s", async (code) => {
    for (const path of [domainPath, lessonPath]) {
      expect(await ruleIds(code, path)).toContain("no-restricted-imports");
    }
  });

  it.each([
    ["export const unsafe: any = 0;", "@typescript-eslint/no-explicit-any"],
    [
      "export const unsafe = {} as { id: string };",
      "@typescript-eslint/consistent-type-assertions",
    ],
    ["export const unsafe = 0 as unknown as string;", "no-restricted-syntax"],
    ['export const unsafe = import("../ui/Workspace");', "no-restricted-syntax"],
    ["export const load = (path: string) => import(path);", "no-restricted-syntax"],
    ["export const unsafe = Date.now();", "no-restricted-globals"],
    ["export const unsafe = globalThis.fetch;", "no-restricted-globals"],
    ["export const unsafe = Math.random();", "no-restricted-properties"],
    ["export const { random } = Math;", "no-restricted-properties"],
  ])("rejects unsafe shortcuts: %s", async (code, rule) => {
    expect(await ruleIds(code)).toContain(rule);
  });

  it.each([
    "export const unsafe = 0 as unknown as string;",
    "export const load = (path: string) => import(path);",
  ])("rejects unsafe lesson shortcuts: %s", async (code) => {
    expect(await ruleIds(code, lessonPath)).toContain("no-restricted-syntax");
  });

  it("cannot disable the any guard from inside a pure module", async () => {
    expect(
      await ruleIds(
        "/* eslint-disable @typescript-eslint/no-explicit-any */\nexport const unsafe: any = 0;",
      ),
    ).toContain("@typescript-eslint/no-explicit-any");
  });

  it("caps new pure modules at 800 lines", async () => {
    expect(await ruleIds("// line\n".repeat(801))).toContain("max-lines");
  });

  it.each([
    "../../src/shared/lab",
    "../../src/shared/lab/useAutosaveDraft.ts",
    "../../src/shared/lab/labMetadataHook.ts",
  ])("rejects server imports of hook modules and lookalike exceptions: %s", async (path) => {
    expect(
      await ruleIds(`export * from ${JSON.stringify(path)};`, "server/judge/constraint-probe.ts"),
    ).toContain("no-restricted-imports");
  });

  it("allows server access to the exact pure lab metadata module", async () => {
    expect(
      await ruleIds(
        'export { LAB_IDS } from "../../src/shared/lab/labMetadata.ts";\n',
        "server/judge/constraint-probe.ts",
      ),
    ).toEqual([]);
  });

  it("allows local calculations, const assertions and type-only infrastructure contracts", async () => {
    expect(
      await ruleIds(
        [
          'import type { LabProjectPayload } from "../../../shared/api/client.ts";',
          'export type { SaveStatus } from "../../../shared/lab/saveStatus.ts";',
          'export { markSaveStatus } from "../../../shared/lab/saveStatus.ts";',
          'export { sanitizeGraph } from "./graph.ts";',
          "export const value = { enabled: true } as const;",
          "export type Payload = LabProjectPayload<unknown>;",
        ].join("\n") + "\n",
      ),
    ).toEqual([]);
  });
});
