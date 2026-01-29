/**
 * Profile Repository - Data access for Profile entity
 *
 * PURPOSE: All database operations for user profiles
 *
 * LAYER: Repository (data access only)
 */

import { db } from "~/lib/prisma";

// ============================================
// Types
// ============================================

export interface CreateProfileInput {
  userId: string;
  bio?: string;
  avatar?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  location?: string;
  website?: string;
  timezone?: string;
  language?: string;
}

export interface UpdateProfileInput {
  bio?: string;
  avatar?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  location?: string;
  website?: string;
  timezone?: string;
  language?: string;
}

// ============================================
// Repository Class
// ============================================

class ProfileRepositoryClass {
  /**
   * Find profile by user ID
   */
  async findByUserId(userId: string) {
    return db.profile.findUnique({
      where: { userId },
    });
  }

  /**
   * Create profile for user
   */
  async create(data: CreateProfileInput) {
    return db.profile.create({
      data,
    });
  }

  /**
   * Update profile by user ID
   */
  async updateByUserId(userId: string, data: UpdateProfileInput) {
    return db.profile.update({
      where: { userId },
      data,
    });
  }

  /**
   * Upsert profile (create if not exists, update if exists)
   */
  async upsert(userId: string, data: UpdateProfileInput) {
    return db.profile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  /**
   * Delete profile by user ID
   */
  async deleteByUserId(userId: string) {
    return db.profile.delete({
      where: { userId },
    });
  }
}

export const profileRepository = new ProfileRepositoryClass();
