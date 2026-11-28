import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const KIB = 1024;
const MIB = 1024 * KIB;
const GZIP_OPTIONS = { level: 9 };

export const BUNDLE_BUDGETS = {
  entryGzipBytes: 92 * KIB,
  routeGzipBytes: {
    calculator: 138 * KIB,
    "color-quantization": 258 * KIB,
    decoding: 252 * KIB,
    "image-sampling": 262 * KIB,
    "logistic-regression": 416 * KIB,
    "lunch-shift": 208 * KIB,
    "stats-foundations": 140 * KIB,
  },
  assetGzipBytes: {
    "embed-worker": 164 * KIB,
    "formula-renderer": 80 * KIB,
    "python-code": 120 * KIB,
  },
};

export const CLASSROOM_ENTRY_GZIP_BYTES = 140 * KIB;

const ASSET_BUDGETS = [
  {
    id: "embed-worker",
    label: "AI intake Worker",
    pattern: /^assets\/embed\.worker-.*\.js$/,
  },
  {
    id: "formula-renderer",
    label: "KaTeX renderer",
    pattern: /^assets\/MathFormula-.*\.js$/,
  },
  {
    id: "python-code",
    label: "Python editor runtime",
    pattern: /^assets\/pythonCode-.*\.js$/,
  },
];

function toPosixPath(path) {
  return path.split(sep).join("/");
}

function gzipSize(buffer) {
  return gzipSync(buffer, GZIP_OPTIONS).length;
}

export function findEntryKey(manifest) {
  return (
    Object.keys(manifest).find((key) => key === "index.html" && manifest[key].isEntry) ??
    Object.keys(manifest).find((key) => manifest[key].isEntry)
  );
}

export function findRouteKeys(manifest) {
  const routes = new Map();
  for (const [key, entry] of Object.entries(manifest)) {
    if (!entry.isDynamicEntry) continue;
    const match = /^src\/features\/([^/]+)\/ui\/[^/]+LabPage\.tsx$/.exec(key);
    if (match) routes.set(match[1], key);
  }
  return routes;
}

export function collectStaticClosure(manifest, rootKey) {
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    for (const imported of manifest[key]?.imports ?? []) visit(imported);
  };
  visit(rootKey);
  return seen;
}

export function collectJsFiles(manifest, keys) {
  const files = new Set();
  for (const key of keys) {
    const file = manifest[key]?.file;
    if (file?.endsWith(".js")) files.add(file);
  }
  return [...files].sort();
}

export function measureFiles(distDir, files) {
  let raw = 0;
  let gzip = 0;
  for (const file of files) {
    const buffer = readFileSync(join(distDir, file));
    raw += buffer.length;
    gzip += gzipSize(buffer);
  }
  return { raw, gzip };
}

function directoryStats(directory) {
  if (!existsSync(directory)) return { bytes: 0, files: 0 };
  let bytes = 0;
  let files = 0;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      const nested = directoryStats(path);
      bytes += nested.bytes;
      files += nested.files;
    } else {
      bytes += stat.size;
      files += 1;
    }
  }
  return { bytes, files };
}

function manifestSourcesByFile(manifest) {
  const sources = new Map();
  for (const [key, entry] of Object.entries(manifest)) {
    const list = sources.get(entry.file) ?? [];
    list.push(key);
    sources.set(entry.file, list);
  }
  return sources;
}

function listLargestChunks(distDir, manifest) {
  const sources = manifestSourcesByFile(manifest);
  const files = Object.values(manifest)
    .map((entry) => entry.file)
    .filter((file, index, all) => file.endsWith(".js") && all.indexOf(file) === index);
  return files
    .map((file) => {
      const buffer = readFileSync(join(distDir, file));
      return {
        file,
        gzip: gzipSize(buffer),
        raw: buffer.length,
        sources: sources.get(file) ?? [],
      };
    })
    .sort((a, b) => b.gzip - a.gzip)
    .slice(0, 5);
}

