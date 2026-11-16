import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { LAB_REGISTRY } from "../../server/labs.ts";
import { LAB_IDS, labMetadata } from "../shared/lab/labMetadata.ts";
import { APP_LABS } from "./labRegistry.ts";
import { router } from "./router.tsx";

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

function importedPaths(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
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
  it("keeps shared infrastructure independent of app and features", () => {
    expect(
      violations(sharedRoot, (_specifier, resolved) => {
        return (
          resolved !== null && (isWithin(resolved, appRoot) || isWithin(resolved, featuresRoot))
        );
      }),
    ).toEqual([]);
  });

  it("keeps feature domain logic independent of React and UI", () => {
    const domainFiles = sourceFiles(featuresRoot).filter((file) => {
      const parts = relative(featuresRoot, file).split(sep);
      return parts[1] === "domain";
    });
    const violationsFound = domainFiles.flatMap((file) =>
      importedPaths(file)
        .filter((specifier) => {
          const resolved = resolveImport(file, specifier);
          return (
            /^react(?:-|\/|$)/.test(specifier) ||
            (resolved !== null && /(?:^|[/\\])ui(?:[/\\]|$)/.test(resolved))
          );
        })
        .map((specifier) => `${relative(srcRoot, file)} -> ${specifier}`),
    );
    expect(violationsFound).toEqual([]);
  });
});

/** Resolve runtime edges, including re-exports and dynamic imports; ignore type-only contracts. */
function runtimeDependencies(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const source = ts.createSourceFile(
    entry,
    readFileSync(entry, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const specifiers: string[] = [];
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (clause?.isTypeOnly) return;
        if (
          clause &&
          !clause.name &&
          clause.namedBindings &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.every((e) => e.isTypeOnly)
        )
          return;
      } else if (node.isTypeOnly) return;
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    )
      specifiers.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const specifier of specifiers) {
    const path = resolveImport(entry, specifier);
    if (!path) continue;
    const resolved = [
      path,
      `${path}.ts`,
      `${path}.tsx`,
      join(path, "index.ts"),
      join(path, "index.tsx"),
    ].find((p) => /\.tsx?$/.test(p) && existsSync(p));
    if (resolved) runtimeDependencies(resolved, seen);
  }
  return seen;
}

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
    expect(router.routesByPath[`/labs/${id}`]).toBeDefined();
    expect(router.routesByPath[`/classes/$classId/labs/${id}`]).toBeDefined();
  }
});

it("preserves lazy lab component preloading through the guarded route", () => {
  const route = router.routesByPath["/classes/$classId/labs/decoding"];
  const guardedComponent = route?.options.component as { preload?: () => Promise<void> };
  const labComponent = APP_LABS.decoding.component as unknown as {
    preload?: () => Promise<void> | undefined;
  };

  expect(labComponent.preload).toBeTypeOf("function");
  const originalPreload = labComponent.preload;
  const preload = vi.fn(() => new Promise<void>(() => {}));
  labComponent.preload = preload;
  try {
    expect(guardedComponent.preload?.()).toBeUndefined();
    expect(preload).toHaveBeenCalledOnce();
  } finally {
    labComponent.preload = originalPreload;
  }
});
