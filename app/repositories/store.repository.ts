/**
 * Store Repository - Data access for Store entity
 *
 * PURPOSE: All database operations for stores
 *
 * LAYER: Repository (data access only)
 */

import { db } from "~/lib/prisma";
import type { StoreType, StoreStatus, StoreRole, Prisma } from "@prisma/client";

// ============================================
// Types
// ============================================

export interface CreateStoreInput {
  ownerUserId: string;
  type: StoreType;
  name: string;
  slug: string;
  description?: string;
  images?: Prisma.InputJsonValue;
  coverImage?: string;
  logoImage?: string;
  locationPublic?: Prisma.InputJsonValue;
  locationPrivacy?: string;
  contact?: Prisma.InputJsonValue;
  socials?: Prisma.InputJsonValue;
  businessFields?: Prisma.InputJsonValue;
  policies?: Prisma.InputJsonValue;
}

export interface UpdateStoreInput {
  name?: string;
  description?: string;
  images?: Prisma.InputJsonValue;
  coverImage?: string;
  logoImage?: string;
  locationPublic?: Prisma.InputJsonValue;
  locationPrivacy?: string;
  contact?: Prisma.InputJsonValue;
  socials?: Prisma.InputJsonValue;
  businessFields?: Prisma.InputJsonValue;
  policies?: Prisma.InputJsonValue;
  openingHours?: Prisma.InputJsonValue;
  status?: StoreStatus;
}

export interface StoreFilters {
  ownerUserId?: string;
  type?: StoreType;
  status?: StoreStatus;
  search?: string;
}

// ============================================
// Repository Class
// ============================================

class StoreRepositoryClass {
  /**
   * Find store by ID
   */
  async findById(id: string) {
    return db.store.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            displayName: true,
            handle: true,
            avatarUrl: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find store by slug (for public pages)
   */
  async findBySlug(slug: string) {
    return db.store.findUnique({
      where: { slug },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            displayName: true,
            handle: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  /**
   * Find stores by owner
   */
  async findByOwner(ownerUserId: string) {
    return db.store.findMany({
      where: { ownerUserId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Count stores by owner and type
   */
  async countByOwnerAndType(ownerUserId: string, type: StoreType): Promise<number> {
    return db.store.count({
      where: { ownerUserId, type },
    });
  }

  /**
   * Check if user has reached store cap for a type
   * Cap: 1 personal + 1 business per user
   */
  async hasReachedCap(ownerUserId: string, type: StoreType): Promise<boolean> {
    const count = await this.countByOwnerAndType(ownerUserId, type);
    return count >= 1; // Max 1 of each type
  }

  /**
   * Create a new store
   */
  async create(data: CreateStoreInput) {
    return db.store.create({
      data: {
        ...data,
        // Create owner membership automatically
        memberships: {
          create: {
            userId: data.ownerUserId,
            role: "OWNER",
            acceptedAt: new Date(),
          },
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        memberships: true,
      },
    });
  }

  /**
   * Update store
   */
  async update(id: string, data: UpdateStoreInput) {
    return db.store.update({
      where: { id },
      data,
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Update store status
   */
  async updateStatus(id: string, status: StoreStatus) {
    return db.store.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Check if slug is available
   */
  async slugExists(slug: string, excludeStoreId?: string): Promise<boolean> {
    const store = await db.store.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!store) return false;
    if (excludeStoreId && store.id === excludeStoreId) return false;
    return true;
  }

  /**
   * Find stores where user is a member
   */
  async findByMember(userId: string) {
    return db.store.findMany({
      where: {
        memberships: {
          some: {
            userId,
            isActive: true,
          },
        },
      },
      include: {
        memberships: {
          where: { userId },
          select: { role: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get user's role in a store
   */
  async getUserRole(storeId: string, userId: string): Promise<StoreRole | null> {
    const membership = await db.storeMembership.findUnique({
      where: {
        storeId_userId: { storeId, userId },
      },
      select: { role: true, isActive: true },
    });

    if (!membership || !membership.isActive) return null;
    return membership.role;
  }

  /**
   * Check if user is store owner
   */
  async isOwner(storeId: string, userId: string): Promise<boolean> {
    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { ownerUserId: true },
    });

    return store?.ownerUserId === userId;
  }

  /**
   * Check if user has access to store (is member)
   */
  async hasAccess(storeId: string, userId: string): Promise<boolean> {
    const role = await this.getUserRole(storeId, userId);
    return role !== null;
  }

  /**
   * Add member to store
   */
  async addMember(storeId: string, userId: string, role: StoreRole, invitedBy: string) {
    return db.storeMembership.create({
      data: {
        storeId,
        userId,
        role,
        invitedBy,
      },
    });
  }

  /**
   * Update member role
   */
  async updateMemberRole(storeId: string, userId: string, role: StoreRole) {
    return db.storeMembership.update({
      where: {
        storeId_userId: { storeId, userId },
      },
      data: { role },
    });
  }

  /**
   * Remove member from store
   */
  async removeMember(storeId: string, userId: string) {
    return db.storeMembership.update({
      where: {
        storeId_userId: { storeId, userId },
      },
      data: { isActive: false },
    });
  }

  /**
   * Get store members
   */
  async getMembers(storeId: string) {
    return db.storeMembership.findMany({
      where: {
        storeId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Update Stripe Connect status
   */
  async updateStripeConnect(
    id: string,
    data: {
      stripeConnectId?: string;
      stripeConnectStatus?: string;
      stripeConnectOnboarded?: boolean;
    }
  ) {
    return db.store.update({
      where: { id },
      data,
    });
  }
}

export const storeRepository = new StoreRepositoryClass();
