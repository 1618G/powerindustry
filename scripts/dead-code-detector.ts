#!/usr/bin/env npx tsx

/**
 * Dead Code Detector
 * 
 * Identifies unused exports, orphan files, and code bloat.
 * Helps keep the codebase lean and maintainable.
 * 
 * Usage:
 *   pnpm dead-code                # Full analysis
 *   pnpm dead-code:check          # Check mode (for CI)
 *   pnpm dead-code --fix          # Remove unused exports (interactive)
 */

import * as fs from 'fs';
import * as path from 'path';

interface UnusedExport {
  file: string;
  exportName: string;
  line: number;
}

interface OrphanFile {
  file: string;
  reason: string;
}

interface DeadCodeReport {
  unusedExports: UnusedExport[];
  orphanFiles: OrphanFile[];
  largeFiles: { file: string; lines: number }[];
  duplicateCode: { file1: string; file2: string; similarity: number }[];
}

const DIRECTORIES_TO_SCAN = [
  'app/routes',
  'app/services',
  'app/repositories',
  'app/components',
  'app/utils',
  'app/lib',
];

const EXTENSIONS = ['.ts', '.tsx'];

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'build',
  'dist',
  '.cache',
];

const LARGE_FILE_THRESHOLD = 500; // lines
const SIMILARITY_THRESHOLD = 0.8; // 80% similar

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

function getAllFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (IGNORE_PATTERNS.some(p => fullPath.includes(p))) continue;
    
    if (entry.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function extractExports(content: string): { name: string; line: number }[] {
  const exports: { name: string; line: number }[] = [];
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    // Named exports
    const namedExportMatch = line.match(/export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/);
    if (namedExportMatch) {
      exports.push({ name: namedExportMatch[1], line: index + 1 });
    }
    
    // Export default
    if (line.includes('export default')) {
      exports.push({ name: 'default', line: index + 1 });
    }
    
    // Re-exports
    const reExportMatch = line.match(/export\s+\{\s*([^}]+)\s*\}/);
    if (reExportMatch) {
      const names = reExportMatch[1].split(',').map(n => n.trim().split(' as ')[0].trim());
      names.forEach(name => {
        if (name && name !== '*') {
          exports.push({ name, line: index + 1 });
        }
      });
    }
  });
  
  return exports;
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  
  // Named imports
  const namedImportMatches = content.matchAll(/import\s+\{([^}]+)\}\s+from/g);
  for (const match of namedImportMatches) {
    const names = match[1].split(',').map(n => n.trim().split(' as ')[0].trim());
    imports.push(...names);
  }
  
  // Default imports
  const defaultImportMatches = content.matchAll(/import\s+(\w+)\s+from/g);
  for (const match of defaultImportMatches) {
    if (!match[1].startsWith('{')) {
      imports.push(match[1]);
    }
  }
  
  // Usage in code (function calls, JSX, etc.)
  const usageMatches = content.matchAll(/\b([A-Z][a-zA-Z0-9]*|[a-z][a-zA-Z0-9]*)\s*(?:\(|<|\.)/g);
  for (const match of usageMatches) {
    imports.push(match[1]);
  }
  
  return [...new Set(imports)];
}

function findUnusedExports(files: string[]): UnusedExport[] {
  const allExports: Map<string, { file: string; line: number }[]> = new Map();
  const allImports: Set<string> = new Set();
  
  // Collect all exports
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const exports = extractExports(content);
    
    for (const exp of exports) {
      const existing = allExports.get(exp.name) || [];
      existing.push({ file, line: exp.line });
      allExports.set(exp.name, existing);
    }
  }
  
  // Collect all imports/usages
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const imports = extractImports(content);
    imports.forEach(i => allImports.add(i));
  }
  
  // Find unused exports
  const unused: UnusedExport[] = [];
  
  for (const [name, locations] of allExports.entries()) {
    // Skip common patterns that are used by framework
    if (['loader', 'action', 'meta', 'links', 'default', 'handle', 'ErrorBoundary'].includes(name)) {
      continue;
    }
    
    // Skip if imported anywhere
    if (allImports.has(name)) continue;
    
    // Skip index files (re-exports)
    for (const loc of locations) {
      if (!loc.file.includes('index.ts')) {
        unused.push({
          file: loc.file,
          exportName: name,
          line: loc.line,
        });
      }
    }
  }
  
  return unused;
}

