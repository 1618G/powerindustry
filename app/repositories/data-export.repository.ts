/**
 * Data Export Repository - Data access for GDPR data exports
 */

import { db } from "~/lib/prisma";
import type { DataExportRequest } from "@prisma/client";

// ============================================
// Types
// ============================================

export type DataExportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export type CreateDataExportInput = {
  userId: string;
  format?: string;
};

// ============================================
// Repository
// ============================================

class DataExportRepositoryClass {
  async findById(id: string): Promise<DataExportRequest | null> {
    return db.dataExportRequest.findUnique({ where: { id } });
  }

  async findByUserId(userId: string, limit: number = 5): Promise<DataExportRequest[]> {
    return db.dataExportRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async findPendingByUserId(userId: string): Promise<DataExportRequest | null> {
    return db.dataExportRequest.findFirst({
      where: {
        userId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
  }

  async create(data: CreateDataExportInput): Promise<DataExportRequest> {
    return db.dataExportRequest.create({
      data: {
        userId: data.userId,
        status: "PENDING",
        format: data.format || "json",
      },
    });
  }

  async updateStatus(id: string, status: DataExportStatus, downloadUrl?: string): Promise<void> {
    await db.dataExportRequest.update({
      where: { id },
      data: {
        status,
        downloadUrl,
        completedAt: status === "COMPLETED" ? new Date() : undefined,
      },
    });
  }

  async delete(id: string): Promise<boolean> {
    await db.dataExportRequest.delete({ where: { id } });
    return true;
  }

  async deleteOldExports(daysOld: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const result = await db.dataExportRequest.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });
    return result.count;
  }
}

export const dataExportRepository = new DataExportRepositoryClass();
