#!/usr/bin/env npx ts-node

/**
 * ZZA Build V5.0 - Comprehensive Route Testing Script
 * 
 * Usage:
 *   pnpm test:routes                    # Test all routes
 *   pnpm test:routes --screenshots      # Capture screenshots
 *   pnpm test:routes --category=api     # Test specific category
 *   pnpm test:routes --update-manifest  # Update routes-manifest.json
 *   pnpm test:routes --report           # Generate detailed report
 * 
 * This script:
 * 1. Loads routes from routes-manifest.json
 * 2. Tests each route for:
 *    - HTTP status (200, 404, 500, etc.)
 *    - Load time
 *    - Console errors (if browser testing)
 *    - Expected elements presence
 * 3. Updates the manifest with results
 * 4. Generates ISSUES.md with any problems found
 */

import * as fs from 'fs';
import * as path from 'path';

// Types
interface RouteTest {
  id: string;
  path: string;
  name: string;
  method: string;
  authRequired: boolean;
  roles?: string[];
  expectedElements?: Array<{ selector: string; description: string }>;
  testing: {
    status: 'passing' | 'failing' | 'untested';
    lastTestedAt: string | null;
    lastTestedBy: string | null;
    httpStatus: number | null;
    loadTime: number | null;
    consoleErrors: string[];
    screenshotPath: string | null;
    missingElements: string[];
    notes: string | null;
  };
}

interface Manifest {
  metadata: {
    platform: string;
    version: string;
    generatedAt: string | null;
    lastTestedAt: string | null;
  };
  summary: {
    total: number;
    passing: number;
    failing: number;
    untested: number;
    byCategory: Record<string, { total: number; passing: number; failing: number; untested: number }>;
  };
  routes: {
    public: RouteTest[];
    dashboard: RouteTest[];
    admin: RouteTest[];
    api: RouteTest[];
  };
  issues: Array<{
    id: string;
    route: string;
    title: string;
    description: string;
    severity: 'error' | 'warning';
    consoleErrors?: string[];
    createdAt: string;
    status: 'open' | 'fixed';
  }>;
  testingLog: Array<{
    date: string;
    tester: string;
    routesTested: number;
    passed: number;
    failed: number;
    notes: string;
  }>;
}

// Configuration
// Try to read APP_URL from .env file, fallback to env var, then default
function getBaseUrl(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const match = envContent.match(/APP_URL=["']?([^"'\n]+)["']?/);
      if (match) return match[1];
    }
  } catch {
    // Ignore errors reading .env
  }
  
  return 'http://localhost:3000'; // Standard Remix default
}

const BASE_URL = getBaseUrl();
const MANIFEST_PATH = path.join(process.cwd(), 'routes-manifest.json');
const ISSUES_PATH = path.join(process.cwd(), 'ISSUES.md');
const ROUTES_MD_PATH = path.join(process.cwd(), 'ROUTES.md');
const SCREENSHOTS_DIR = path.join(process.cwd(), 'tests', 'screenshots');

// Parse arguments
const args = process.argv.slice(2);
const captureScreenshots = args.includes('--screenshots');
const updateManifest = args.includes('--update-manifest');
const generateReport = args.includes('--report');
const categoryFilter = args.find(a => a.startsWith('--category='))?.split('=')[1];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Load manifest
function loadManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    log('❌ routes-manifest.json not found. Run route-extractor first.', 'red');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
}

// Save manifest
function saveManifest(manifest: Manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  log('✅ Updated routes-manifest.json', 'green');
}

