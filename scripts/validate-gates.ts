#!/usr/bin/env npx tsx

/**
 * Gate Validation Script
 * 
 * Validates that all phase gates are passing before proceeding.
 * This enforces the ZZA_Build V5.4 methodology.
 * 
 * Usage:
 *   pnpm validate-gates                # Check all gates
 *   pnpm validate-gates --phase 1      # Check specific phase
 *   pnpm validate-gates --update       # Update BUILD-STATE.json
 *   pnpm validate-gates --strict       # Exit with error if gates fail
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface GateResult {
  gate: string;
  status: 'passed' | 'failed' | 'pending';
  message: string;
  evidence?: string;
}

interface BuildState {
  gates: Record<string, { status: string; passed_at: string | null; evidence: string | null }>;
  current_phase: number;
  manifest?: { total_routes: number; approved: boolean };
  prd?: { approved: boolean };
}

const BUILD_STATE_PATH = 'BUILD-STATE.json';
const ROUTES_DIR = 'app/routes';
const MANIFEST_PATH = 'routes-manifest.json';

// Color codes for terminal output
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

function loadBuildState(): BuildState | null {
  if (!fs.existsSync(BUILD_STATE_PATH)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(BUILD_STATE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveBuildState(state: BuildState) {
  fs.writeFileSync(BUILD_STATE_PATH, JSON.stringify(state, null, 2));
}

// Gate Check Functions

function checkPrdExists(): GateResult {
  const prdFiles = ['PRD.md', 'SPEC.md', 'REQUIREMENTS.md', 'docs/PRD.md', 'docs/SPEC.md'];
  
  for (const file of prdFiles) {
    if (fs.existsSync(file)) {
      return {
        gate: 'phase0_prd_provided',
        status: 'passed',
        message: `PRD found: ${file}`,
        evidence: file,
      };
    }
  }
  
  return {
    gate: 'phase0_prd_provided',
    status: 'failed',
    message: 'No PRD/Spec document found. Please provide PRD.md, SPEC.md, or REQUIREMENTS.md',
  };
}

function checkManifestApproved(): GateResult {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return {
      gate: 'phase0_manifest_approved',
      status: 'failed',
      message: 'routes-manifest.json not found. Run route-extractor first.',
    };
  }
  
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    
    if (manifest.locked && manifest.approved_by) {
      return {
        gate: 'phase0_manifest_approved',
        status: 'passed',
        message: `Manifest approved by ${manifest.approved_by} at ${manifest.approved_at}`,
        evidence: `${manifest.summary?.total_routes || 0} routes locked`,
      };
    }
    
    return {
      gate: 'phase0_manifest_approved',
      status: 'failed',
      message: 'Manifest exists but not approved. User must type "APPROVED".',
    };
  } catch {
    return {
      gate: 'phase0_manifest_approved',
      status: 'failed',
      message: 'Invalid routes-manifest.json format',
    };
  }
}

function checkAllRoutesExist(): GateResult {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return {
      gate: 'phase1_all_routes_exist',
      status: 'pending',
      message: 'Manifest not found - cannot verify routes',
    };
  }
  
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    const modules = manifest.modules || [];
    
    let totalRoutes = 0;
    let existingRoutes = 0;
    const missingRoutes: string[] = [];
    
    for (const module of modules) {
      for (const route of module.routes || []) {
        totalRoutes++;
        const routePath = path.join(ROUTES_DIR, route.file);
        
        if (fs.existsSync(routePath)) {
          existingRoutes++;
        } else {
          missingRoutes.push(route.file);
        }
      }
    }
    
    if (existingRoutes === totalRoutes && totalRoutes > 0) {
      return {
        gate: 'phase1_all_routes_exist',
        status: 'passed',
        message: `All ${totalRoutes} route files exist`,
        evidence: `${existingRoutes}/${totalRoutes} routes`,
      };
    }
    
    return {
      gate: 'phase1_all_routes_exist',
      status: 'failed',
      message: `Missing ${totalRoutes - existingRoutes} route files`,
      evidence: missingRoutes.slice(0, 5).join(', ') + (missingRoutes.length > 5 ? '...' : ''),
    };
  } catch {
    return {
      gate: 'phase1_all_routes_exist',
      status: 'failed',
      message: 'Error reading manifest',
    };
  }
}

function checkBuildPasses(): GateResult {
  try {
    execSync('pnpm build', { stdio: 'pipe' });
    return {
      gate: 'phase1_build_passes',
      status: 'passed',
      message: 'pnpm build completed successfully',
      evidence: 'Exit code 0',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Build failed';
    return {
      gate: 'phase1_build_passes',
      status: 'failed',
      message: 'pnpm build failed',
      evidence: errorMessage.substring(0, 200),
    };
  }
}

function checkNoStubs(): GateResult {
  try {
    const result = execSync('pnpm detect-stubs --strict', { stdio: 'pipe' });
    return {
      gate: 'phase2_no_stubs',
      status: 'passed',
      message: 'No stub code detected',
      evidence: 'detect-stubs passed',
    };
  } catch {
    return {
      gate: 'phase2_no_stubs',
      status: 'failed',
      message: 'Stub code detected. Run "pnpm detect-stubs" for details.',
    };
  }
}

function runAllGateChecks(targetPhase?: number): GateResult[] {
  const results: GateResult[] = [];
  
  // Phase 0 gates
  if (!targetPhase || targetPhase === 0) {
    results.push(checkPrdExists());
    results.push(checkManifestApproved());
  }
  
  // Phase 1 gates
  if (!targetPhase || targetPhase === 1) {
    results.push(checkAllRoutesExist());
    results.push(checkBuildPasses());
  }
  
  // Phase 2 gates
  if (!targetPhase || targetPhase === 2) {
    results.push(checkNoStubs());
  }
  
  return results;
}

function printResults(results: GateResult[]) {
  log('\n╔══════════════════════════════════════════════════════════════╗', colors.cyan);
  log('║              ZZA BUILD GATE VALIDATION REPORT                ║', colors.cyan);
  log('╚══════════════════════════════════════════════════════════════╝\n', colors.cyan);
  
  const passed = results.filter(r => r.status === 'passed');
  const failed = results.filter(r => r.status === 'failed');
  const pending = results.filter(r => r.status === 'pending');
  
  for (const result of results) {
    const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏳';
    const color = result.status === 'passed' ? colors.green : result.status === 'failed' ? colors.red : colors.yellow;
    
    log(`${icon} ${result.gate}`, color);
    log(`   ${result.message}`, colors.reset);
    if (result.evidence) {
      log(`   Evidence: ${result.evidence}`, colors.blue);
    }
    console.log();
  }
  
  log('─────────────────────────────────────────────────────────────────', colors.cyan);
  log(`SUMMARY: ${passed.length} passed, ${failed.length} failed, ${pending.length} pending`, colors.reset);
  
  if (failed.length > 0) {
    log('\n⛔ GATES NOT PASSING - Cannot proceed to next phase', colors.red);
    log('   Fix the failed gates above before continuing.\n', colors.red);
  } else if (pending.length > 0) {
    log('\n⏳ Some gates pending - May need prerequisites\n', colors.yellow);
  } else {
    log('\n✅ ALL GATES PASSING - Ready to proceed!\n', colors.green);
  }
  
  return failed.length;
}

function main() {
  const args = process.argv.slice(2);
  const isStrict = args.includes('--strict');
  const shouldUpdate = args.includes('--update');
  
  let targetPhase: number | undefined;
  const phaseIndex = args.indexOf('--phase');
  if (phaseIndex !== -1 && args[phaseIndex + 1]) {
    targetPhase = parseInt(args[phaseIndex + 1], 10);
  }
  
  console.log('🔍 Running gate validation...');
  if (targetPhase !== undefined) {
    console.log(`   Checking Phase ${targetPhase} gates only\n`);
  }
  
  const results = runAllGateChecks(targetPhase);
  const failedCount = printResults(results);
  
  // Update BUILD-STATE.json if requested
  if (shouldUpdate) {
    let state = loadBuildState();
    if (!state) {
      console.log('⚠️  BUILD-STATE.json not found. Create it first.\n');
    } else {
      for (const result of results) {
        if (state.gates[result.gate]) {
          state.gates[result.gate].status = result.status;
          if (result.status === 'passed') {
            state.gates[result.gate].passed_at = new Date().toISOString();
            state.gates[result.gate].evidence = result.evidence || null;
          }
        }
      }
      saveBuildState(state);
      log('📝 BUILD-STATE.json updated\n', colors.blue);
    }
  }
  
  if (isStrict && failedCount > 0) {
    process.exit(1);
  }
}

main();
