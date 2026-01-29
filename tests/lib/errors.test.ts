/**
 * Error Handling Tests
 */

import { describe, it, expect } from "vitest";
import {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  isAppError,
  toErrorResponse,
} from "~/lib/errors";

describe("Error Classes", () => {
  describe("AppError", () => {
    it("should create base error with defaults", () => {
      const error = new AppError("Test error");
      
      expect(error.message).toBe("Test error");
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.isOperational).toBe(true);
    });

    it("should create error with custom properties", () => {
      const error = new AppError("Custom error", 422, "CUSTOM_CODE", { foo: "bar" });
      
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe("CUSTOM_CODE");
      expect(error.details).toEqual({ foo: "bar" });
    });

    it("should serialize to JSON", () => {
      const error = new AppError("Test", 400, "TEST", { field: "value" });
      const json = error.toJSON();
      
      expect(json).toEqual({
        error: "Test",
        code: "TEST",
        details: { field: "value" },
      });
    });
  });

  describe("HTTP Errors", () => {
    it("BadRequestError should have 400 status", () => {
      const error = new BadRequestError("Bad request");
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("BAD_REQUEST");
    });

    it("ValidationError should include fields", () => {
      const error = new ValidationError("Validation failed", {
        email: "Invalid email",
        password: "Too short",
      });
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.fields).toEqual({
        email: "Invalid email",
        password: "Too short",
      });
    });

    it("UnauthorizedError should have 401 status", () => {
      const error = new UnauthorizedError();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe("UNAUTHORIZED");
    });

    it("ForbiddenError should have 403 status", () => {
      const error = new ForbiddenError("No access");
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe("FORBIDDEN");
    });

    it("NotFoundError should have 404 status", () => {
      const error = new NotFoundError("User not found", "user");
      expect(error.statusCode).toBe(404);
      expect(error.details).toEqual({ resource: "user" });
    });

    it("ConflictError should have 409 status", () => {
      const error = new ConflictError("Already exists");
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe("CONFLICT");
    });

    it("RateLimitError should have 429 status and retryAfter", () => {
      const error = new RateLimitError("Too many requests", 120);
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(120);
    });
  });

  describe("Utility Functions", () => {
    it("isAppError should identify AppErrors", () => {
      expect(isAppError(new AppError("test"))).toBe(true);
      expect(isAppError(new NotFoundError())).toBe(true);
      expect(isAppError(new Error("test"))).toBe(false);
      expect(isAppError("string")).toBe(false);
      expect(isAppError(null)).toBe(false);
    });

    it("toErrorResponse should format AppError", () => {
      const error = new NotFoundError("User not found");
      const response = toErrorResponse(error);
      
      expect(response).toEqual({
        error: "User not found",
        code: "NOT_FOUND",
        statusCode: 404,
        details: undefined,
      });
    });

    it("toErrorResponse should hide details in production", () => {
      const error = new Error("Internal failure");
      const response = toErrorResponse(error, true);
      
      expect(response.error).toBe("An unexpected error occurred");
      expect(response.code).toBe("INTERNAL_ERROR");
      expect(response.statusCode).toBe(500);
      expect(response.details).toBeUndefined();
    });

    it("toErrorResponse should show details in development", () => {
      const error = new Error("Internal failure");
      const response = toErrorResponse(error, false);
      
      expect(response.error).toBe("Internal failure");
      expect(response.details?.name).toBe("Error");
      expect(response.details?.stack).toBeDefined();
    });
  });
});
