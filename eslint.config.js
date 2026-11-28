import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import { builtinModules } from "node:module";
import tseslint from "typescript-eslint";

const pureInfrastructureImports = {
  // Only saveStatus is a runtime dependency; infrastructure contracts stay type-only.
  regex:
    "(?:^|/)shared/(?:api|auth|layout)(?:/|$)|(?:^|/)shared/lab(?:$|/(?!(?:saveStatus|judging)(?:\\.ts)?$))",
  allowTypeImports: true,
};

export default tseslint.config(
  {
    ignores: [
      "dist",
      "dist-classroom",
      "dist-server",
      "node_modules",
      "coverage",
      // Gitignored local-only material (AGENTS.md) — not our code.
      "local",
      "**/*.test.{ts,tsx}",
      "src/test/**",
      // Vendored runtime assets (e.g. public/vendor/pyodide) — not our code.
      "public/vendor/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  eslintPluginPrettier,
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["**/app/**"] }, { group: ["**/features/**"] }],
        },
      ],
    },
  },
  {
    files: ["src/features/**/domain/**/*.{ts,tsx}", "src/features/**/lesson/**/*.{ts,tsx}"],
    linterOptions: {
      noInlineConfig: true,
    },
    rules: {
      "max-lines": ["error", { max: 800 }],
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
          message:
            "Validate unknown data instead of bypassing the contract with a double assertion.",
        },
        {
          selector: "ImportExpression",
          message:
            "Pure domain/lesson modules use static imports so their dependencies stay checkable.",
        },
      ],
    },
  },
  {
    files: ["src/features/**/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          globals: [
            "window",
            "document",
            "navigator",
            "fetch",
            "localStorage",
            "sessionStorage",
            "crypto",
            "performance",
            "Date",
            "setTimeout",
            "setInterval",
          ],
          checkGlobalObject: true,
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Pass a seeded RNG into domain code." },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "solid-js",
            "@solidjs/web",
            "@solidjs/router",
            "@ui-sdk/solid",
            "react",
            "react-dom",
            ...builtinModules,
          ],
          patterns: [
            { group: ["node:*"] },
            {
              group: [
                "solid-js/**",
                "@solidjs/web/**",
                "@solidjs/router/**",
                "@ui-sdk/solid/**",
                "react/**",
                "react-dom/**",
              ],
            },
            { group: ["**/server", "**/server/**", "**/preview", "**/preview/**"] },
            { group: ["**/ui/**"] },
            { group: ["**/app/**"] },
            { group: ["**/features/**"] },
            { group: ["**/controller/**"] },
            { group: ["**/lesson/**"] },
            pureInfrastructureImports,
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["**/App"] }, { group: ["**/app/**"] }],
        },
      ],
    },
  },
  {
    files: ["src/features/**/lesson/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "solid-js",
            "@solidjs/web",
            "@solidjs/router",
            "@ui-sdk/solid",
            "react",
            "react-dom",
            ...builtinModules,
          ],
          patterns: [
            { group: ["node:*"] },
            {
              group: [
                "solid-js/**",
                "@solidjs/web/**",
                "@solidjs/router/**",
                "@ui-sdk/solid/**",
                "react/**",
                "react-dom/**",
              ],
            },
            { group: ["**/server", "**/server/**", "**/preview", "**/preview/**"] },
            { group: ["**/app/**"] },
            { group: ["**/ui/**"] },
            { group: ["**/controller/**"] },
            pureInfrastructureImports,
          ],
        },
      ],
    },
  },
  {
    // Curated data tables, not handwritten calculation/control flow.
    files: [
      "src/features/logistic-regression/domain/cnLexicon.ts",
      "src/features/logistic-regression/domain/corpusData.ts",
    ],
    rules: { "max-lines": "off" },
  },
  {
    files: ["src/features/**/controller/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/ui/**"] },
            { group: ["**/preview/**"] },
            { group: ["**/app/**"] },
            { group: ["**/*.css"] },
            { group: ["**/server/**"] },
          ],
        },
      ],
    },
  },
  {
    // Decoding stays the one controller/preview lab; its UI only renders the view model.
    files: ["src/features/decoding/ui/**/*.{ts,tsx}"],
    ignores: ["src/features/decoding/ui/DecodingLabPage.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/app/**"] },
            { group: ["**/server/**"] },
            { group: ["**/preview/**"] },
            { group: ["**/shared/api/**"] },
            { group: ["**/shared/auth"] },
            { group: ["**/shared/auth/**"] },
            { group: ["**/shared/lab/use*"] },
            {
              group: [
                "**/controller/**",
                "**/lesson/**",
                "**/domain/machine*",
                "**/domain/stages*",
                "**/domain/fixtures*",
              ],
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**/preview/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/server/**"] },
            { group: ["**/shared/api/**"] },
            { group: ["**/shared/auth"] },
            { group: ["**/shared/auth/**"] },
            { group: ["**/shared/lab/use*"] },
            { group: ["**/controller/use*"] },
          ],
        },
      ],
    },
  },
  {
    files: ["server/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "solid-js",
            "@solidjs/web",
            "@solidjs/router",
            "@ui-sdk/solid",
            "react",
            "react-dom",
          ],
          patterns: [
            { group: ["solid-js/**"] },
            { group: ["@solidjs/web/**"] },
            { group: ["@solidjs/router/**"] },
            { group: ["@ui-sdk/solid/**"] },
            { group: ["react/**"] },
            { group: ["react-dom/**"] },
            { group: ["**/ui/**"] },
            { group: ["**/controller/**"] },
            { group: ["**/preview/**"] },
            { group: ["**/shared/auth/**"] },
            // labMetadata is pure catalog data shared with the server; the rest
            // of shared/lab holds SolidJS hooks/UI and stays off-limits here.
            { regex: "(?:^|/)shared/lab(?:$|/(?!(?:labMetadata|judging)(?:\\.ts)?$))" },
          ],
        },
      ],
    },
  },
);
