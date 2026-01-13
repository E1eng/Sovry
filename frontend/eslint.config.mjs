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
    "next.config.js",
    "next-env.d.ts",
  ]),
  // Project-specific rule overrides
  {
    rules: {
      // Allow use of `any` for Story SDK and external API responses
      "@typescript-eslint/no-explicit-any": "off",
      // Do not force let -> const changes
      "prefer-const": "off",
      // TradingChart safely sets state inside an effect that does not depend on that state
      "react-hooks/set-state-in-effect": "off",
      // Relax unused vars, but still catch obviously unused names
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
