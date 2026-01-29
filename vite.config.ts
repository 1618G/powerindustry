import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode, process.cwd(), '');
  
  // Parse port from APP_URL or use default
  let port = 3000;
  if (env.APP_URL) {
    try {
      const url = new URL(env.APP_URL);
      port = parseInt(url.port) || 3000;
    } catch {
      // Use default if URL parsing fails
    }
  }

  return {
    plugins: [
      remix({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
        },
      }),
      tsconfigPaths(),
    ],
    server: {
      port,
    },
  };
});