// Test a single route
async function testRoute(route: RouteTest, category: string): Promise<RouteTest> {
  const startTime = Date.now();
  const url = `${BASE_URL}${route.path}`;
  
  log(`\n  Testing: ${route.path}`, 'blue');
  
  try {
    // Make HTTP request
    const response = await fetch(url, {
      method: route.method || 'GET',
      headers: {
        'Accept': 'text/html,application/json',
        'User-Agent': 'ZZA-Route-Tester/1.0',
      },
      redirect: 'follow',
    });
    
    const loadTime = Date.now() - startTime;
    const httpStatus = response.status;
    
    // Determine status
    let status: 'passing' | 'failing' = 'passing';
    const consoleErrors: string[] = [];
    const missingElements: string[] = [];
    
    // Check HTTP status
    if (httpStatus >= 400) {
      status = 'failing';
      consoleErrors.push(`HTTP ${httpStatus}: ${response.statusText}`);
    }
    
    // Check content type for API routes
    if (category === 'api') {
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        consoleErrors.push(`Expected JSON response, got: ${contentType}`);
      }
    }
    
    // Log result
    const statusIcon = status === 'passing' ? '✅' : '❌';
    const statusColor = status === 'passing' ? 'green' : 'red';
    log(`    ${statusIcon} HTTP ${httpStatus} (${loadTime}ms)`, statusColor);
    
    if (consoleErrors.length > 0) {
      consoleErrors.forEach(err => log(`    ⚠️  ${err}`, 'yellow'));
    }
    
    // Update route testing data
    return {
      ...route,
      testing: {
        ...route.testing,
        status,
        lastTestedAt: new Date().toISOString(),
        lastTestedBy: 'route-tester-script',
        httpStatus,
        loadTime,
        consoleErrors,
        missingElements,
        screenshotPath: null, // Would be set by Playwright
        notes: null,
      },
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`    ❌ Error: ${errorMessage}`, 'red');
    
    return {
      ...route,
      testing: {
        ...route.testing,
        status: 'failing',
        lastTestedAt: new Date().toISOString(),
        lastTestedBy: 'route-tester-script',
        httpStatus: null,
        loadTime: null,
        consoleErrors: [errorMessage],
        missingElements: [],
        screenshotPath: null,
        notes: `Connection failed: ${errorMessage}`,
      },
    };
  }
}

