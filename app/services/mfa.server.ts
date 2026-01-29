/**
 * MFA Service - Two-Factor Authentication (TOTP)
 * Implements RFC 6238 TOTP with backup codes
 */

import crypto from "crypto";
import { db } from "~/lib/prisma";
import { encryptSensitiveData, decryptSensitiveData, logSecurityEvent } from "./soc2-compliance.server";

// ============================================
// Configuration
// ============================================

const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = "sha1";
const BACKUP_CODE_COUNT = 10;

// ============================================
// Types
// ============================================

export interface MFASetupResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface MFAVerifyResult {
  valid: boolean;
  usedBackupCode?: boolean;
}

// ============================================
// TOTP Generation
// ============================================

function generateSecret(): string {
  // Generate 20 random bytes and encode as base32
  const buffer = crypto.randomBytes(20);
  return base32Encode(buffer);
}

function base32Encode(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let result = "";
  let bits = 0;
  let value = 0;

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }

  return result;
}

function base32Decode(encoded: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanInput = encoded.toUpperCase().replace(/=+$/, "");

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of cleanInput) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function generateTOTP(secret: string, time?: number): string {
  const counter = Math.floor((time || Date.now()) / 1000 / TOTP_PERIOD);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const key = base32Decode(secret);
  const hmac = crypto.createHmac(TOTP_ALGORITHM, key);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, "0");
}

function verifyTOTP(secret: string, token: string, window: number = 1): boolean {
  const now = Date.now();

  // Check current and adjacent time windows
  for (let i = -window; i <= window; i++) {
    const time = now + i * TOTP_PERIOD * 1000;
    if (generateTOTP(secret, time) === token) {
      return true;
    }
  }

  return false;
}

// ============================================
// Backup Codes
// ============================================

function generateBackupCodes(): string[] {
  const codes: string[] = [];

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
    codes.push(formatted);
  }

  return codes;
}

function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(code.toUpperCase().replace(/-/g, "")).digest("hex");
}

// ============================================
// MFA Setup
// ============================================

