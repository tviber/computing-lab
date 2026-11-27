import { existsSync, readdirSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { LAB_REGISTRY } from "../../server/labs.ts";
import { LAB_IDS, labMetadata } from "../shared/lab/labMetadata.ts";
import { APP_LABS } from "./labRegistry.ts";
import { appRoutes, router } from "./router.tsx";

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = join(srcRoot, "app");
const featuresRoot = join(srcRoot, "features");
const sharedRoot = join(srcRoot, "shared");
const sourceExtensions = new Set([".ts", ".tsx"]);

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf("."))) &&
      !entry.name.includes(".test.") &&
      !entry.name.includes(".spec.")
      ? [path]
      : [];
  });
}

function isWithin(path: string, root: string): boolean {
  const child = relative(root, path);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

const importsCache = new Map<string, string[]>();

function importedPaths(file: string, runtimeOnly = false, includeDynamic = true): string[] {
  const key = `${file}:${runtimeOnly}:${includeDynamic}`;
  const cached = importsCache.get(key);
  if (cached) return cached;
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const specifiers = dependencySpecifiers(source, runtimeOnly, includeDynamic);
  importsCache.set(key, specifiers);
  return specifiers;
}

function dependencySpecifiers(
  source: ts.SourceFile,
  runtimeOnly: boolean,
  includeDynamic = true,
): string[] {
  const specifiers: string[] = [];
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (
        runtimeOnly &&
        ((ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
          (ts.isExportDeclaration(node) && node.isTypeOnly))
      )
        return;
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      !runtimeOnly &&
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text);
    }
    if (
      ts.isCallExpression(node) &&
      ((includeDynamic && node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return specifiers;
}

function resolveImport(file: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return resolve(dirname(file), specifier);
  if (specifier.startsWith("@/")) return resolve(srcRoot, specifier.slice(2));
  return null;
}

function violations(root: string, check: (specifier: string, resolved: string | null) => boolean) {
  return sourceFiles(root).flatMap((file) =>
    importedPaths(file)
      .filter((specifier) => check(specifier, resolveImport(file, specifier)))
      .map((specifier) => `${relative(srcRoot, file)} -> ${specifier}`),
  );
}

describe("architecture boundaries", () => {
  it("finds runtime re-exports and imports while distinguishing type-only contracts", () => {
    const source = ts.createSourceFile(
      "probe.ts",
      [
        'import type { A } from "./type-import";',
        'import { type B } from "./inline-type-import";',
        'export type { C } from "./type-export";',
        'export { type D } from "./inline-type-export";',
        'export * from "./barrel";',
        'import "./side-effect";',
        'export { type E, value } from "./mixed";',
        "const lazy = import(`./dynamic`);",
        'const legacy = require("./required");',
        '// export * from "./comment";',
      ].join("\n"),
      ts.ScriptTarget.Latest,
      true,
    );
    const runtime = ["./barrel", "./side-effect", "./mixed", "./dynamic", "./required"];
    expect(dependencySpecifiers(source, true)).toEqual([
      "./inline-type-import",
      "./inline-type-export",
      ...runtime,
    ]);
    expect(dependencySpecifiers(source, true, false)).not.toContain("./dynamic");
    expect(dependencySpecifiers(source, false)).toEqual([
      "./type-import",
      "./inline-type-import",
      "./type-export",
      "./inline-type-export",
      ...runtime,
    ]);
  });

  it.each([
    ['import type { T } from "./target.ts";', []],
    ['export type { T } from "./target.ts";', []],
    ['export type * from "./target.ts";', []],
    ['import { type T } from "./target.ts";', ["./target.ts"]],
    ['export { type T } from "./target.ts";', ["./target.ts"]],
    ['import {} from "./target.ts";', ["./target.ts"]],
    ['export {} from "./target.ts";', ["./target.ts"]],
  ])("preserves the runtime edges retained by Node type stripping: %s", (code, expected) => {
    const source = ts.createSourceFile("probe.ts", code, ts.ScriptTarget.Latest, true);
    const erased = ts.createSourceFile(
      "probe.js",
      stripTypeScriptTypes(code),
      ts.ScriptTarget.Latest,
      true,
    );
    expect(dependencySpecifiers(erased, true)).toEqual(expected);
    expect(dependencySpecifiers(source, true)).toEqual(expected);
  });

  it.each([
    'type X = import("../../image-sampling/domain/downsample.ts").Resolution;',
    'type X = typeof import("../../image-sampling/domain/downsample.ts");',
    'type X = Array<import("../../image-sampling/domain/downsample.ts").Resolution>;',
  ])("includes import types in cross-feature contracts but not runtime edges: %s", (code) => {
    const source = ts.createSourceFile("probe.ts", code, ts.ScriptTarget.Latest, true);
    const specifier = "../../image-sampling/domain/downsample.ts";
    expect(dependencySpecifiers(source, false)).toEqual([specifier]);
    expect(dependencySpecifiers(source, true)).toEqual([]);
    const featureRoot = join(featuresRoot, "calculator");
    const target = resolveImport(join(featureRoot, "domain/probe.ts"), specifier);
    expect(target).not.toBeNull();
    expect(isWithin(target!, featuresRoot)).toBe(true);
    expect(isWithin(target!, featureRoot)).toBe(false);
  });

  it("keeps shared infrastructure independent of app and features", () => {
    expect(
      violations(sharedRoot, (_specifier, resolved) => {
        return (
          resolved !== null && (isWithin(resolved, appRoot) || isWithin(resolved, featuresRoot))
        );
      }),
    ).toEqual([]);
  });

  it("keeps feature domain logic independent of UI frameworks and UI modules", () => {
    const domainFiles = sourceFiles(featuresRoot).filter((file) => {
      const parts = relative(featuresRoot, file).split(sep);
      return parts[1] === "domain";
    });
    const violationsFound = domainFiles.flatMap((file) =>
      importedPaths(file)
        .filter((specifier) => {
          const resolved = resolveImport(file, specifier);
          return (
            /^(?:solid-js|@solidjs\/|@ui-sdk\/|react(?:-|\/|$))/.test(specifier) ||
            (resolved !== null && /(?:^|[/\\])ui(?:[/\\]|$)/.test(resolved))
          );
        })
        .map((specifier) => `${relative(srcRoot, file)} -> ${specifier}`),
    );
    expect(violationsFound).toEqual([]);
  });

  it("keeps domain and lesson runtime dependencies pure and within their owning feature", () => {
    const failures = new Set<string>();
    for (const feature of readdirSync(featuresRoot, { withFileTypes: true })) {
      if (!feature.isDirectory()) continue;
      const featureRoot = join(featuresRoot, feature.name);
      for (const layer of ["domain", "lesson"]) {
        const root = join(featureRoot, layer);
        if (!existsSync(root)) continue;
        for (const file of sourceFiles(root)) {
          for (const specifier of importedPaths(file)) {
            const target = resolveImport(file, specifier);
            if (target && isWithin(target, featuresRoot) && !isWithin(target, featureRoot)) {
              failures.add(`${relative(srcRoot, file)} -> ${specifier} (cross-feature contract)`);
            }
          }
          for (const dependency of runtimeDependencies(file)) {
            for (const specifier of importedPaths(dependency, true)) {
              const target = resolveImport(dependency, specifier);
              const allowed = target
                ? isWithin(target, join(featureRoot, "domain")) ||
                  (layer === "lesson" && isWithin(target, join(featureRoot, "lesson"))) ||
                  target === join(sharedRoot, "lab/saveStatus") ||
                  target === join(sharedRoot, "lab/saveStatus.ts") ||
                  target === join(sharedRoot, "lab/judging") ||
                  target === join(sharedRoot, "lab/judging.ts")
                : !/^(solid-js(?:\/|$)|@solidjs\/|@ui-sdk\/|react(?:-dom)?(?:\/|$)|node:)/.test(
                    specifier,
                  );
              if (!allowed) failures.add(`${relative(srcRoot, dependency)} -> ${specifier}`);
            }
          }
        }
      }
    }
    expect([...failures].sort()).toEqual([]);
  });
});

function runtimeDependencies(
  entry: string,
  includeDynamic = true,
  seen = new Set<string>(),
): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const specifier of importedPaths(entry, true, includeDynamic)) {
    const path = resolveImport(entry, specifier);
    if (!path) continue;
    const resolved = [
      path,
      `${path}.ts`,
      `${path}.tsx`,
      join(path, "index.ts"),
      join(path, "index.tsx"),
    ].find((p) => /\.tsx?$/.test(p) && existsSync(p));
    if (resolved) runtimeDependencies(resolved, includeDynamic, seen);
  }
  return seen;
}

it("does not load feature UI or secondary route pages in the initial module graph", () => {
  const dependencies = runtimeDependencies(join(srcRoot, "main.tsx"), false);
  const initialPages = new Set(["HomePage", "NotFoundPage", "LabErrorPage", "LabRedirectPage"]);
  const unexpected = [...dependencies]
    .map((file) => relative(srcRoot, file).split(sep))
    .filter(([root, folder, file, layer]) => {
      if (root === "features") return layer !== undefined && file !== "domain";
      return root === "app" && folder === "pages" && !initialPages.has(file.replace(/\.tsx$/, ""));
    });
  expect(unexpected).toEqual([]);
});

it("keeps every showcase dependency, including lazy imports, free of classroom and server code", () => {
  const dependencies = runtimeDependencies(join(srcRoot, "main.tsx"));
  expect(
    [...dependencies]
      .filter(
        (path) =>
          /[/\\](server|auth|api|classroom|task-sheets)[/\\]/.test(path) ||
          (/[/\\](App|router|HomePage|LabRedirectPage)\.tsx$/.test(path) &&
            isWithin(path, appRoot) &&
            !isWithin(path, join(appRoot, "showcase"))) ||
          /[/\\](?:Admin\w*|Teacher\w*|Task\w*|ClassMembers|StudentLabPreview|Login|Profile)Page\.tsx$/.test(
            path,
          ),
      )
      .map((path) => relative(srcRoot, path)),
  ).toEqual([]);
});

it("keeps labs independent of host authentication, routing, API clients and task sheets", () => {
  for (const id of LAB_IDS) {
    expect(
      violations(
        join(featuresRoot, id),
        (specifier, target) =>
          /shared\/(auth|api)|\/server\//.test(specifier) ||
          (target !== null &&
            (isWithin(target, appRoot) || isWithin(target, join(featuresRoot, "task-sheets")))),
      ),
    ).toEqual([]);
    for (const file of sourceFiles(join(featuresRoot, id))) {
      expect(readFileSync(file, "utf8")).not.toMatch(/useParams|\/api\/classes\//);
    }
  }
});

it("keeps the real decoding workspace independent of controller execution, lesson state and backend", () => {
  const dependencies = runtimeDependencies(join(featuresRoot, "decoding/ui/DecodingWorkspace.tsx"));
  const forbidden = [...dependencies].filter(
    (path) =>
      /[/\\](server|auth|api|controller|lesson)[/\\]/.test(path) ||
      /decoding[/\\]domain[/\\](stages)\.ts$/.test(path),
  );
  expect(forbidden.map((path) => relative(srcRoot, path))).toEqual([]);
});

it("keeps development previews independent of server data and live controller hooks", () => {
  for (const entry of ["decoding/preview/DecodingPreviewPage.tsx"]) {
    const dependencies = runtimeDependencies(join(featuresRoot, entry));
    expect(
      [...dependencies].filter((path) => /[/\\]server[/\\]|[/\\]controller[/\\]use/.test(path)),
    ).toEqual([]);
  }
});

it("keeps lab metadata, frontend registry, router, and server visibility registry in sync", () => {
  const metadataIds = Object.keys(labMetadata);
  expect(LAB_IDS).toEqual(metadataIds);
  expect(Object.keys(APP_LABS)).toEqual(metadataIds);
  expect(LAB_REGISTRY.map((entry) => entry.id)).toEqual(metadataIds);

  for (const id of LAB_IDS) {
    const reg = LAB_REGISTRY.find((entry) => entry.id === id);
    expect(reg?.stageCount).toBe(APP_LABS[id].dashboardStages.length);
    expect(router.match(`/labs/${id}`).length).toBeGreaterThan(0);
    expect(router.match(`/classes/c1/labs/${id}`).length).toBeGreaterThan(0);
  }
});

it("preserves lazy lab component preloading through the guarded route", () => {
  const route = appRoutes.find((entry) => entry.path === "/classes/:classId/labs/decoding");
  const guardedComponent = route?.component as { preload?: () => Promise<void> } | undefined;
  const labComponent = APP_LABS.decoding.component as unknown as {
    preload?: () => Promise<void> | undefined;
  };

  expect(labComponent.preload).toBeTypeOf("function");
  const originalPreload = labComponent.preload;
  const preload = vi.fn(() => new Promise<void>(() => {}));
  labComponent.preload = preload;
  try {
    expect(guardedComponent?.preload?.()).toBeUndefined();
    expect(preload).toHaveBeenCalledOnce();
  } finally {
    labComponent.preload = originalPreload;
  }
});
