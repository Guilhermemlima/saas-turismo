import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The service-role client bypasses RLS: only background jobs (and later webhooks/admin) may use it.
const serviceClientRestriction = {
  name: "@/server/db/service-client",
  message: "Service-role client is restricted to background jobs.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Customer, AI and message content must never be rendered as raw HTML (XSS).
      "react/no-danger": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/jobs/**", "src/server/db/service-client.ts", "src/app/api/internal/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: [serviceClientRestriction] }],
    },
  },
  {
    // Server-only infrastructure must not leak into client components (declared last: it wins for these files).
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [serviceClientRestriction],
          patterns: [{ group: ["@/server/*", "!@/server/db/database.types"], message: "Client/UI code cannot import server modules." }],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "supabase/**"]),
]);

export default eslintConfig;
