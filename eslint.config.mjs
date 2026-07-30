import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output, not source: `npm run build:widget` bundles
    // widget/src/index.ts (which IS linted) into this minified file.
    "public/widget.js",
    "src/generated/**",
  ]),
  {
    // Plain CommonJS Node script that runs outside the Next bundle (it's what
    // produces public/widget.js), so ESM-only rules don't apply to it.
    files: ["widget/build.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
