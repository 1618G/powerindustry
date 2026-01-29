/**
 * Base Repository - Shared types and utilities for all repositories
 *
 * PURPOSE: Provide common patterns for data access layer
 *
 * LAYER: Repository (data access only)
 */

// ============================================
// Pagination Types
// ============================================

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================
// Result Types (for error handling)
// ============================================

export type RepositoryResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function success<T>(data: T): RepositoryResult<T> {
  return { success: true, data };
}

export function failure<T>(error: string): RepositoryResult<T> {
  return { success: false, error };
}

// ============================================
// Common Filters
// ============================================

export interface DateRangeFilter {
  from?: Date;
  to?: Date;
}

export interface SearchFilter {
  query?: string;
  fields?: string[];
}

// ============================================
// Pagination Helpers
// ============================================

export function getPaginationParams(options: PaginationOptions): {
  skip: number;
  take: number;
  orderBy: Record<string, "asc" | "desc"> | undefined;
} {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));

  return {
    skip: (page - 1) * limit,
    take: limit,
    orderBy: options.sortBy
      ? { [options.sortBy]: options.sortOrder || "desc" }
      : undefined,
  };
}

export function createPaginatedResult<T>(
  data: T[],
  total: number,
  options: PaginationOptions
): PaginatedResult<T> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

// ============================================
// Soft Delete Helper
// ============================================

export const notDeleted = {
  deletedAt: null,
};

// ============================================
// Select Helpers (for common select patterns)
// ============================================

export const userBasicSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

export const userWithProfileSelect = {
  ...userBasicSelect,
  emailVerified: true,
  profile: {
    select: {
      avatar: true,
      bio: true,
      phone: true,
      company: true,
      jobTitle: true,
      location: true,
      timezone: true,
    },
  },
} as const;

// ============================================
// Base Repository Abstract Class
// ============================================

/**
 * Abstract base repository class that provides common patterns
 * for all entity repositories.
 * 
 * @template T - The entity type
 * @template CreateInput - The input type for creating entities
 * @template UpdateInput - The input type for updating entities
 */
export abstract class BaseRepository<T, CreateInput, UpdateInput> {
  protected abstract model: any;

  abstract findById(id: string): Promise<T | null>;
  abstract findMany(options?: PaginationOptions): Promise<PaginatedResult<T> | T[]>;
  abstract create(data: CreateInput): Promise<T>;
  abstract update(id: string, data: UpdateInput): Promise<T>;
  abstract delete(id: string): Promise<boolean>;

  /**
   * Get pagination parameters for Prisma queries
   */
  protected getPaginationParams(options?: PaginationOptions): {
    skip: number;
    take: number;
    page: number;
    limit: number;
  } {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 20));

    return {
      skip: (page - 1) * limit,
      take: limit,
      page,
      limit,
    };
  }

  /**
   * Calculate pagination metadata
   */
  protected calculatePagination(total: number, page: number, limit: number) {
    const totalPages = Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}
