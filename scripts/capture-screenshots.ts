#!/usr/bin/env npx tsx

/**
 * Automated Screenshot Capture Script
 * 
 * Captures screenshots of all routes for documentation purposes.
 * Uses Playwright for browser automation.
 * 
 * Usage:
 *   pnpm screenshots                    # Capture all routes
 *   pnpm screenshots --route /dashboard # Capture specific route
 *   pnpm screenshots --mobile           # Include mobile views
 *   pnpm screenshots --diff             # Compare with previous
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface Route {
  path: string;
  file: string;
  auth?: 'none' | 'user' | 'admin';
}

interface ScreenshotConfig {
  outputDir: string;
  viewports: { name: string; width: number; height: number }[];
  baseUrl: string;
  routes: Route[];
}

const DEFAULT_VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

const DESKTOP_ONLY = [
  { name: 'desktop', width: 1920, height: 1080 },
];

function loadRoutes(): Route[] {
  const manifestPath = 'routes-manifest.json';
  
  if (!fs.existsSync(manifestPath)) {
    console.log('⚠️  No routes-manifest.json found. Using default routes.');
    return [
      { path: '/', file: '_index.tsx', auth: 'none' },
      { path: '/login', file: 'login.tsx', auth: 'none' },
      { path: '/register', file: 'register.tsx', auth: 'none' },
      { path: '/dashboard', file: 'dashboard._index.tsx', auth: 'user' },
      { path: '/admin', file: 'admin._index.tsx', auth: 'admin' },
    ];
  }
  
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const routes: Route[] = [];
    
    for (const module of manifest.modules || []) {
      for (const route of module.routes || []) {
        // Skip routes with dynamic params for screenshots
        if (!route.path.includes(':')) {
          routes.push({
            path: route.path,
            file: route.file,
            auth: route.auth || 'user',
          });
        }
      }
    }
    
    return routes;
  } catch {
    console.error('Error reading manifest');
    return [];
  }
}

function ensureOutputDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizePath(routePath: string): string {
  return routePath.replace(/\//g, '_').replace(/^_/, '') || 'home';
}

async function generatePlaywrightScript(config: ScreenshotConfig): Promise<string> {
  const timestamp = new Date().toISOString().split('T')[0];
  
  return `
import { chromium } from 'playwright';

async function captureScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const baseUrl = '${config.baseUrl}';
  const outputDir = '${config.outputDir}';
  
  const routes = ${JSON.stringify(config.routes, null, 2)};
  
  const viewports = ${JSON.stringify(config.viewports, null, 2)};
  
  console.log('📸 Starting screenshot capture...');
  console.log(\`   Base URL: \${baseUrl}\`);
  console.log(\`   Output: \${outputDir}\`);
  console.log(\`   Routes: \${routes.length}\`);
  console.log('');
  
  // Login if needed (for authenticated routes)
  const hasAuthRoutes = routes.some(r => r.auth !== 'none');
  if (hasAuthRoutes) {
    console.log('🔐 Logging in...');
    await page.goto(\`\${baseUrl}/login\`);
    await page.fill('input[name="email"]', 'admin@test.com');
    await page.fill('input[name="password"]', 'Demo123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});
    console.log('   ✅ Logged in\\n');
  }
  
  let captured = 0;
  let failed = 0;
  
  for (const route of routes) {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      const filename = \`\${route.path.replace(/\\//g, '_').replace(/^_/, '') || 'home'}_\${viewport.name}.png\`;
      const filepath = \`\${outputDir}/\${filename}\`;
      
      try {
        await page.goto(\`\${baseUrl}\${route.path}\`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1000); // Wait for animations
        await page.screenshot({ path: filepath, fullPage: true });
        console.log(\`   ✅ \${route.path} (\${viewport.name})\`);
        captured++;
      } catch (error) {
        console.log(\`   ❌ \${route.path} (\${viewport.name}) - \${error.message}\`);
        failed++;
      }
    }
  }
  
  await browser.close();
  
  console.log('');
  console.log('📊 Screenshot Summary');
  console.log('─────────────────────');
  console.log(\`   Captured: \${captured}\`);
  console.log(\`   Failed: \${failed}\`);
  console.log(\`   Output: \${outputDir}\`);
  
  // Generate index.html for viewing
  const indexHtml = generateIndexHtml(routes, viewports, outputDir);
  require('fs').writeFileSync(\`\${outputDir}/index.html\`, indexHtml);
  console.log(\`   Index: \${outputDir}/index.html\`);
}

function generateIndexHtml(routes, viewports, outputDir) {
  return \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Route Screenshots</title>
  <style>
    body { font-family: system-ui; padding: 2rem; background: #1a1a1a; color: white; }
    h1 { margin-bottom: 2rem; }
    .route { margin-bottom: 3rem; border-bottom: 1px solid #333; padding-bottom: 2rem; }
    .route h2 { color: #60a5fa; }
    .screenshots { display: flex; gap: 1rem; flex-wrap: wrap; }
    .screenshot { background: #2a2a2a; border-radius: 8px; overflow: hidden; }
    .screenshot img { max-width: 400px; height: auto; display: block; }
    .screenshot .label { padding: 0.5rem; text-align: center; font-size: 0.875rem; color: #888; }
  </style>
</head>
<body>
  <h1>📸 Route Screenshots</h1>
  <p>Generated: \${new Date().toISOString()}</p>
  \${routes.map(route => \`
    <div class="route">
      <h2>\${route.path}</h2>
      <div class="screenshots">
        \${viewports.map(vp => \`
          <div class="screenshot">
            <img src="\${route.path.replace(/\\//g, '_').replace(/^_/, '') || 'home'}_\${vp.name}.png" alt="\${route.path} \${vp.name}">
            <div class="label">\${vp.name} (\${vp.width}x\${vp.height})</div>
          </div>
        \`).join('')}
      </div>
    </div>
  \`).join('')}
</body>
</html>\`;
}

captureScreenshots().catch(console.error);
`;
}

async function main() {
  const args = process.argv.slice(2);
  const includeMobile = args.includes('--mobile');
  const specificRoute = args.find((a, i) => args[i - 1] === '--route');
  
  console.log('📸 Screenshot Capture Tool');
  console.log('══════════════════════════\n');
  
  // Check if Playwright is installed
  try {
    execSync('npx playwright --version', { stdio: 'pipe' });
  } catch {
    console.log('⚠️  Playwright not found. Installing...');
    execSync('pnpm add -D playwright @playwright/test', { stdio: 'inherit' });
    execSync('npx playwright install chromium', { stdio: 'inherit' });
  }
  
  const routes = loadRoutes();
  const filteredRoutes = specificRoute 
    ? routes.filter(r => r.path.includes(specificRoute))
    : routes;
  
  if (filteredRoutes.length === 0) {
    console.log('❌ No routes to capture');
    return;
  }
  
  const config: ScreenshotConfig = {
    outputDir: 'docs/screenshots',
    viewports: includeMobile ? DEFAULT_VIEWPORTS : DESKTOP_ONLY,
    baseUrl: process.env.APP_URL || 'http://localhost:3000',
    routes: filteredRoutes,
  };
  
  ensureOutputDir(config.outputDir);
  
  console.log(`Routes to capture: ${filteredRoutes.length}`);
  console.log(`Viewports: ${config.viewports.map(v => v.name).join(', ')}`);
  console.log(`Output: ${config.outputDir}\n`);
  
  // Generate and run the Playwright script
  const script = await generatePlaywrightScript(config);
  const scriptPath = 'scripts/_screenshot-runner.ts';
  fs.writeFileSync(scriptPath, script);
  
  console.log('Running Playwright...\n');
  
  try {
    execSync(`npx tsx ${scriptPath}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Screenshot capture failed');
  } finally {
    // Cleanup temp script
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
  }
}

main();
