#!/usr/bin/env node
/**
 * Guards global lab styles: a bare `.class` selector should be declared once.
 * Complex/descendant selectors are intentionally ignored; scope feature-only
 * rules under the lab root instead of relying on global load order.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url);
const SRC = new URL("../src", import.meta.url);

/**
 * Shared top-level classes that are intentionally declared in more than one
 * file. Every entry needs a reason; empty means no exemptions.
 */
const ALLOWLIST = [];

const TOP_LEVEL_RULE_AT_RULES = new Set([
  "@container",
  "@layer",
  "@media",
  "@scope",
  "@starting-style",
  "@supports",
]);

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function findBlockEnd(css, openIndex) {
  let depth = 1;
  for (let index = openIndex + 1; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Unbalanced CSS block");
}

function declarationsOf(block) {
  const declarations = new Map();
  for (const raw of block.split(";")) {
    const declaration = raw.trim();
    if (!declaration || declaration.includes("{")) continue;
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (!property || !value) continue;
    const values = declarations.get(property) ?? new Set();
    values.add(value);
    declarations.set(property, values);
  }
  return declarations;
}

function recordRuleSelectors(selectorText, line, file, context, declarations, occurrences) {
  const selectors = selectorText.split(",").map((selector) => selector.trim());
  for (const selector of selectors) {
    if (!/^\.[A-Za-z_][\w-]*$/.test(selector)) continue;
    const entries = occurrences.get(selector) ?? [];
    entries.push({ file, line, context, declarations });
    occurrences.set(selector, entries);
  }
}

function parseRules(css, start, end, file, context, occurrences) {
  let index = start;
  while (index < end) {
    while (index < end && /\s/.test(css[index])) index += 1;
    if (index >= end) break;

    const preludeStart = index;
    while (index < end && css[index] !== "{" && css[index] !== "}" && css[index] !== ";") {
      index += 1;
    }
    if (index >= end) break;
    if (css[index] === ";") {
      index += 1;
      continue;
    }
    if (css[index] === "}") break;

    const prelude = css.slice(preludeStart, index).trim();
    const line = css.slice(0, preludeStart).split("\n").length;
    const blockEnd = findBlockEnd(css, index);
    if (prelude.startsWith("@")) {
      const atRule = prelude.split(/\s+/)[0].toLowerCase();
      if (TOP_LEVEL_RULE_AT_RULES.has(atRule)) {
        parseRules(css, index + 1, blockEnd, file, [...context, prelude], occurrences);
      }
    } else {
      const declarations = declarationsOf(css.slice(index + 1, blockEnd));
      recordRuleSelectors(prelude, line, file, context, declarations, occurrences);
    }
    index = blockEnd + 1;
  }
}

async function cssFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await cssFiles(path)));
    else if (entry.name.endsWith(".css")) files.push(path);
  }
  return files;
}

function allowlisted(selector, entries) {
  const rule = ALLOWLIST.find((item) => item.selector === selector);
  if (!rule) return false;
  const files = new Set(entries.map((entry) => entry.file));
  return rule.files.length === files.size && rule.files.every((file) => files.has(file));
}

const occurrences = new Map();
const root = ROOT.pathname;
for (const absolutePath of await cssFiles(SRC.pathname)) {
  const file = relative(root, absolutePath);
  const css = stripComments(await readFile(absolutePath, "utf8"));
  parseRules(css, 0, css.length, file, [], occurrences);
}

const problems = [];
for (const [selector, entries] of occurrences) {
  const files = new Set(entries.map((entry) => entry.file));
  const byFileAndContext = new Map();
  for (const entry of entries) {
    const key = `${entry.file}\0${entry.context.join("\0")}`;
    const group = byFileAndContext.get(key) ?? [];
    group.push(entry);
    byFileAndContext.set(key, group);
  }
  const duplicateInFile = [...byFileAndContext.values()].some((group) => {
    if (group.length < 2) return false;
    const valuesByProperty = new Map();
    for (const entry of group) {
      for (const [property, values] of entry.declarations) {
        const all = valuesByProperty.get(property) ?? new Set();
        values.forEach((value) => all.add(value));
        valuesByProperty.set(property, all);
      }
    }
    return [...valuesByProperty.values()].some((values) => values.size > 1);
  });
  const duplicateAcrossFiles = files.size > 1;
  if (!duplicateInFile && !duplicateAcrossFiles) continue;
  if (!duplicateInFile && allowlisted(selector, entries)) continue;
  problems.push({ selector, entries });
}

if (problems.length === 0) {
  console.log("CSS duplicate check: no bare top-level class conflicts.");
  process.exit(0);
}

console.error(
  "CSS duplicate check failed. Scope feature styles under the lab root or share one declaration.\n",
);
for (const { selector, entries } of problems) {
  console.error(`  ${selector}`);
  for (const { file, line } of entries) console.error(`    ${file}:${line}`);
}
console.error(`\n${problems.length} conflicting selector(s).`);
process.exit(1);
