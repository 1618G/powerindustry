#!/usr/bin/env npx tsx

/**
 * Stub Detector Script
 * 
 * Scans the codebase for stub code that throws "not implemented" errors.
 * This is a Phase 2 gate check - no stubs allowed before proceeding.
 * 
 * Usage:
 *   pnpm detect-stubs
 *   pnpm detect-stubs --fix (suggests fixes)
 *   pnpm detect-stubs --strict (exits with error code if stubs found)
 */

import * as fs from 'fs';
import * as path from 'path';

interface StubMatch {
  file: string;
  line: number;
  content: string;
  type: 'error-throw' | 'not-implemented-return' | 'todo-comment';
}

const PATTERNS = {
  'error-throw': [
    /throw\s+new\s+Error\s*\(\s*["'`]not\s+implemented/i,
    /throw\s+new\s+Error\s*\(\s*["'`]TODO/i,
    /throw\s+new\s+Error\s*\(\s*["'`]FIXME/i,
    /throw\s+new\s+Error\s*\(\s*["'`]stub/i,
    /throw\s+["'`]not\s+implemented/i,
  ],
  'not-implemented-return': [
    /return\s+json\s*\(\s*\{\s*error:\s*["'`]not\s+implemented/i,
    /return\s+json\s*\(\s*\{\s*error:\s*["'`]TODO/i,
    /return\s+new\s+Response\s*\(\s*["'`]not\s+implemented/i,
    /status:\s*501/,
  ],
  'todo-comment': [
    /\/\/\s*TODO:\s*implement/i,
    /\/\/\s*FIXME:\s*implement/i,
    /\/\*\s*TODO:\s*implement/i,
  ],
};

const DIRECTORIES_TO_SCAN = [
  'app/routes',
  'app/services', 
  'app/repositories',
];

const EXTENSIONS = ['.ts', '.tsx'];

function scanFile(filePath: string): StubMatch[] {
  const matches: StubMatch[] = [];
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      // Check error-throw patterns
      for (const pattern of PATTERNS['error-throw']) {
        if (pattern.test(line)) {
          matches.push({
            file: filePath,
            line: index + 1,
            content: line.trim(),
            type: 'error-throw',
          });
        }
      }
      
      // Check not-implemented-return patterns
      for (const pattern of PATTERNS['not-implemented-return']) {
        if (pattern.test(line)) {
          matches.push({
            file: filePath,
            line: index + 1,
            content: line.trim(),
            type: 'not-implemented-return',
          });
        }
      }
      
      // Check TODO comments (warning only)
      for (const pattern of PATTERNS['todo-comment']) {
        if (pattern.test(line)) {
          matches.push({
            file: filePath,
            line: index + 1,
            content: line.trim(),
            type: 'todo-comment',
          });
        }
      }
    });
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
  }
  
  return matches;
}

function scanDirectory(dirPath: string): StubMatch[] {
  const matches: StubMatch[] = [];
  
  if (!fs.existsSync(dirPath)) {
    return matches;
  }
  
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      matches.push(...scanDirectory(fullPath));
    } else if (entry.isFile() && EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
      matches.push(...scanFile(fullPath));
    }
  }
  
  return matches;
}

function main() {
  const args = process.argv.slice(2);
  const isStrict = args.includes('--strict');
  const showFixes = args.includes('--fix');
  
  console.log('🔍 Scanning for stub code...\n');
  
  const allMatches: StubMatch[] = [];
  
  for (const dir of DIRECTORIES_TO_SCAN) {
    const matches = scanDirectory(dir);
    allMatches.push(...matches);
  }
  
  // Separate by type
  const errors = allMatches.filter(m => m.type === 'error-throw');
  const returns = allMatches.filter(m => m.type === 'not-implemented-return');
  const todos = allMatches.filter(m => m.type === 'todo-comment');
  
  const criticalCount = errors.length + returns.length;
  
  if (criticalCount === 0 && todos.length === 0) {
    console.log('✅ No stub code found! Phase 2 gate passed.\n');
    process.exit(0);
  }
  
  // Report critical stubs
  if (errors.length > 0) {
    console.log(`\n🔴 CRITICAL: ${errors.length} error-throw stubs found:\n`);
    for (const match of errors) {
      console.log(`  ${match.file}:${match.line}`);
      console.log(`    ${match.content}\n`);
      
      if (showFixes) {
        console.log('  💡 FIX: Either implement this function or remove it entirely.');
        console.log('     If blocked, ask user which features to defer.\n');
      }
    }
  }
  
  if (returns.length > 0) {
    console.log(`\n🔴 CRITICAL: ${returns.length} not-implemented returns found:\n`);
    for (const match of returns) {
      console.log(`  ${match.file}:${match.line}`);
      console.log(`    ${match.content}\n`);
      
      if (showFixes) {
        console.log('  💡 FIX: Implement the API endpoint or remove the route.\n');
      }
    }
  }
  
  // Report TODO warnings
  if (todos.length > 0) {
    console.log(`\n🟡 WARNING: ${todos.length} TODO comments found:\n`);
    for (const match of todos) {
      console.log(`  ${match.file}:${match.line}`);
      console.log(`    ${match.content}\n`);
    }
  }
  
  // Summary
  console.log('\n📊 SUMMARY');
  console.log('──────────────────────────────');
  console.log(`  🔴 Critical stubs: ${criticalCount}`);
  console.log(`  🟡 TODO comments:  ${todos.length}`);
  console.log('──────────────────────────────\n');
  
  if (criticalCount > 0) {
    console.log('⛔ Phase 2 gate FAILED: Stub code must be removed before proceeding.\n');
    console.log('Options:');
    console.log('  1. Implement the feature fully');
    console.log('  2. Remove the stub code and defer the feature');
    console.log('  3. Ask which features to prioritize\n');
    
    if (isStrict) {
      process.exit(1);
    }
  } else {
    console.log('✅ No critical stubs found (only TODOs).');
    console.log('   Consider addressing TODO comments before deployment.\n');
  }
}

main();
