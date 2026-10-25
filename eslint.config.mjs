import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["fiveos-nui/**/*.{ts,tsx}", "src/app/**/opengraph-image.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["desktop/**/*.js", "scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist-desktop/**",
    "agent/dist/**",
    "agent/node_modules/**",
    "vendor/**",
    "fiveos-nui/node_modules/**",
    "vxcore/source/nui/assets/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