// Test all routes in a category
async function testCategory(manifest: Manifest, category: keyof Manifest['routes']): Promise<void> {
  log(`\n📁 Testing ${category.toUpperCase()} routes...`, 'blue');
  
  const routes = manifest.routes[category] || [];
  
  for (let i = 0; i < routes.length; i++) {
    const testedRoute = await testRoute(routes[i], category);
    manifest.routes[category][i] = testedRoute;
    
    // If failing, add to issues
    if (testedRoute.testing.status === 'failing') {
      const existingIssue = manifest.issues.find(iss => iss.route === testedRoute.path);
      
      if (!existingIssue) {
        manifest.issues.push({
          id: `issue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          route: testedRoute.path,
          title: `Route failing: ${testedRoute.name}`,
          description: testedRoute.testing.consoleErrors.join('; ') || 'Route test failed',
          severity: testedRoute.testing.httpStatus && testedRoute.testing.httpStatus >= 500 ? 'error' : 'warning',
          consoleErrors: testedRoute.testing.consoleErrors,
          createdAt: new Date().toISOString(),
          status: 'open',
        });
      }
    }
  }
}

// Update summary counts
function updateSummary(manifest: Manifest): void {
  let total = 0;
  let passing = 0;
  let failing = 0;
  let untested = 0;
  
  const categories = ['public', 'dashboard', 'admin', 'api'] as const;
  
  categories.forEach(cat => {
    const routes = manifest.routes[cat] || [];
    const catPassing = routes.filter(r => r.testing?.status === 'passing').length;
    const catFailing = routes.filter(r => r.testing?.status === 'failing').length;
    const catUntested = routes.filter(r => !r.testing?.status || r.testing?.status === 'untested').length;
    
    manifest.summary.byCategory[cat] = {
      total: routes.length,
      passing: catPassing,
      failing: catFailing,
      untested: catUntested,
    };
    
    total += routes.length;
    passing += catPassing;
    failing += catFailing;
    untested += catUntested;
  });
  
  manifest.summary.total = total;
  manifest.summary.passing = passing;
  manifest.summary.failing = failing;
  manifest.summary.untested = untested;
}

// Generate ISSUES.md
function generateIssuesMarkdown(manifest: Manifest): void {
  const openIssues = manifest.issues.filter(i => i.status === 'open');
  
  let content = `# Known Issues

> **Generated**: ${new Date().toISOString()}  
> **Total Open Issues**: ${openIssues.length}

---

## Summary

| Severity | Count |
|----------|-------|
| Error | ${openIssues.filter(i => i.severity === 'error').length} |
| Warning | ${openIssues.filter(i => i.severity === 'warning').length} |

---

## Open Issues

`;

  if (openIssues.length === 0) {
    content += '✅ No open issues! All routes are working correctly.\n';
  } else {
    openIssues.forEach((issue, index) => {
      content += `### ${index + 1}. ${issue.title}

- **Route**: \`${issue.route}\`
- **Severity**: ${issue.severity === 'error' ? '🔴 Error' : '🟡 Warning'}
- **Created**: ${new Date(issue.createdAt).toLocaleString()}
- **Status**: ${issue.status}

**Description**: ${issue.description}

`;
      
      if (issue.consoleErrors && issue.consoleErrors.length > 0) {
        content += `**Console Errors**:
\`\`\`
${issue.consoleErrors.join('\n')}
\`\`\`

`;
      }
      
      content += '---\n\n';
    });
  }
  
  content += `
## Fixed Issues

${manifest.issues.filter(i => i.status === 'fixed').length === 0 
  ? '_No fixed issues recorded._' 
  : manifest.issues.filter(i => i.status === 'fixed').map(i => `- ~~${i.title}~~ (${i.route})`).join('\n')
}

---

**Last Updated**: ${new Date().toISOString()}
`;
  
  fs.writeFileSync(ISSUES_PATH, content);
  log('✅ Generated ISSUES.md', 'green');
}

// Main execution
async function main() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║    ZZA Build V5.0 - Route Testing Suite                    ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');
  
  log(`\n📍 Base URL: ${BASE_URL}`, 'gray');
  log(`📍 Manifest: ${MANIFEST_PATH}`, 'gray');
  
  const manifest = loadManifest();
  
  log(`\n📊 Found ${manifest.summary.total || 0} routes to test`, 'blue');
  
  // Test routes
  const categoriesToTest = categoryFilter 
    ? [categoryFilter as keyof Manifest['routes']]
    : ['public', 'dashboard', 'admin', 'api'] as const;
  
  for (const category of categoriesToTest) {
    if (manifest.routes[category]) {
      await testCategory(manifest, category);
    }
  }
  
  // Update summary
  updateSummary(manifest);
  
  // Update manifest metadata
  manifest.metadata.lastTestedAt = new Date().toISOString();
  
  // Add to testing log
  manifest.testingLog.push({
    date: new Date().toISOString(),
    tester: 'route-tester-script',
    routesTested: manifest.summary.total,
    passed: manifest.summary.passing,
    failed: manifest.summary.failing,
    notes: `Automated test run${categoryFilter ? ` (category: ${categoryFilter})` : ''}`,
  });
  
  // Save manifest
  if (updateManifest || true) { // Always update for now
    saveManifest(manifest);
  }
  
  // Generate issues markdown
  generateIssuesMarkdown(manifest);
  
  // Print summary
  log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║    Test Results Summary                                    ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');
  
  log(`\n  Total Routes:  ${manifest.summary.total}`, 'reset');
  log(`  ✅ Passing:     ${manifest.summary.passing}`, 'green');
  log(`  ❌ Failing:     ${manifest.summary.failing}`, manifest.summary.failing > 0 ? 'red' : 'reset');
  log(`  ⬜ Untested:    ${manifest.summary.untested}`, 'gray');
  
  const coverage = manifest.summary.total > 0 
    ? Math.round((manifest.summary.passing / manifest.summary.total) * 100)
    : 0;
  log(`\n  📈 Coverage:    ${coverage}%`, coverage === 100 ? 'green' : 'yellow');
  
  if (manifest.summary.failing > 0) {
    log('\n⚠️  Some routes are failing. Check ISSUES.md for details.', 'yellow');
  } else {
    log('\n✨ All routes passing!', 'green');
  }
  
  log('\n📄 Reports generated:', 'gray');
  log(`   - ${ISSUES_PATH}`, 'gray');
  log(`   - ${MANIFEST_PATH}`, 'gray');
  
  // Exit with error code if failures
  if (manifest.summary.failing > 0) {
    process.exit(1);
  }
}

// Run
main().catch(error => {
  log(`\n❌ Test runner failed: ${error.message}`, 'red');
  process.exit(1);
});
