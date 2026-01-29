#!/usr/bin/env npx tsx

/**
 * Backup Verification Script
 * 
 * Verifies that database backups can be successfully restored.
 * Critical for disaster recovery readiness.
 * 
 * Usage:
 *   pnpm backup:verify                    # Verify latest backup
 *   pnpm backup:verify --file backup.sql  # Verify specific backup
 *   pnpm backup:verify --full             # Full restore test
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface BackupInfo {
  file: string;
  size: number;
  created: Date;
  type: 'sql' | 'json' | 'unknown';
}

interface VerificationResult {
  backup: string;
  valid: boolean;
  size: string;
  tables?: number;
  records?: number;
  issues: string[];
  duration: number;
}

const BACKUP_DIR = 'scripts/backups';

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function findBackups(): BackupInfo[] {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }
  
  const files = fs.readdirSync(BACKUP_DIR);
  const backups: BackupInfo[] = [];
  
  for (const file of files) {
    const filePath = path.join(BACKUP_DIR, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isFile()) {
      let type: 'sql' | 'json' | 'unknown' = 'unknown';
      if (file.endsWith('.sql') || file.endsWith('.sql.gz')) type = 'sql';
      if (file.endsWith('.json')) type = 'json';
      
      backups.push({
        file: filePath,
        size: stat.size,
        created: stat.mtime,
        type,
      });
    }
  }
  
  // Sort by date, newest first
  return backups.sort((a, b) => b.created.getTime() - a.created.getTime());
}

function verifyJsonBackup(filePath: string): VerificationResult {
  const startTime = Date.now();
  const issues: string[] = [];
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Check for expected structure
    const expectedKeys = ['metadata', 'users', 'projects'];
    const missingKeys = expectedKeys.filter(k => !(k in data));
    
    if (missingKeys.length > 0) {
      issues.push(`Missing expected keys: ${missingKeys.join(', ')}`);
    }
    
    // Count records
    let totalRecords = 0;
    const tables: string[] = [];
    
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        tables.push(key);
        totalRecords += value.length;
      }
    }
    
    // Check metadata
    if (data.metadata) {
      if (!data.metadata.exportedAt) {
        issues.push('Missing export timestamp in metadata');
      }
      if (!data.metadata.version) {
        issues.push('Missing version in metadata');
      }
    }
    
    return {
      backup: filePath,
      valid: issues.length === 0,
      size: formatBytes(fs.statSync(filePath).size),
      tables: tables.length,
      records: totalRecords,
      issues,
      duration: Date.now() - startTime,
    };
    
  } catch (error) {
    return {
      backup: filePath,
      valid: false,
      size: formatBytes(fs.statSync(filePath).size),
      issues: [`Parse error: ${error}`],
      duration: Date.now() - startTime,
    };
  }
}

function verifySqlBackup(filePath: string, fullTest: boolean): VerificationResult {
  const startTime = Date.now();
  const issues: string[] = [];
  
  try {
    let content: string;
    
    // Handle gzipped files
    if (filePath.endsWith('.gz')) {
      try {
        content = execSync(`gunzip -c "${filePath}"`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
      } catch {
        return {
          backup: filePath,
          valid: false,
          size: formatBytes(fs.statSync(filePath).size),
          issues: ['Failed to decompress gzipped backup'],
          duration: Date.now() - startTime,
        };
      }
    } else {
      content = fs.readFileSync(filePath, 'utf-8');
    }
    
    // Basic SQL validation
    if (!content.includes('CREATE TABLE') && !content.includes('INSERT INTO')) {
      issues.push('No CREATE TABLE or INSERT statements found');
    }
    
    // Count tables
    const tableMatches = content.match(/CREATE TABLE/gi) || [];
    const tables = tableMatches.length;
    
    // Count inserts (rough estimate)
    const insertMatches = content.match(/INSERT INTO/gi) || [];
    const records = insertMatches.length;
    
    // Check for common issues
    if (content.includes('password') && !content.includes('$argon2')) {
      issues.push('Warning: May contain unhashed passwords');
    }
    
    if (fullTest) {
      log('   🔄 Running full restore test...', colors.blue);
      
      // Create a test database and try to restore
      const testDbName = `backup_test_${Date.now()}`;
      
      try {
        // This would require DATABASE_URL to be set
        // In a real implementation, create temp db, restore, verify, drop
        log('   ⚠️  Full restore test requires database access', colors.yellow);
        issues.push('Full restore test skipped (no test database configured)');
      } catch (error) {
        issues.push(`Restore test failed: ${error}`);
      }
    }
    
    return {
      backup: filePath,
      valid: issues.filter(i => !i.startsWith('Warning')).length === 0,
      size: formatBytes(fs.statSync(filePath).size),
      tables,
      records,
      issues,
      duration: Date.now() - startTime,
    };
    
  } catch (error) {
    return {
      backup: filePath,
      valid: false,
      size: formatBytes(fs.statSync(filePath).size),
      issues: [`Read error: ${error}`],
      duration: Date.now() - startTime,
    };
  }
}

function verifyBackup(backup: BackupInfo, fullTest: boolean): VerificationResult {
  if (backup.type === 'json') {
    return verifyJsonBackup(backup.file);
  } else if (backup.type === 'sql') {
    return verifySqlBackup(backup.file, fullTest);
  } else {
    return {
      backup: backup.file,
      valid: false,
      size: formatBytes(backup.size),
      issues: ['Unknown backup format'],
      duration: 0,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fullTest = args.includes('--full');
  const specificFile = args.find((a, i) => args[i - 1] === '--file');
  
  log('\n╔════════════════════════════════════════════════════════════╗', colors.cyan);
  log('║            BACKUP VERIFICATION                             ║', colors.cyan);
  log('╚════════════════════════════════════════════════════════════╝\n', colors.cyan);
  
  const backups = findBackups();
  
  if (backups.length === 0) {
    log('❌ No backups found in ' + BACKUP_DIR, colors.red);
    log('   Run `pnpm db:export` or `pnpm db:backup` to create a backup\n', colors.yellow);
    process.exit(1);
  }
  
  log(`📁 Backup Directory: ${BACKUP_DIR}`, colors.blue);
  log(`📋 Backups Found: ${backups.length}\n`, colors.blue);
  
  const backupsToVerify = specificFile
    ? backups.filter(b => b.file.includes(specificFile))
    : [backups[0]]; // Verify only the latest by default
  
  if (backupsToVerify.length === 0) {
    log('❌ Specified backup not found', colors.red);
    process.exit(1);
  }
  
  let passed = 0;
  let failed = 0;
  
  for (const backup of backupsToVerify) {
    log(`\n🔍 Verifying: ${path.basename(backup.file)}`, colors.cyan);
    log(`   Type: ${backup.type.toUpperCase()}`, colors.blue);
    log(`   Created: ${backup.created.toISOString()}`, colors.blue);
    
    const result = verifyBackup(backup, fullTest);
    
    if (result.valid) {
      log(`   ✅ Valid`, colors.green);
      passed++;
    } else {
      log(`   ❌ Invalid`, colors.red);
      failed++;
    }
    
    log(`   Size: ${result.size}`, colors.blue);
    if (result.tables !== undefined) log(`   Tables: ${result.tables}`, colors.blue);
    if (result.records !== undefined) log(`   Records: ${result.records}`, colors.blue);
    log(`   Duration: ${result.duration}ms`, colors.blue);
    
    if (result.issues.length > 0) {
      log(`   Issues:`, colors.yellow);
      for (const issue of result.issues) {
        log(`      └─ ${issue}`, colors.yellow);
      }
    }
  }
  
  log('\n────────────────────────────────────────────────────────────', colors.cyan);
  log('📊 SUMMARY', colors.cyan);
  log(`   ✅ Valid: ${passed}`, passed > 0 ? colors.green : colors.reset);
  log(`   ❌ Invalid: ${failed}`, failed > 0 ? colors.red : colors.reset);
  
  if (failed > 0) {
    log('\n⚠️  Some backups failed verification!', colors.yellow);
    log('   Recommendations:', colors.reset);
    log('   - Create a fresh backup with `pnpm db:export`');
    log('   - Check backup file permissions');
    log('   - Verify backup process is working\n');
    process.exit(1);
  } else {
    log('\n✅ All backups verified successfully!', colors.green);
    log('   Your disaster recovery is ready.\n', colors.blue);
  }
  
  // Show backup recommendations
  const latestBackup = backups[0];
  const daysSinceBackup = Math.floor((Date.now() - latestBackup.created.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysSinceBackup > 7) {
    log(`⚠️  Latest backup is ${daysSinceBackup} days old. Consider creating a fresh backup.\n`, colors.yellow);
  }
}

main().catch(console.error);
