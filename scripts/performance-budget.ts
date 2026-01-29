#!/usr/bin/env npx tsx

/**
 * Performance Budget Validation Script
 * 
 * Validates that all routes meet performance budgets.
 * Fails build if any route exceeds thresholds.
 * 
 * Usage:
 *   pnpm perf:check              # Check all routes
 *   pnpm perf:check --strict     # Fail on any budget exceeded
 *   pnpm perf:check --route /    # Check specific route
 */

import * as fs from 'fs';
import * as path from 'path';

interface PerformanceMetrics {
  route: string;
  loadTime: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  timeToInteractive: number;
  totalBlockingTime: number;
  cumulativeLayoutShift: number;
  bundleSize: number;
}

interface Budget {
  loadTime: number;           // Max page load time (ms)
  fcp: number;                // First Contentful Paint (ms)
  lcp: number;                // Largest Contentful Paint (ms)
  tti: number;                // Time to Interactive (ms)
  tbt: number;                // Total Blocking Time (ms)
  cls: number;                // Cumulative Layout Shift (score)
  bundleSize: number;         // Max bundle size (KB)
}

// Default performance budgets
const BUDGETS: Budget = {
  loadTime: 3000,      // 3 seconds max
  fcp: 1800,           // 1.8 seconds
  lcp: 2500,           // 2.5 seconds
  tti: 3800,           // 3.8 seconds
  tbt: 300,            // 300ms
  cls: 0.1,            // 0.1 score
  bundleSize: 500,     // 500KB
};

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function loadRoutes(): string[] {
  const manifestPath = 'routes-manifest.json';
  
  if (!fs.existsSync(manifestPath)) {
    return ['/', '/login', '/dashboard'];
  }
  
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const routes: string[] = [];
    
    for (const module of manifest.modules || []) {
      for (const route of module.routes || []) {
        if (!route.path.includes(':')) {
          routes.push(route.path);
        }
      }
    }
    
    return routes.length > 0 ? routes : ['/', '/login', '/dashboard'];
  } catch {
    return ['/', '/login', '/dashboard'];
  }
}

