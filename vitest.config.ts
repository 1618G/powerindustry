/// <reference types="vitest" />
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Global test settings
    globals: true,
    environment: "node",
    
    // Include patterns
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "build", ".cache"],
    
    // Coverage settings
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      exclude: [
        "node_modules/",
        "build/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/types/**",
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },
    
    // Setup files
    setupFiles: ["./tests/setup.ts"],
    
    // Timeout
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Reporter
    reporters: ["verbose"],
    
    // Pool settings for better isolation
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
