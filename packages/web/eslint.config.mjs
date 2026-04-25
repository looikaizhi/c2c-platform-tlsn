import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/plugins/**",
      "docs/**",
      "next-env.d.ts",
    ],
  },
  // next/core-web-vitals does not pull in @typescript-eslint — safe to use compat here
  ...compat.extends("next/core-web-vitals"),
  // Replace compat.extends("next/typescript") with a native flat-config block that
  // imports the locally-installed @typescript-eslint v8, which supports ESLint 9's
  // sourceCode.getDeclaredVariables() API (v5 used the removed context version).
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      // Spread recommended rules from local v8
      ...tsPlugin.configs["recommended"].rules,
      // Mirror the two extra rules from next/typescript.js; ignore _-prefixed vars
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "@typescript-eslint/no-unused-expressions": "warn",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default eslintConfig;
