/**
 * Listing Repository - Data access for Listing entity
 *
 * PURPOSE: All database operations for listings
 *
 * LAYER: Repository (data access only)
 */

import { db } from "~/lib/prisma";
import type { ListingType, ListingStatus, ListingCondition, Prisma } from "@prisma/client";

// ============================================
// Types
// ============================================

export interface CreateListingInput {
  storeId: string;
  type: ListingType;
  title: string;
  slug: string;
  description: string;
  shortDescription?: string;
  price?: number;
  currency?: string;
  compareAtPrice?: number;
  quantity?: number;
  trackInventory?: boolean;
  allowBackorder?: boolean;
  isPublic?: boolean;
  locationPublic?: Prisma.InputJsonValue;
  locationPrivacy?: string;
  metaTitle?: string;
  metaDescription?: string;
}

export interface UpdateListingInput {
  title?: string;
  description?: string;
  shortDescription?: string;
  price?: number;
  compareAtPrice?: number;
  quantity?: number;
  trackInventory?: boolean;
  allowBackorder?: boolean;
  isPublic?: boolean;
  isFeatured?: boolean;
  locationPublic?: Prisma.InputJsonValue;
  locationPrivacy?: string;
  metaTitle?: string;
  metaDescription?: string;
  expiresAt?: Date | null;
}

export interface CreateSellDetailsInput {
  listingId: string;
  condition?: ListingCondition;
  isDigital?: boolean;
  weight?: number;
  dimensions?: Prisma.InputJsonValue;
  shippingOptions?: Prisma.InputJsonValue;
  freeShipping?: boolean;
  localPickup?: boolean;
  acceptsReturns?: boolean;
  returnPeriodDays?: number;
  warrantyInfo?: string;
  downloadUrl?: string;
  downloadLimit?: number;
  hasVariations?: boolean;
  variations?: Prisma.InputJsonValue;
}

export interface CreateMediaInput {
  listingId: string;
  type: string;
  url: string;
  thumbnailUrl?: string;
  altText?: string;
  caption?: string;
  sortOrder?: number;
  isPrimary?: boolean;
  metadata?: Prisma.InputJsonValue;
}

export interface ListingFilters {
  storeId?: string;
  type?: ListingType;
  status?: ListingStatus;
  isPublic?: boolean;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
}

// ============================================
// Repository Class
// ============================================

