/**
 * Test Setup - Global test configuration
 */

import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

// ============================================
// Environment Setup
// ============================================

beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-session-secret-minimum-32-characters-long";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test_db";
});

afterAll(() => {
  // Cleanup
});

// ============================================
// Test Isolation
// ============================================

beforeEach(() => {
  // Reset mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
});

// ============================================
// Global Mocks
// ============================================

// Mock console.error to keep test output clean (optional)
// vi.spyOn(console, 'error').mockImplementation(() => {});

// ============================================
// Test Utilities
// ============================================

export function createMockRequest(
  method: string = "GET",
  url: string = "http://localhost:3000",
  options: RequestInit = {}
): Request {
  return new Request(url, {
    method,
    ...options,
  });
}

export function createMockUser(overrides = {}) {
  return {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    role: "USER",
    emailVerified: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockOrganization(overrides = {}) {
  return {
    id: "test-org-id",
    name: "Test Organization",
    slug: "test-org",
    ownerId: "test-user-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
