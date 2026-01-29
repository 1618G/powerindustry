/**
 * Wallet Repository - Data access for Wallet and LedgerEntry entities
 *
 * PURPOSE: All database operations for wallets and ledger entries
 * IMPORTANT: Ledger is append-only - entries are never modified
 *
 * LAYER: Repository (data access only)
 */

import { db } from "~/lib/prisma";
import type { LedgerEntryType, WalletType, Prisma } from "@prisma/client";

// ============================================
// Types
// ============================================

export interface CreateWalletInput {
  type: WalletType;
  storeId?: string;
  communityId?: string;
  currency?: string;
}

export interface CreateLedgerEntryInput {
  walletId: string;
  type: LedgerEntryType;
  amount: number;
  currency?: string;
  orderId?: string;
  orderItemId?: string;
  refundId?: string;
  payoutId?: string;
  description: string;
  metadata?: Prisma.InputJsonValue;
  createdBy?: string;
  reversesId?: string;
}

export interface FeeRuleFilters {
  listingType?: string;
  storeType?: string;
  communityId?: string;
  isActive?: boolean;
}

// ============================================
// Repository Class
// ============================================

class WalletRepositoryClass {
  /**
   * Find wallet by ID
   */
  async findById(id: string) {
    return db.wallet.findUnique({
      where: { id },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  /**
   * Find wallet by store ID
   */
  async findByStoreId(storeId: string) {
    return db.wallet.findUnique({
      where: { storeId },
    });
  }

  /**
   * Find wallet by community ID
   */
  async findByCommunityId(communityId: string) {
    return db.wallet.findUnique({
      where: { communityId },
    });
  }

  /**
   * Create wallet
   */
  async create(data: CreateWalletInput) {
    return db.wallet.create({
      data: {
        type: data.type,
        storeId: data.storeId,
        communityId: data.communityId,
        currency: data.currency || "GBP",
      },
    });
  }

  /**
   * Get or create store wallet
   */
  async getOrCreateStoreWallet(storeId: string) {
    let wallet = await this.findByStoreId(storeId);
    
    if (!wallet) {
      wallet = await this.create({
        type: "STORE",
        storeId,
      });
    }

    return wallet;
  }

  /**
   * Add ledger entry (the core append-only operation)
   * Returns the new entry and updated wallet
   */
  async addEntry(data: CreateLedgerEntryInput) {
    return db.$transaction(async (tx) => {
      // Get current wallet balance
      const wallet = await tx.wallet.findUnique({
        where: { id: data.walletId },
      });

      if (!wallet) {
        throw new Error(`Wallet not found: ${data.walletId}`);
      }

      // Calculate new balance
      const newBalance = wallet.balance + data.amount;

      // Create the ledger entry
      const entry = await tx.ledgerEntry.create({
        data: {
          walletId: data.walletId,
          type: data.type,
          amount: data.amount,
          currency: data.currency || "GBP",
          balanceAfter: newBalance,
          orderId: data.orderId,
          orderItemId: data.orderItemId,
          refundId: data.refundId,
          payoutId: data.payoutId,
          description: data.description,
          metadata: data.metadata,
          createdBy: data.createdBy,
          reversesId: data.reversesId,
        },
      });

      // Update wallet balance and totals
      const updateData: Prisma.WalletUpdateInput = {
        balance: newBalance,
      };

      // Update lifetime totals based on entry type
      if (data.amount > 0 && data.type !== "REFUND_REVERSAL" && data.type !== "RELEASE") {
        updateData.totalReceived = { increment: data.amount };
      }
      if (data.type === "PAYOUT") {
        updateData.totalWithdrawn = { increment: Math.abs(data.amount) };
      }
      if (data.type === "PLATFORM_FEE" || data.type === "COMMUNITY_FEE") {
        updateData.totalFees = { increment: Math.abs(data.amount) };
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: data.walletId },
        data: updateData,
      });

      // If this reverses another entry, mark that entry as reversed
      if (data.reversesId) {
        await tx.ledgerEntry.update({
          where: { id: data.reversesId },
          data: { reversedById: entry.id },
        });
      }

      return { entry, wallet: updatedWallet };
    });
  }

  /**
   * Get ledger entries for wallet
   */
  async getEntries(walletId: string, limit = 50, offset = 0) {
    return db.ledgerEntry.findMany({
      where: { walletId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get entries for an order
   */
  async getEntriesByOrder(orderId: string) {
    return db.ledgerEntry.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
      include: {
        wallet: {
          select: {
            id: true,
            type: true,
            storeId: true,
            communityId: true,
          },
        },
      },
    });
  }

  /**
   * Get entry by ID
   */
  async getEntry(id: string) {
    return db.ledgerEntry.findUnique({
      where: { id },
      include: {
        wallet: true,
      },
    });
  }

  /**
   * Get active fee rules
   */
  async getActiveFeeRules(filters: FeeRuleFilters = {}) {
    const now = new Date();
    const where: Prisma.PlatformFeeRuleWhereInput = {
      isActive: true,
      OR: [
        { validFrom: null },
        { validFrom: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { validUntil: null },
            { validUntil: { gte: now } },
          ],
        },
      ],
    };

    if (filters.listingType) {
      where.OR = [
        { listingType: null },
        { listingType: filters.listingType },
      ];
    }

    if (filters.storeType) {
      where.OR = [
        ...(where.OR || []),
        { storeType: null },
        { storeType: filters.storeType },
      ];
    }

    return db.platformFeeRule.findMany({
      where,
      orderBy: { priority: "desc" },
    });
  }

  /**
   * Get default fee rule
   */
  async getDefaultFeeRule() {
    return db.platformFeeRule.findFirst({
      where: {
        isActive: true,
        listingType: null,
        storeType: null,
        communityId: null,
      },
      orderBy: { priority: "desc" },
    });
  }

  /**
   * Create fee rule
   */
  async createFeeRule(data: {
    name: string;
    description?: string;
    listingType?: string;
    storeType?: string;
    communityId?: string;
    feePercent: number;
    minFee?: number;
    maxFee?: number;
    communitySharePercent?: number;
    priority?: number;
    validFrom?: Date;
    validUntil?: Date;
  }) {
    return db.platformFeeRule.create({
      data,
    });
  }

  /**
   * Update fee rule
   */
  async updateFeeRule(id: string, data: Partial<{
    name: string;
    description: string;
    feePercent: number;
    minFee: number;
    maxFee: number;
    communitySharePercent: number;
    isActive: boolean;
    priority: number;
    validFrom: Date;
    validUntil: Date;
  }>) {
    return db.platformFeeRule.update({
      where: { id },
      data,
    });
  }

  /**
   * Get wallet balance summary
   */
  async getBalanceSummary(walletId: string) {
    const wallet = await db.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      return null;
    }

    return {
      available: wallet.balance,
      pending: wallet.pendingBalance,
      total: wallet.balance + wallet.pendingBalance,
      totalReceived: wallet.totalReceived,
      totalWithdrawn: wallet.totalWithdrawn,
      totalFees: wallet.totalFees,
      currency: wallet.currency,
    };
  }
}

export const walletRepository = new WalletRepositoryClass();