export function buildBundleReport(distDir) {
  const manifestPath = join(distDir, ".vite", "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`missing Vite manifest: ${manifestPath}; run the build first`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entryKey = findEntryKey(manifest);
  if (!entryKey) throw new Error("Vite manifest has no entry");

  const entryKeys = collectStaticClosure(manifest, entryKey);
  const entryFiles = collectJsFiles(manifest, entryKeys);
  const routes = [];
  const routeKeys = findRouteKeys(manifest);

  for (const [labId, routeKey] of [...routeKeys].sort(([a], [b]) => a.localeCompare(b))) {
    const routeKeysForLab = collectStaticClosure(manifest, routeKey);
    const files = collectJsFiles(
      manifest,
      [...routeKeysForLab].filter((key) => !entryKeys.has(key)),
    );
    routes.push({ labId, files, ...measureFiles(distDir, files) });
  }

  const assets = [];
  for (const asset of ASSET_BUDGETS) {
    const file = Object.values(manifest)
      .map((entry) => entry.file)
      .find((candidate) => asset.pattern.test(candidate));
    if (file) {
      assets.push({
        id: asset.id,
        label: asset.label,
        file,
        ...measureFiles(distDir, [file]),
      });
    }
  }

  const jsFiles = readdirSync(join(distDir, "assets"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => toPosixPath(join("assets", file)));
  for (const asset of ASSET_BUDGETS) {
    if (assets.some((item) => item.id === asset.id)) continue;
    const file = jsFiles.find((candidate) => asset.pattern.test(candidate));
    if (file) {
      assets.push({
        id: asset.id,
        label: asset.label,
        file,
        ...measureFiles(distDir, [file]),
      });
    }
  }

  return {
    distDir,
    entry: { files: entryFiles, ...measureFiles(distDir, entryFiles) },
    routes,
    assets,
    missingRouteBudgets: Object.keys(BUNDLE_BUDGETS.routeGzipBytes).filter(
      (labId) => !routeKeys.has(labId),
    ),
    missingAssets: ASSET_BUDGETS.filter(
      (asset) => !assets.some((item) => item.id === asset.id),
    ).map((asset) => asset.id),
    vendor: directoryStats(join(distDir, "vendor")),
    largestChunks: listLargestChunks(distDir, manifest),
  };
}

export function evaluateBundleReport(report, budgets = BUNDLE_BUDGETS) {
  const violations = [];
  if (report.entry.gzip > budgets.entryGzipBytes) {
    violations.push(`entry JS: ${report.entry.gzip} B gzip > ${budgets.entryGzipBytes} B budget`);
  }
  for (const labId of report.missingRouteBudgets) {
    violations.push(`${labId}: route chunk missing from manifest`);
  }
  for (const route of report.routes) {
    const budget = budgets.routeGzipBytes[route.labId];
    if (budget === undefined) {
      violations.push(`${route.labId}: route has no budget`);
    } else if (route.gzip > budget) {
      violations.push(`${route.labId} route JS: ${route.gzip} B gzip > ${budget} B budget`);
    }
  }
  for (const assetId of report.missingAssets) {
    violations.push(`${assetId}: expected asset chunk missing from build`);
  }
  for (const asset of report.assets) {
    const budget = budgets.assetGzipBytes[asset.id];
    if (budget === undefined) {
      violations.push(`${asset.id}: asset has no budget`);
    } else if (asset.gzip > budget) {
      violations.push(`${asset.label}: ${asset.gzip} B gzip > ${budget} B budget`);
    }
  }
  if (report.vendor.bytes === 0) {
    violations.push("dist/vendor: offline model assets are missing");
  }
  return violations;
}

function formatSize(bytes) {
  if (bytes >= MIB) return `${(bytes / MIB).toFixed(1)} MiB`;
  return `${(bytes / KIB).toFixed(1)} KiB`;
}

function formatSourceList(sources) {
  if (sources.length === 0) return "build output";
  return sources.slice(0, 2).join(", ");
}

export function formatReport(report, violations) {
  const lines = [
    `Bundle budget: ${relative(process.cwd(), report.distDir) || report.distDir}`,
    `  entry JS: ${formatSize(report.entry.gzip)} gzip / ${formatSize(report.entry.raw)} raw`,
    `  route footprints (incremental JS after entry):`,
    ...report.routes.map(
      (route) =>
        `    ${route.labId.padEnd(20)} ${formatSize(route.gzip).padStart(10)} gzip / ${formatSize(route.raw)} raw`,
    ),
    `  heavy chunks:`,
    ...report.assets.map(
      (asset) => `    ${asset.label.padEnd(20)} ${formatSize(asset.gzip).padStart(10)} gzip`,
    ),
    `  public/vendor (excluded from JS budget): ${formatSize(report.vendor.bytes)} / ${report.vendor.files} files`,
  ];

  if (violations.length > 0) {
    lines.push("", "Bundle budget exceeded:");
    for (const violation of violations) lines.push(`  - ${violation}`);
    lines.push("", "Largest JS chunks:");
    for (const chunk of report.largestChunks) {
      lines.push(
        `  ${formatSize(chunk.gzip).padStart(10)} gzip / ${formatSize(chunk.raw).padStart(10)} raw  ${chunk.file}  <- ${formatSourceList(chunk.sources)}`,
      );
    }
  }
  return lines.join("\n");
}

export function budgetsForDist(distDir) {
  if (!distDir.includes("classroom")) return BUNDLE_BUDGETS;
  return { ...BUNDLE_BUDGETS, entryGzipBytes: CLASSROOM_ENTRY_GZIP_BYTES };
}

export function runBundleBudget(distDir = "dist", budgets = budgetsForDist(distDir)) {
  const report = buildBundleReport(distDir);
  const violations = evaluateBundleReport(report, budgets);
  return { report, violations };
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const distDir = process.argv[2] ?? process.env.BUNDLE_DIST ?? "dist";
  try {
    const { report, violations } = runBundleBudget(distDir);
    console.log(formatReport(report, violations));
    if (violations.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`bundle budget: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