function findOrphanFiles(files: string[]): OrphanFile[] {
  const orphans: OrphanFile[] = [];
  const allContent = files.map(f => fs.readFileSync(f, 'utf-8')).join('\n');
  
  for (const file of files) {
    const basename = path.basename(file, path.extname(file));
    const dirname = path.dirname(file);
    
    // Skip entry points
    if (['index', 'root', '_index', 'entry.client', 'entry.server'].includes(basename)) {
      continue;
    }
    
    // Skip route files (they're entry points)
    if (file.includes('app/routes/')) continue;
    
    // Check if file is imported anywhere
    const importPatterns = [
      `from "${file.replace(/\\/g, '/')}"`,
      `from './${basename}'`,
      `from "./${basename}"`,
      `from '~/${file.replace('app/', '').replace(/\\/g, '/').replace(/\.[^.]+$/, '')}'`,
      `/${basename}`,
    ];
    
    const isImported = importPatterns.some(pattern => 
      allContent.includes(pattern) || allContent.includes(pattern.replace(/'/g, '"'))
    );
    
    if (!isImported) {
      // Double check with just the filename
      const fileRef = new RegExp(`['"].*${basename}['"]`);
      if (!fileRef.test(allContent)) {
        orphans.push({
          file,
          reason: 'Not imported by any file',
        });
      }
    }
  }
  
  return orphans;
}

function findLargeFiles(files: string[]): { file: string; lines: number }[] {
  const largeFiles: { file: string; lines: number }[] = [];
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n').length;
    
    if (lines > LARGE_FILE_THRESHOLD) {
      largeFiles.push({ file, lines });
    }
  }
  
  return largeFiles.sort((a, b) => b.lines - a.lines);
}

function calculateSimilarity(str1: string, str2: string): number {
  // Simple Jaccard similarity on tokens
  const tokens1 = new Set(str1.split(/\s+/).filter(t => t.length > 3));
  const tokens2 = new Set(str2.split(/\s+/).filter(t => t.length > 3));
  
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

function findDuplicateCode(files: string[]): { file1: string; file2: string; similarity: number }[] {
  const duplicates: { file1: string; file2: string; similarity: number }[] = [];
  const fileContents = files.map(f => ({
    file: f,
    content: fs.readFileSync(f, 'utf-8'),
  }));
  
  // Compare files pairwise (expensive for large codebases)
  for (let i = 0; i < fileContents.length; i++) {
    for (let j = i + 1; j < fileContents.length; j++) {
      // Skip if files are too different in size
      const sizeDiff = Math.abs(fileContents[i].content.length - fileContents[j].content.length);
      if (sizeDiff > fileContents[i].content.length * 0.5) continue;
      
      const similarity = calculateSimilarity(fileContents[i].content, fileContents[j].content);
      
      if (similarity > SIMILARITY_THRESHOLD) {
        duplicates.push({
          file1: fileContents[i].file,
          file2: fileContents[j].file,
          similarity,
        });
      }
    }
  }
  
  return duplicates.sort((a, b) => b.similarity - a.similarity);
}

async function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const shouldFix = args.includes('--fix');
  
  log('\n╔════════════════════════════════════════════════════════════╗', colors.cyan);
  log('║              DEAD CODE DETECTOR                            ║', colors.cyan);
  log('╚════════════════════════════════════════════════════════════╝\n', colors.cyan);
  
  log('📂 Scanning directories:', colors.blue);
  for (const dir of DIRECTORIES_TO_SCAN) {
    log(`   └─ ${dir}`, colors.reset);
  }
  log('');
  
  // Collect all files
  const allFiles: string[] = [];
  for (const dir of DIRECTORIES_TO_SCAN) {
    allFiles.push(...getAllFiles(dir));
  }
  
  log(`📋 Files found: ${allFiles.length}\n`, colors.blue);
  
  // Run analysis
  log('🔍 Analyzing...', colors.blue);
  
  const report: DeadCodeReport = {
    unusedExports: findUnusedExports(allFiles),
    orphanFiles: findOrphanFiles(allFiles),
    largeFiles: findLargeFiles(allFiles),
    duplicateCode: findDuplicateCode(allFiles.slice(0, 50)), // Limit for performance
  };
  
  // Report unused exports
  if (report.unusedExports.length > 0) {
    log(`\n🗑️  Unused Exports: ${report.unusedExports.length}`, colors.yellow);
    for (const exp of report.unusedExports.slice(0, 20)) {
      log(`   ${exp.file}:${exp.line}`, colors.reset);
      log(`      └─ export ${exp.exportName}`, colors.yellow);
    }
    if (report.unusedExports.length > 20) {
      log(`   ... and ${report.unusedExports.length - 20} more`, colors.yellow);
    }
  } else {
    log(`\n✅ No unused exports found`, colors.green);
  }
  
  // Report orphan files
  if (report.orphanFiles.length > 0) {
    log(`\n📄 Orphan Files: ${report.orphanFiles.length}`, colors.yellow);
    for (const file of report.orphanFiles.slice(0, 10)) {
      log(`   ${file.file}`, colors.reset);
      log(`      └─ ${file.reason}`, colors.yellow);
    }
    if (report.orphanFiles.length > 10) {
      log(`   ... and ${report.orphanFiles.length - 10} more`, colors.yellow);
    }
  } else {
    log(`\n✅ No orphan files found`, colors.green);
  }
  
  // Report large files
  if (report.largeFiles.length > 0) {
    log(`\n📏 Large Files (> ${LARGE_FILE_THRESHOLD} lines): ${report.largeFiles.length}`, colors.yellow);
    for (const file of report.largeFiles.slice(0, 10)) {
      log(`   ${file.file}: ${file.lines} lines`, colors.yellow);
    }
  }
  
  // Report duplicate code
  if (report.duplicateCode.length > 0) {
    log(`\n📋 Potential Duplicates: ${report.duplicateCode.length}`, colors.yellow);
    for (const dup of report.duplicateCode.slice(0, 5)) {
      log(`   ${Math.round(dup.similarity * 100)}% similar:`, colors.yellow);
      log(`      └─ ${dup.file1}`, colors.reset);
      log(`      └─ ${dup.file2}`, colors.reset);
    }
  }
  
  // Summary
  log('\n────────────────────────────────────────────────────────────', colors.cyan);
  log('📊 SUMMARY', colors.cyan);
  log(`   Unused Exports: ${report.unusedExports.length}`, report.unusedExports.length > 0 ? colors.yellow : colors.green);
  log(`   Orphan Files: ${report.orphanFiles.length}`, report.orphanFiles.length > 0 ? colors.yellow : colors.green);
  log(`   Large Files: ${report.largeFiles.length}`, report.largeFiles.length > 0 ? colors.yellow : colors.green);
  log(`   Duplicates: ${report.duplicateCode.length}`, report.duplicateCode.length > 0 ? colors.yellow : colors.green);
  
  const totalIssues = report.unusedExports.length + report.orphanFiles.length;
  
  if (totalIssues > 0) {
    log('\n⚠️  Dead code detected!', colors.yellow);
    log('   Consider:', colors.reset);
    log('   - Removing unused exports');
    log('   - Deleting orphan files');
    log('   - Splitting large files');
    log('   - Consolidating duplicate code\n');
    
    if (isCheck) {
      process.exit(1);
    }
  } else {
    log('\n✅ Codebase is clean!\n', colors.green);
  }
  
  // Save report
  const reportPath = 'docs/dead-code-report.json';
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      unusedExports: report.unusedExports.length,
      orphanFiles: report.orphanFiles.length,
      largeFiles: report.largeFiles.length,
      duplicateCode: report.duplicateCode.length,
    },
    ...report,
  }, null, 2));
  
  log(`📄 Report saved: ${reportPath}\n`, colors.blue);
}

main().catch(console.error);