class ListingRepositoryClass {
  /**
   * Find listing by ID
   */
  async findById(id: string) {
    return db.listing.findUnique({
      where: { id },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            ownerUserId: true,
          },
        },
        media: {
          orderBy: { sortOrder: "asc" },
        },
        sellDetails: true,
      },
    });
  }

  /**
   * Find listing by store and slug
   */
  async findByStoreAndSlug(storeId: string, slug: string) {
    return db.listing.findUnique({
      where: {
        storeId_slug: { storeId, slug },
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            ownerUserId: true,
          },
        },
        media: {
          orderBy: { sortOrder: "asc" },
        },
        sellDetails: true,
      },
    });
  }

  /**
   * Find listings by store
   */
  async findByStore(storeId: string, includeUnpublished = false) {
    const where: Prisma.ListingWhereInput = { storeId };
    
    if (!includeUnpublished) {
      where.status = "PUBLISHED";
      where.isPublic = true;
    }

    return db.listing.findMany({
      where,
      include: {
        media: {
          where: { isPrimary: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Count listings by store
   */
  async countByStore(storeId: string, status?: ListingStatus): Promise<number> {
    return db.listing.count({
      where: { storeId, status },
    });
  }

  /**
   * Check if slug exists for store
   */
  async slugExists(storeId: string, slug: string, excludeListingId?: string): Promise<boolean> {
    const listing = await db.listing.findUnique({
      where: {
        storeId_slug: { storeId, slug },
      },
      select: { id: true },
    });

    if (!listing) return false;
    if (excludeListingId && listing.id === excludeListingId) return false;
    return true;
  }

  /**
   * Create a new listing
   */
  async create(data: CreateListingInput) {
    return db.listing.create({
      data: {
        ...data,
        price: data.price !== undefined ? new Prisma.Decimal(data.price) : undefined,
        compareAtPrice: data.compareAtPrice !== undefined ? new Prisma.Decimal(data.compareAtPrice) : undefined,
      },
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
   * Update listing
   */
  async update(id: string, data: UpdateListingInput) {
    return db.listing.update({
      where: { id },
      data: {
        ...data,
        price: data.price !== undefined ? new Prisma.Decimal(data.price) : undefined,
        compareAtPrice: data.compareAtPrice !== undefined ? new Prisma.Decimal(data.compareAtPrice) : undefined,
      },
      include: {
        media: {
          orderBy: { sortOrder: "asc" },
        },
        sellDetails: true,
      },
    });
  }

  /**
   * Update listing status
   */
  async updateStatus(id: string, status: ListingStatus, publishedAt?: Date) {
    return db.listing.update({
      where: { id },
      data: {
        status,
        publishedAt: publishedAt || (status === "PUBLISHED" ? new Date() : undefined),
      },
    });
  }

  /**
   * Delete listing
   */
  async delete(id: string) {
    return db.listing.delete({
      where: { id },
    });
  }

  /**
   * Add sell details
   */
  async createSellDetails(data: CreateSellDetailsInput) {
    return db.listingTypeSell.create({
      data: {
        ...data,
        weight: data.weight !== undefined ? new Prisma.Decimal(data.weight) : undefined,
      },
    });
  }

  /**
   * Update sell details
   */
  async updateSellDetails(listingId: string, data: Partial<CreateSellDetailsInput>) {
    return db.listingTypeSell.update({
      where: { listingId },
      data: {
        ...data,
        weight: data.weight !== undefined ? new Prisma.Decimal(data.weight) : undefined,
      },
    });
  }

  /**
   * Add media to listing
   */
  async addMedia(data: CreateMediaInput) {
    return db.listingMedia.create({
      data,
    });
  }

  /**
   * Update media
   */
  async updateMedia(id: string, data: Partial<CreateMediaInput>) {
    return db.listingMedia.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete media
   */
  async deleteMedia(id: string) {
    return db.listingMedia.delete({
      where: { id },
    });
  }

  /**
   * Reorder media
   */
  async reorderMedia(listingId: string, mediaIds: string[]) {
    const updates = mediaIds.map((id, index) =>
      db.listingMedia.update({
        where: { id },
        data: { sortOrder: index },
      })
    );
    return db.$transaction(updates);
  }

  /**
   * Set primary media
   */
  async setPrimaryMedia(listingId: string, mediaId: string) {
    // First unset all primary
    await db.listingMedia.updateMany({
      where: { listingId },
      data: { isPrimary: false },
    });

    // Then set the new primary
    return db.listingMedia.update({
      where: { id: mediaId },
      data: { isPrimary: true },
    });
  }

  /**
   * Get listing media
   */
  async getMedia(listingId: string) {
    return db.listingMedia.findMany({
      where: { listingId },
      orderBy: { sortOrder: "asc" },
    });
  }

  /**
   * Increment view count
   */
  async incrementViewCount(id: string) {
    return db.listing.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
  }

  /**
   * Update quantity after sale
   */
  async decrementQuantity(id: string, amount = 1) {
    return db.listing.update({
      where: { id },
      data: {
        quantity: { decrement: amount },
        quantitySold: { increment: amount },
      },
    });
  }

  /**
   * Search listings
   */
  async search(filters: ListingFilters, limit = 20, offset = 0) {
    const where: Prisma.ListingWhereInput = {
      status: "PUBLISHED",
      isPublic: true,
    };

    if (filters.storeId) where.storeId = filters.storeId;
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (typeof filters.isPublic === "boolean") where.isPublic = filters.isPublic;

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      where.price = {};
      if (filters.minPrice !== undefined) where.price.gte = new Prisma.Decimal(filters.minPrice);
      if (filters.maxPrice !== undefined) where.price.lte = new Prisma.Decimal(filters.maxPrice);
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [listings, total] = await Promise.all([
      db.listing.findMany({
        where,
        include: {
          store: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          media: {
            where: { isPrimary: true },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.listing.count({ where }),
    ]);

    return { listings, total };
  }
}

export const listingRepository = new ListingRepositoryClass();
