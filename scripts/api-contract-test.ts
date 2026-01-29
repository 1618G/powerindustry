#!/usr/bin/env npx tsx

/**
 * API Contract Testing Script
 * 
 * Validates API endpoints against their documented contracts.
 * Ensures API stability between versions.
 * 
 * Usage:
 *   pnpm api:test                # Test all API endpoints
 *   pnpm api:test --strict       # Fail on any contract violation
 *   pnpm api:test --generate     # Generate contract file from current API
 *   pnpm api:test --endpoint /api/users  # Test specific endpoint
 */

import * as fs from 'fs';
import * as path from 'path';

interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  auth: 'none' | 'user' | 'admin';
  request?: {
    body?: Record<string, { type: string; required: boolean }>;
    query?: Record<string, { type: string; required: boolean }>;
  };
  response: {
    status: number;
    contentType: string;
    schema?: Record<string, string>;
  };
}

interface ApiContract {
  version: string;
  baseUrl: string;
  generatedAt: string;
  endpoints: ApiEndpoint[];
}

interface TestResult {
  endpoint: string;
  method: string;
  passed: boolean;
  issues: string[];
  responseTime: number;
}

const CONTRACT_FILE = 'api-contract.json';

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

function loadContract(): ApiContract | null {
  if (!fs.existsSync(CONTRACT_FILE)) {
    return null;
  }
  
  try {
    return JSON.parse(fs.readFileSync(CONTRACT_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function discoverApiRoutes(): ApiEndpoint[] {
  const routesDir = 'app/routes';
  const endpoints: ApiEndpoint[] = [];
  
  if (!fs.existsSync(routesDir)) {
    return endpoints;
  }
  
  const files = fs.readdirSync(routesDir);
  
  for (const file of files) {
    if (file.startsWith('api.') && file.endsWith('.tsx')) {
      // Parse route from filename
      const routePath = '/' + file
        .replace('.tsx', '')
        .replace(/\./g, '/')
        .replace(/\$([^/]+)/g, ':$1');
      
      // Detect methods from file content
      const content = fs.readFileSync(path.join(routesDir, file), 'utf-8');
      const methods: ('GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE')[] = [];
      
      if (content.includes('loader')) methods.push('GET');
      if (content.includes('action')) {
        // Try to detect specific methods
        if (content.includes('POST') || content.includes('method') || !content.includes('PUT')) {
          methods.push('POST');
        }
        if (content.includes('PUT')) methods.push('PUT');
        if (content.includes('DELETE')) methods.push('DELETE');
        if (content.includes('PATCH')) methods.push('PATCH');
      }
      
      // If no methods detected, default to GET
      if (methods.length === 0) methods.push('GET');
      
      for (const method of methods) {
        endpoints.push({
          method,
          path: routePath,
          description: `${method} ${routePath}`,
          auth: content.includes('requireUser') || content.includes('requireAdmin') ? 'user' : 'none',
          response: {
            status: 200,
            contentType: 'application/json',
          },
        });
      }
    }
  }
  
  return endpoints;
}

function generateContract(baseUrl: string): ApiContract {
  return {
    version: '1.0.0',
    baseUrl,
    generatedAt: new Date().toISOString(),
    endpoints: discoverApiRoutes(),
  };
}

async function testEndpoint(endpoint: ApiEndpoint, baseUrl: string): Promise<TestResult> {
  const issues: string[] = [];
  const startTime = Date.now();
  
  try {
    const url = `${baseUrl}${endpoint.path}`;
    const response = await fetch(url, {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const responseTime = Date.now() - startTime;
    
    // Check status (allow 401 for auth-required endpoints when testing unauthenticated)
    const expectedStatuses = endpoint.auth !== 'none' 
      ? [endpoint.response.status, 401, 403] 
      : [endpoint.response.status];
    
    if (!expectedStatuses.includes(response.status)) {
      issues.push(`Expected status ${expectedStatuses.join(' or ')}, got ${response.status}`);
    }
    
    // Check content type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes(endpoint.response.contentType)) {
      issues.push(`Expected content-type ${endpoint.response.contentType}, got ${contentType}`);
    }
    
    // Check response body structure if schema provided
    if (endpoint.response.schema && response.status === 200) {
      try {
        const body = await response.json();
        for (const [key, type] of Object.entries(endpoint.response.schema)) {
          if (!(key in body)) {
            issues.push(`Missing field: ${key}`);
          } else if (typeof body[key] !== type && type !== 'any') {
            issues.push(`Field ${key}: expected ${type}, got ${typeof body[key]}`);
          }
        }
      } catch {
        // JSON parse error
        if (endpoint.response.contentType === 'application/json') {
          issues.push('Response is not valid JSON');
        }
      }
    }
    
    // Performance check
    if (responseTime > 2000) {
      issues.push(`Slow response: ${responseTime}ms (> 2000ms)`);
    }
    
    return {
      endpoint: endpoint.path,
      method: endpoint.method,
      passed: issues.length === 0,
      issues,
      responseTime,
    };
    
  } catch (error) {
    return {
      endpoint: endpoint.path,
      method: endpoint.method,
      passed: false,
      issues: [`Request failed: ${error}`],
      responseTime: Date.now() - startTime,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isStrict = args.includes('--strict');
  const shouldGenerate = args.includes('--generate');
  const specificEndpoint = args.find((a, i) => args[i - 1] === '--endpoint');
  
  log('\n╔════════════════════════════════════════════════════════════╗', colors.cyan);
  log('║              API CONTRACT TESTING                          ║', colors.cyan);
  log('╚════════════════════════════════════════════════════════════╝\n', colors.cyan);
  
  const baseUrl = process.env.APP_URL || 'http://localhost:3000';
  
  if (shouldGenerate) {
    log('📝 Generating API contract from current routes...\n', colors.blue);
    const contract = generateContract(baseUrl);
    fs.writeFileSync(CONTRACT_FILE, JSON.stringify(contract, null, 2));
    log(`✅ Contract generated: ${CONTRACT_FILE}`, colors.green);
    log(`   Endpoints: ${contract.endpoints.length}\n`, colors.blue);
    return;
  }
  
  let contract = loadContract();
  
  if (!contract) {
    log('⚠️  No API contract found. Generating from current routes...\n', colors.yellow);
    contract = generateContract(baseUrl);
  }
  
  log(`🌐 Base URL: ${baseUrl}`, colors.blue);
  log(`📋 Endpoints: ${contract.endpoints.length}`, colors.blue);
  log(`📄 Contract: ${CONTRACT_FILE}\n`, colors.blue);
  
  const endpoints = specificEndpoint
    ? contract.endpoints.filter(e => e.path.includes(specificEndpoint))
    : contract.endpoints;
  
  if (endpoints.length === 0) {
    log('❌ No endpoints to test', colors.red);
    return;
  }
  
  let passed = 0;
  let failed = 0;
  const results: TestResult[] = [];
  
  for (const endpoint of endpoints) {
    process.stdout.write(`   ${endpoint.method.padEnd(6)} ${endpoint.path}... `);
    
    const result = await testEndpoint(endpoint, baseUrl);
    results.push(result);
    
    if (result.passed) {
      log(`✅ ${result.responseTime}ms`, colors.green);
      passed++;
    } else {
      log(`❌`, colors.red);
      for (const issue of result.issues) {
        log(`      └─ ${issue}`, colors.yellow);
      }
      failed++;
    }
  }
  
  log('\n────────────────────────────────────────────────────────────', colors.cyan);
  log('📊 SUMMARY', colors.cyan);
  log(`   ✅ Passed: ${passed}`, passed > 0 ? colors.green : colors.reset);
  log(`   ❌ Failed: ${failed}`, failed > 0 ? colors.red : colors.reset);
  
  // Calculate average response time
  const avgResponseTime = Math.round(
    results.reduce((sum, r) => sum + r.responseTime, 0) / results.length
  );
  log(`   ⏱️  Avg Response: ${avgResponseTime}ms`, colors.blue);
  
  if (failed > 0) {
    log('\n⚠️  API contract violations found!', colors.yellow);
    log('   This may indicate:', colors.reset);
    log('   - Breaking changes in the API');
    log('   - Missing endpoints');
    log('   - Schema changes');
    log('   - Performance regressions\n');
    
    if (isStrict) {
      log('⛔ Build failed due to API contract violations\n', colors.red);
      process.exit(1);
    }
  } else {
    log('\n✅ All API endpoints match their contracts!\n', colors.green);
  }
  
  // Save report
  const reportPath = 'docs/api-contract-report.json';
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    contract: CONTRACT_FILE,
    results,
    summary: { passed, failed, total: endpoints.length, avgResponseTime },
  }, null, 2));
  
  log(`📄 Report saved: ${reportPath}\n`, colors.blue);
}

main().catch(console.error);
