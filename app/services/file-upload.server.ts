/**
 * File Upload Service - Handles file uploads with WebP/WebM optimization
 * Supports: Images (WebP), Videos (WebM), Documents
 */

import { writeFile, mkdir, unlink, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import sharp from "sharp";
import { nanoid } from "nanoid";
import { db } from "~/lib/prisma";
import type { FileType, FileStatus } from "@prisma/client";

// ============================================
// Configuration
// ============================================

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "52428800"); // 50MB
const IMAGE_QUALITY = parseInt(process.env.IMAGE_QUALITY || "80");
const OPTIMIZE_IMAGES = process.env.OPTIMIZE_IMAGES !== "false";

const ALLOWED_MIME_TYPES: Record<FileType, string[]> = {
  IMAGE: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
  VIDEO: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"],
  DOCUMENT: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
  ],
  AUDIO: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/webm"],
  OTHER: [],
};

// ============================================
// Types
// ============================================

interface UploadOptions {
  userId?: string;
  isPublic?: boolean;
  optimize?: boolean;
}

interface UploadResult {
  success: boolean;
  file?: {
    id: string;
    filename: string;
    url: string;
    optimizedUrl?: string;
    thumbnailUrl?: string;
    size: number;
    mimeType: string;
    type: FileType;
  };
  error?: string;
}

interface FileMetadata {
  width?: number;
  height?: number;
  duration?: number;
}

// ============================================
// Helper Functions
// ============================================

function getFileType(mimeType: string): FileType {
  for (const [type, mimes] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (mimes.includes(mimeType)) {
      return type as FileType;
    }
  }
  return "OTHER";
}

function isAllowedMimeType(mimeType: string): boolean {
  return Object.values(ALLOWED_MIME_TYPES).flat().includes(mimeType);
}

function generateFilePath(originalName: string, suffix?: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const id = nanoid(12);
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  const safeName = baseName.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
  const fileName = suffix ? `${safeName}-${id}-${suffix}${ext}` : `${safeName}-${id}${ext}`;
  return `${year}/${month}/${day}/${fileName}`;
}