export async function setupMFA(userId: string): Promise<MFASetupResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, mfaEnabled: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.mfaEnabled) {
    throw new Error("MFA is already enabled");
  }

  // Generate secret and backup codes
  const secret = generateSecret();
  const backupCodes = generateBackupCodes();

  // Encrypt secret before storing
  const encrypted = encryptSensitiveData(secret);
  const encryptedSecret = JSON.stringify(encrypted);

  // Hash backup codes
  const hashedCodes = backupCodes.map(hashBackupCode);

  // Store temporarily (not enabled yet)
  await db.user.update({
    where: { id: userId },
    data: {
      mfaSecret: encryptedSecret,
    },
  });

  // Store backup codes
  await db.setting.upsert({
    where: { key: `mfa_backup_${userId}` },
    create: {
      key: `mfa_backup_${userId}`,
      value: JSON.stringify(hashedCodes),
      type: "json",
      encrypted: true,
    },
    update: {
      value: JSON.stringify(hashedCodes),
    },
  });

  // Generate QR code URL (otpauth format)
  const appName = encodeURIComponent(process.env.APP_NAME || "ZZA Platform");
  const email = encodeURIComponent(user.email);
  const qrCodeUrl = `otpauth://totp/${appName}:${email}?secret=${secret}&issuer=${appName}&algorithm=${TOTP_ALGORITHM.toUpperCase()}&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;

  return {
    secret,
    qrCodeUrl,
    backupCodes,
  };
}

export async function confirmMFASetup(userId: string, token: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabled: true },
  });

  if (!user || !user.mfaSecret || user.mfaEnabled) {
    return false;
  }

  // Decrypt secret
  const encrypted = JSON.parse(user.mfaSecret);
  const secret = decryptSensitiveData(encrypted.encrypted, encrypted.iv, encrypted.tag);

  // Verify token
  if (!verifyTOTP(secret, token)) {
    return false;
  }

  // Enable MFA
  await db.user.update({
    where: { id: userId },
    data: { mfaEnabled: true },
  });

  await logSecurityEvent("mfa_enabled", "info", `MFA enabled for user ${userId}`, { userId });

  return true;
}

// ============================================
// MFA Verification
// ============================================

export async function verifyMFA(userId: string, token: string): Promise<MFAVerifyResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabled: true },
  });

  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    return { valid: false };
  }

  // Try TOTP first
  const encrypted = JSON.parse(user.mfaSecret);
  const secret = decryptSensitiveData(encrypted.encrypted, encrypted.iv, encrypted.tag);

  if (verifyTOTP(secret, token)) {
    return { valid: true };
  }

  // Try backup code
  const backupResult = await verifyBackupCode(userId, token);
  if (backupResult) {
    await logSecurityEvent("backup_code_used", "medium", `Backup code used for user ${userId}`, { userId });
    return { valid: true, usedBackupCode: true };
  }

  await logSecurityEvent("mfa_failed", "medium", `MFA verification failed for user ${userId}`, { userId });
  return { valid: false };
}

async function verifyBackupCode(userId: string, code: string): Promise<boolean> {
  const setting = await db.setting.findFirst({
    where: { key: `mfa_backup_${userId}` },
  });

  if (!setting) return false;

  const hashedCodes: string[] = JSON.parse(setting.value);
  const hashedInput = hashBackupCode(code);
  const index = hashedCodes.indexOf(hashedInput);

  if (index === -1) return false;

  // Remove used code
  hashedCodes.splice(index, 1);
  await db.setting.update({
    where: { id: setting.id },
    data: { value: JSON.stringify(hashedCodes) },
  });

  return true;
}

// ============================================
// MFA Disable
// ============================================

export async function disableMFA(userId: string, token: string): Promise<boolean> {
  // Verify current MFA before disabling
  const result = await verifyMFA(userId, token);
  if (!result.valid) {
    return false;
  }

  await db.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: false,
      mfaSecret: null,
    },
  });

  // Remove backup codes
  await db.setting.deleteMany({
    where: { key: `mfa_backup_${userId}` },
  });

  await logSecurityEvent("mfa_disabled", "medium", `MFA disabled for user ${userId}`, { userId });

  return true;
}

// ============================================
// Regenerate Backup Codes
// ============================================

export async function regenerateBackupCodes(userId: string, token: string): Promise<string[] | null> {
  const result = await verifyMFA(userId, token);
  if (!result.valid) {
    return null;
  }

  const backupCodes = generateBackupCodes();
  const hashedCodes = backupCodes.map(hashBackupCode);

  await db.setting.upsert({
    where: { key: `mfa_backup_${userId}` },
    create: {
      key: `mfa_backup_${userId}`,
      value: JSON.stringify(hashedCodes),
      type: "json",
      encrypted: true,
    },
    update: {
      value: JSON.stringify(hashedCodes),
    },
  });

  await logSecurityEvent("backup_codes_regenerated", "medium", `Backup codes regenerated for user ${userId}`, { userId });

  return backupCodes;
}

// ============================================
// MFA Status
// ============================================

export async function getMFAStatus(userId: string): Promise<{
  enabled: boolean;
  backupCodesRemaining: number;
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true },
  });

  if (!user?.mfaEnabled) {
    return { enabled: false, backupCodesRemaining: 0 };
  }

  const setting = await db.setting.findFirst({
    where: { key: `mfa_backup_${userId}` },
  });

  const codesRemaining = setting ? JSON.parse(setting.value).length : 0;

  return {
    enabled: true,
    backupCodesRemaining: codesRemaining,
  };
}

// ============================================
// Check if MFA Required
// ============================================

export async function isMFARequired(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true },
  });

  return user?.mfaEnabled || false;
}

// ============================================
// Helper Exports (for routes that need direct access)
// ============================================

/**
 * Generate a new TOTP secret
 * Exported for use in security settings routes
 */
export function generateTOTPSecret(): string {
  return generateSecret();
}

/**
 * Verify a TOTP token against a secret (exported version)
 * Exported for use in MFA verification routes
 * 
 * Note: This wraps the internal verifyTOTP function for external use
 * 
 * @param secret - The TOTP secret
 * @param token - The token to verify
 * @param window - Time window for verification (default 1)
 */
export { verifyTOTP };