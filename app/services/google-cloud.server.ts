/**
 * Google Cloud Service - Storage, and other GCP services
 * Provides unified API for Google Cloud Platform operations
 */

import { Storage } from "@google-cloud/storage";
import path from "path";
import { db } from "~/lib/prisma";

// ============================================
// Configuration
// ============================================

const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID;
const GCS_BUCKET = process.env.GCS_BUCKET;
const GCS_KEY_FILE = process.env.GCS_KEY_FILE;

// Initialize Google Cloud Storage
const storage = GCS_PROJECT_ID && GCS_KEY_FILE
  ? new Storage({
      projectId: GCS_PROJECT_ID,
      keyFilename: GCS_KEY_FILE,
    })
  : null;

// ============================================
// Cloud Storage
// ============================================

export async function uploadToGCS(
  buffer: Buffer,
  filename: string,
  options: {
    folder?: string;
    contentType?: string;
    public?: boolean;
    metadata?: Record<string, string>;
  } = {}
): Promise<{ url: string; path: string }> {
  if (!storage || !GCS_BUCKET) {
    throw new Error("Google Cloud Storage not configured");
  }

  const bucket = storage.bucket(GCS_BUCKET);
  const date = new Date();
  const folderPath = options.folder || `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  const gcsPath = `${folderPath}/${Date.now()}-${filename}`;

  const file = bucket.file(gcsPath);

  await file.save(buffer, {
    contentType: options.contentType,
    metadata: {
      cacheControl: "public, max-age=31536000",
      metadata: options.metadata,
    },
  });

  if (options.public) {
    await file.makePublic();
  }

  const url = options.public
    ? `https://storage.googleapis.com/${GCS_BUCKET}/${gcsPath}`
    : await getSignedUrl(gcsPath);

  return { url, path: gcsPath };
}

export async function getSignedUrl(
  gcsPath: string,
  expiresMinutes: number = 60
): Promise<string> {
  if (!storage || !GCS_BUCKET) {
    throw new Error("Google Cloud Storage not configured");
  }

  const bucket = storage.bucket(GCS_BUCKET);
  const file = bucket.file(gcsPath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresMinutes * 60 * 1000,
  });

  return url;
}

export async function deleteFromGCS(gcsPath: string): Promise<boolean> {
  if (!storage || !GCS_BUCKET) {
    throw new Error("Google Cloud Storage not configured");
  }

  const bucket = storage.bucket(GCS_BUCKET);
  const file = bucket.file(gcsPath);

  try {
    await file.delete();
    return true;
  } catch {
    return false;
  }
}

export async function listGCSFiles(
  prefix: string,
  maxResults: number = 100
): Promise<Array<{ name: string; size: number; updated: Date }>> {
  if (!storage || !GCS_BUCKET) {
    throw new Error("Google Cloud Storage not configured");
  }

  const bucket = storage.bucket(GCS_BUCKET);
  const [files] = await bucket.getFiles({ prefix, maxResults });

  return files.map((file) => ({
    name: file.name,
    size: parseInt(file.metadata.size as string) || 0,
    updated: new Date(file.metadata.updated as string),
  }));
}

export async function copyGCSFile(
  sourcePath: string,
  destinationPath: string
): Promise<string> {
  if (!storage || !GCS_BUCKET) {
    throw new Error("Google Cloud Storage not configured");
  }

  const bucket = storage.bucket(GCS_BUCKET);
  await bucket.file(sourcePath).copy(bucket.file(destinationPath));
  return destinationPath;
}

// ============================================
// File Upload Integration
// ============================================

export async function uploadFileToCloud(
  file: File,
  options: {
    userId?: string;
    folder?: string;
    public?: boolean;
  } = {}
): Promise<{
  id: string;
  url: string;
  path: string;
  filename: string;
  size: number;
  mimeType: string;
}> {
  const buffer = Buffer.from(await file.arrayBuffer());

  const { url, path: gcsPath } = await uploadToGCS(buffer, file.name, {
    folder: options.folder,
    contentType: file.type,
    public: options.public,
  });

  // Create database record
  const fileRecord = await db.file.create({
    data: {
      userId: options.userId,
      filename: file.name,
      storagePath: gcsPath,
      storageType: "gcs",
      mimeType: file.type,
      size: file.size,
      type: getFileType(file.type),
      status: "READY",
      isPublic: options.public ?? false,
    },
  });

  return {
    id: fileRecord.id,
    url,
    path: gcsPath,
    filename: file.name,
    size: file.size,
    mimeType: file.type,
  };
}

function getFileType(mimeType: string): "IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO" | "OTHER" {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("video/")) return "VIDEO";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  if (
    mimeType.includes("pdf") ||
    mimeType.includes("document") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("text/")
  ) {
    return "DOCUMENT";
  }
  return "OTHER";
}

// ============================================
// Cloud Tasks (for background jobs)
// ============================================

export async function createCloudTask(
  queueName: string,
  payload: object,
  options: {
    scheduleTime?: Date;
    httpMethod?: "POST" | "GET";
    url: string;
  }
): Promise<string> {
  // This would use @google-cloud/tasks
  // Placeholder implementation
  console.log(`Creating cloud task in queue ${queueName}:`, payload);
  return `task-${Date.now()}`;
}

// ============================================
// Cloud Pub/Sub (for events)
// ============================================

export async function publishMessage(
  topicName: string,
  data: object,
  attributes?: Record<string, string>
): Promise<string> {
  // This would use @google-cloud/pubsub
  // Placeholder implementation
  console.log(`Publishing to topic ${topicName}:`, data);
  return `message-${Date.now()}`;
}

// ============================================
// Utility Functions
// ============================================

export function isGCSConfigured(): boolean {
  return !!(GCS_PROJECT_ID && GCS_BUCKET && GCS_KEY_FILE);
}

export function getStorageType(): "local" | "gcs" | "s3" {
  if (isGCSConfigured()) return "gcs";
  if (process.env.S3_BUCKET) return "s3";
  return "local";
}

