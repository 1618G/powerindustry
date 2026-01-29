/**
 * User Repository Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "../setup";

// Mock Prisma client
vi.mock("~/lib/prisma", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
    },
  },
}));

import { userRepository } from "~/repositories/user.repository";
import { db } from "~/lib/prisma";

describe("UserRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findById", () => {
    it("should return user when found", async () => {
      const mockUser = createMockUser();
      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);

      const result = await userRepository.findById("test-user-id");

      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { id: "test-user-id" },
      });
      expect(result).toEqual(mockUser);
    });

    it("should return null when not found", async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue(null);

      const result = await userRepository.findById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findByEmail", () => {
    it("should find user by lowercase email", async () => {
      const mockUser = createMockUser({ email: "test@example.com" });
      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);

      const result = await userRepository.findByEmail("TEST@EXAMPLE.COM");

      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe("create", () => {
    it("should create user with lowercase email", async () => {
      const mockUser = createMockUser();
      vi.mocked(db.user.create).mockResolvedValue(mockUser as any);

      const result = await userRepository.create({
        email: "NEW@EXAMPLE.COM",
        passwordHash: "hashed",
        name: "New User",
      });

      expect(db.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: "new@example.com",
        }),
      });
      expect(result).toEqual(mockUser);
    });

    it("should set default role to USER", async () => {
      const mockUser = createMockUser();
      vi.mocked(db.user.create).mockResolvedValue(mockUser as any);

      await userRepository.create({
        email: "test@example.com",
      });

      expect(db.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          role: "USER",
        }),
      });
    });
  });

  describe("findMany", () => {
    it("should return paginated results", async () => {
      const mockUsers = [createMockUser(), createMockUser({ id: "user-2" })];
      vi.mocked(db.user.findMany).mockResolvedValue(mockUsers as any);
      vi.mocked(db.user.count).mockResolvedValue(25);

      const result = await userRepository.findMany({ page: 2, limit: 10 });

      expect(db.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
      expect(result.pagination).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      });
    });

    it("should apply filters", async () => {
      vi.mocked(db.user.findMany).mockResolvedValue([]);
      vi.mocked(db.user.count).mockResolvedValue(0);

      await userRepository.findMany(undefined, {
        role: "ADMIN",
        isActive: true,
        search: "test",
      });

      expect(db.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: "ADMIN",
            isActive: true,
            OR: expect.any(Array),
          }),
        })
      );
    });
  });

  describe("emailExists", () => {
    it("should return true when email exists", async () => {
      vi.mocked(db.user.findFirst).mockResolvedValue({ id: "test" } as any);

      const exists = await userRepository.emailExists("test@example.com");

      expect(exists).toBe(true);
    });

    it("should return false when email does not exist", async () => {
      vi.mocked(db.user.findFirst).mockResolvedValue(null);

      const exists = await userRepository.emailExists("new@example.com");

      expect(exists).toBe(false);
    });

    it("should exclude specific user ID", async () => {
      vi.mocked(db.user.findFirst).mockResolvedValue(null);

      await userRepository.emailExists("test@example.com", "exclude-id");

      expect(db.user.findFirst).toHaveBeenCalledWith({
        where: {
          email: "test@example.com",
          id: { not: "exclude-id" },
        },
        select: { id: true },
      });
    });
  });

  describe("recordFailedLogin", () => {
    it("should increment failed login attempts", async () => {
      vi.mocked(db.user.update).mockResolvedValue({ failedLoginAttempts: 3 } as any);

      const attempts = await userRepository.recordFailedLogin("user-id");

      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: "user-id" },
        data: {
          failedLoginAttempts: { increment: 1 },
        },
        select: { failedLoginAttempts: true },
      });
      expect(attempts).toBe(3);
    });
  });

  describe("countByRole", () => {
    it("should return counts grouped by role", async () => {
      vi.mocked(db.user.groupBy).mockResolvedValue([
        { role: "USER", _count: 10 },
        { role: "ADMIN", _count: 2 },
      ] as any);

      const result = await userRepository.countByRole();

      expect(result).toEqual({
        USER: 10,
        ADMIN: 2,
      });
    });
  });
});