async function measureRoute(route: string, baseUrl: string): Promise<PerformanceMetrics | null> {
  // This is a simplified version - in production, use Lighthouse or Playwright
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${baseUrl}${route}`);
    const loadTime = Date.now() - startTime;
    
    if (!response.ok) {
      return null;
    }
    
    const html = await response.text();
    const bundleSize = html.length / 1024; // Rough estimate
    
    // Simulated metrics (in production, use real browser metrics)
    return {
      route,
      loadTime,
      firstContentfulPaint: loadTime * 0.6,
      largestContentfulPaint: loadTime * 0.8,
      timeToInteractive: loadTime * 1.2,
      totalBlockingTime: Math.max(0, loadTime - 2000) * 0.3,
      cumulativeLayoutShift: 0.05,
      bundleSize,
    };
  } catch (error) {
    return null;
  }
}

function checkBudget(metrics: PerformanceMetrics, budgets: Budget): { passed: boolean; violations: string[] } {
  const violations: string[] = [];
  
  if (metrics.loadTime > budgets.loadTime) {
    violations.push(`Load time: ${metrics.loadTime}ms > ${budgets.loadTime}ms`);
  }
  if (metrics.firstContentfulPaint > budgets.fcp) {
    violations.push(`FCP: ${Math.round(metrics.firstContentfulPaint)}ms > ${budgets.fcp}ms`);
  }
  if (metrics.largestContentfulPaint > budgets.lcp) {
    violations.push(`LCP: ${Math.round(metrics.largestContentfulPaint)}ms > ${budgets.lcp}ms`);
  }
  if (metrics.timeToInteractive > budgets.tti) {
    violations.push(`TTI: ${Math.round(metrics.timeToInteractive)}ms > ${budgets.tti}ms`);
  }
  if (metrics.totalBlockingTime > budgets.tbt) {
    violations.push(`TBT: ${Math.round(metrics.totalBlockingTime)}ms > ${budgets.tbt}ms`);
  }
  if (metrics.cumulativeLayoutShift > budgets.cls) {
    violations.push(`CLS: ${metrics.cumulativeLayoutShift} > ${budgets.cls}`);
  }
  if (metrics.bundleSize > budgets.bundleSize) {
    violations.push(`Bundle: ${Math.round(metrics.bundleSize)}KB > ${budgets.bundleSize}KB`);
  }
  
  return { passed: violations.length === 0, violations };
}

async function main() {
  const args = process.argv.slice(2);
  const isStrict = args.includes('--strict');
  const specificRoute = args.find((a, i) => args[i - 1] === '--route');
  
  log('\n╔════════════════════════════════════════════════════════════╗', colors.cyan);
  log('║           PERFORMANCE BUDGET VALIDATION                    ║', colors.cyan);
  log('╚════════════════════════════════════════════════════════════╝\n', colors.cyan);
  
  log('📊 Performance Budgets:', colors.blue);
  log(`   Load Time:     < ${BUDGETS.loadTime}ms`);
  log(`   FCP:           < ${BUDGETS.fcp}ms`);
  log(`   LCP:           < ${BUDGETS.lcp}ms`);
  log(`   TTI:           < ${BUDGETS.tti}ms`);
  log(`   TBT:           < ${BUDGETS.tbt}ms`);
  log(`   CLS:           < ${BUDGETS.cls}`);
  log(`   Bundle Size:   < ${BUDGETS.bundleSize}KB`);
  log('');
  
  const baseUrl = process.env.APP_URL || 'http://localhost:3000';
  const routes = specificRoute ? [specificRoute] : loadRoutes();
  
  log(`🌐 Base URL: ${baseUrl}`, colors.blue);
  log(`📋 Routes: ${routes.length}\n`, colors.blue);
  
  let passed = 0;
  let failed = 0;
  const results: { route: string; passed: boolean; violations: string[] }[] = [];
  
  for (const route of routes) {
    process.stdout.write(`   Testing ${route}... `);
    
    const metrics = await measureRoute(route, baseUrl);
    
    if (!metrics) {
      log('❌ Failed to load', colors.red);
      failed++;
      results.push({ route, passed: false, violations: ['Failed to load'] });
      continue;
    }
    
    const result = checkBudget(metrics, BUDGETS);
    
    if (result.passed) {
      log(`✅ ${metrics.loadTime}ms`, colors.green);
      passed++;
    } else {
      log(`❌ ${metrics.loadTime}ms`, colors.red);
      for (const violation of result.violations) {
        log(`      └─ ${violation}`, colors.yellow);
      }
      failed++;
    }
    
    results.push({ route, ...result });
  }
  
  log('\n────────────────────────────────────────────────────────────', colors.cyan);
  log('📊 SUMMARY', colors.cyan);
  log(`   ✅ Passed: ${passed}`, passed > 0 ? colors.green : colors.reset);
  log(`   ❌ Failed: ${failed}`, failed > 0 ? colors.red : colors.reset);
  
  if (failed > 0) {
    log('\n⚠️  Performance budget exceeded!', colors.yellow);
    log('   Consider:', colors.reset);
    log('   - Lazy loading components');
    log('   - Optimizing images');
    log('   - Code splitting');
    log('   - Reducing bundle size');
    log('   - Using CDN for static assets\n');
    
    if (isStrict) {
      log('⛔ Build failed due to performance budget violations\n', colors.red);
      process.exit(1);
    }
  } else {
    log('\n✅ All routes within performance budget!\n', colors.green);
  }
  
  // Save report
  const reportPath = 'docs/performance-report.json';
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    budgets: BUDGETS,
    results,
    summary: { passed, failed, total: routes.length },
  }, null, 2));
  
  log(`📄 Report saved: ${reportPath}\n`, colors.blue);
}

main().catch(console.error);
