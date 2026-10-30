import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
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
      "react-refresh/only-export-components": "off",
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
    files: ["src/features/**/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "react-dom"],
          patterns: [
            { group: ["**/ui/**"] },
            { group: ["**/app/**"] },
            { group: ["**/features/**"] },
            { group: ["**/controller/**"] },
            { group: ["**/lesson/**"] },
            {
              // saveStatus is a pure module lessons may call; the rest of
              // shared/lab is hooks/UI and stays type-only from here.
              group: [
                "**/shared/api/**",
                "**/shared/auth/**",
                "**/shared/lab/!(saveStatus*)",
                "**/shared/lab/*/**",
              ],
              allowTypeImports: true,
            },
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
          paths: ["react", "react-dom", "@tanstack/react-router"],
          patterns: [
            { group: ["**/app/**"] },
            { group: ["**/ui/**"] },
            { group: ["**/controller/**"] },
            {
              // saveStatus is a pure module lessons may call; the rest of
              // shared/lab is hooks/UI and stays type-only from here.
              group: [
                "**/shared/api/**",
                "**/shared/auth/**",
                "**/shared/lab/!(saveStatus*)",
                "**/shared/lab/*/**",
              ],
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
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
    // Pilot boundary: other lab pages still own their application logic.
    files: ["src/features/cpu/ui/**/*.{ts,tsx}", "src/features/decoding/ui/**/*.{ts,tsx}"],
    ignores: ["src/features/cpu/ui/CpuLabPage.tsx", "src/features/decoding/ui/DecodingLabPage.tsx"],
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
          paths: ["react", "react-dom"],
          patterns: [
            { group: ["react/**"] },
            { group: ["react-dom/**"] },
            { group: ["**/ui/**"] },
            { group: ["**/controller/**"] },
            { group: ["**/preview/**"] },
            { group: ["**/shared/auth/**"] },
            { group: ["**/shared/lab/**"] },
          ],
        },
      ],
    },
  },
);