async function ensureDirectory(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

// ============================================
// Image Optimization (WebP)
// ============================================

async function optimizeImage(
  inputPath: string,
  outputPath: string,
  options: { quality?: number; maxWidth?: number; maxHeight?: number } = {}
): Promise<FileMetadata> {
  const { quality = IMAGE_QUALITY, maxWidth = 2048, maxHeight = 2048 } = options;

  const image = sharp(inputPath);
  const metadata = await image.metadata();

  // Resize if needed
  let width = metadata.width || 0;
  let height = metadata.height || 0;

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  // Convert to WebP
  const webpPath = outputPath.replace(/\.[^.]+$/, ".webp");
  await ensureDirectory(webpPath);

  await image
    .resize(width, height, { fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toFile(webpPath);

  return { width, height };
}

// ============================================
// Generate Thumbnail
// ============================================

async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  size: number = 300
): Promise<string> {
  const thumbPath = outputPath.replace(/\.[^.]+$/, "-thumb.webp");
  await ensureDirectory(thumbPath);

  await sharp(inputPath)
    .resize(size, size, { fit: "cover", position: "center" })
    .webp({ quality: 70 })
    .toFile(thumbPath);

  return thumbPath;
}

// ============================================
// Upload Handler
// ============================================

export async function uploadFile(
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const { userId, isPublic = false, optimize = OPTIMIZE_IMAGES } = options;

  try {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      };
    }

    // Validate mime type
    if (!isAllowedMimeType(file.type)) {
      return {
        success: false,
        error: `File type ${file.type} is not allowed`,
      };
    }

    const fileType = getFileType(file.type);
    const relativePath = generateFilePath(file.name);
    const absolutePath = path.join(UPLOAD_DIR, relativePath);

    // Ensure directory exists
    await ensureDirectory(absolutePath);

    // Write original file
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(absolutePath, buffer);

    // Get file stats
    const stats = await stat(absolutePath);

    // Create database record
    const fileRecord = await db.file.create({
      data: {
        userId,
        filename: file.name,
        storagePath: relativePath,
        mimeType: file.type,
        size: stats.size,
        type: fileType,
        status: "PROCESSING",
        isPublic,
      },
    });

    let optimizedPath: string | undefined;
    let thumbnailPath: string | undefined;
    let metadata: FileMetadata = {};

    // Process based on file type
    if (fileType === "IMAGE" && optimize) {
      try {
        // Optimize image
        const optimizedRelPath = relativePath.replace(/\.[^.]+$/, "-opt.webp");
        const optimizedAbsPath = path.join(UPLOAD_DIR, optimizedRelPath);
        metadata = await optimizeImage(absolutePath, optimizedAbsPath);
        optimizedPath = optimizedRelPath;

        // Generate thumbnail
        const thumbRelPath = relativePath.replace(/\.[^.]+$/, "-thumb.webp");
        const thumbAbsPath = path.join(UPLOAD_DIR, thumbRelPath);
        await generateThumbnail(absolutePath, thumbAbsPath);
        thumbnailPath = thumbRelPath;
      } catch (err) {
        console.error("Image optimization error:", err);
        // Continue without optimization
      }
    }

    // Update record with metadata
    await db.file.update({
      where: { id: fileRecord.id },
      data: {
        status: "READY",
        width: metadata.width,
        height: metadata.height,
        optimizedPath,
        thumbnailPath,
      },
    });

    const baseUrl = `/uploads/${relativePath}`;

    return {
      success: true,
      file: {
        id: fileRecord.id,
        filename: file.name,
        url: baseUrl,
        optimizedUrl: optimizedPath ? `/uploads/${optimizedPath}` : undefined,
        thumbnailUrl: thumbnailPath ? `/uploads/${thumbnailPath}` : undefined,
        size: stats.size,
        mimeType: file.type,
        type: fileType,
      },
    };
  } catch (error) {
    console.error("Upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

// ============================================
// Delete File
// ============================================

export async function deleteFile(fileId: string, userId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const file = await db.file.findUnique({ where: { id: fileId } });

    if (!file) {
      return { success: false, error: "File not found" };
    }

    // Check ownership if userId provided
    if (userId && file.userId !== userId) {
      return { success: false, error: "Not authorized to delete this file" };
    }

    // Delete physical files
    const filesToDelete = [
      path.join(UPLOAD_DIR, file.storagePath),
      file.optimizedPath ? path.join(UPLOAD_DIR, file.optimizedPath) : null,
      file.thumbnailPath ? path.join(UPLOAD_DIR, file.thumbnailPath) : null,
    ].filter(Boolean) as string[];

    for (const filePath of filesToDelete) {
      try {
        await unlink(filePath);
      } catch (err) {
        // File may already be deleted
      }
    }

    // Update database record
    await db.file.update({
      where: { id: fileId },
      data: { status: "DELETED" },
    });

    return { success: true };
  } catch (error) {
    console.error("Delete error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
}

// ============================================
// Get User Files
// ============================================

export async function getUserFiles(
  userId: string,
  options: { type?: FileType; limit?: number; offset?: number } = {}
) {
  const { type, limit = 50, offset = 0 } = options;

  return db.file.findMany({
    where: {
      userId,
      status: "READY",
      ...(type && { type }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

// ============================================
// Get File by ID
// ============================================

export async function getFile(fileId: string) {
  return db.file.findUnique({
    where: { id: fileId },
  });
}

// ============================================
// Cleanup Failed Uploads
// ============================================

export async function cleanupFailedUploads(olderThanHours: number = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

  const failedFiles = await db.file.findMany({
    where: {
      status: { in: ["PROCESSING", "FAILED"] },
      createdAt: { lt: cutoff },
    },
  });

  let cleaned = 0;
  for (const file of failedFiles) {
    const result = await deleteFile(file.id);
    if (result.success) cleaned++;
  }

  return cleaned;
}

