import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier/flat";
import nextTs from "eslint-config-next/typescript";
import eslintNextPlugin from "@next/eslint-plugin-next";

const eslintConfig = defineConfig([
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      next: eslintNextPlugin,
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/ban-ts-ignore": "off",
    },
  },
  ...nextTs,
  prettier,
  ...nextVitals,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
