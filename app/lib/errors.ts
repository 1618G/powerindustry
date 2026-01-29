/**
 * Error Handling Layer - Standardized application errors
 *
 * PURPOSE: Consistent error handling, proper HTTP codes, secure error messages
 *
 * USAGE:
 * throw new NotFoundError("User not found");
 * throw new UnauthorizedError("Invalid credentials");
 * throw new ValidationError("Email is invalid", { field: "email" });
 *
 * LAYER: Infrastructure
 */

// ============================================
// Base Error Classes
// ============================================

/**
 * Base application error - all custom errors extend this
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Operational errors are expected (vs programming bugs)
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.details && { details: this.details }),
    };
  }
}

// ============================================
// HTTP Error Classes
// ============================================

export class BadRequestError extends AppError {
  constructor(message: string = "Bad request", details?: Record<string, unknown>) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

export class ValidationError extends AppError {
  public readonly fields: Record<string, string>;

  constructor(
    message: string = "Validation failed",
    fields: Record<string, string> = {}
  ) {
    super(message, 400, "VALIDATION_ERROR", { fields });
    this.fields = fields;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Access denied") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found", resource?: string) {
    super(message, 404, "NOT_FOUND", resource ? { resource } : undefined);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Resource already exists") {
    super(message, 409, "CONFLICT");
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(message: string = "Too many requests", retryAfter: number = 60) {
    super(message, 429, "RATE_LIMITED", { retryAfter });
    this.retryAfter = retryAfter;
  }
}

export class InternalError extends AppError {
  constructor(message: string = "Internal server error") {
    super(message, 500, "INTERNAL_ERROR");
    // @ts-expect-error - TypeScript doesn't know about isOperational
    this.isOperational = false; // Internal errors might be bugs
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = "Service temporarily unavailable") {
    super(message, 503, "SERVICE_UNAVAILABLE");
  }
}

// ============================================
// Business Logic Errors
// ============================================

export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication failed") {
    super(message, 401, "AUTH_FAILED");
  }
}

export class AccountLockedError extends AppError {
  public readonly lockedUntil: Date;

  constructor(lockedUntil: Date) {
    super("Account is locked", 403, "ACCOUNT_LOCKED", {
      lockedUntil: lockedUntil.toISOString(),
    });
    this.lockedUntil = lockedUntil;
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor() {
    super("Email not verified", 403, "EMAIL_NOT_VERIFIED");
  }
}

export class MFARequiredError extends AppError {
  constructor() {
    super("MFA verification required", 403, "MFA_REQUIRED");
  }
}

export class SubscriptionRequiredError extends AppError {
  constructor(feature: string) {
    super(`Subscription required for ${feature}`, 402, "SUBSCRIPTION_REQUIRED", {
      feature,
    });
  }
}

export class QuotaExceededError extends AppError {
  constructor(resource: string, limit: number) {
    super(`Quota exceeded for ${resource}`, 429, "QUOTA_EXCEEDED", {
      resource,
      limit,
    });
  }
}

// ============================================
// Error Handling Utilities
// ============================================

/**
 * Check if error is an operational AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Check if error is operational (expected) vs programming bug
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Convert any error to a safe error response
 * Hides internal details in production
 */
export function toErrorResponse(
  error: unknown,
  isProduction: boolean = process.env.NODE_ENV === "production"
): {
  error: string;
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
} {
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
    };
  }

  // For unknown errors, hide details in production
  if (isProduction) {
    return {
      error: "An unexpected error occurred",
      code: "INTERNAL_ERROR",
      statusCode: 500,
    };
  }

  // In development, show more details
  return {
    error: error instanceof Error ? error.message : "Unknown error",
    code: "INTERNAL_ERROR",
    statusCode: 500,
    details: {
      name: error instanceof Error ? error.name : "Unknown",
      stack: error instanceof Error ? error.stack : undefined,
    },
  };
}

/**
 * Wrap async handlers with error handling
 */
export function catchAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>) => {
    try {
      return (await fn(...args)) as ReturnType<T>;
    } catch (error) {
      // Re-throw AppErrors as-is
      if (error instanceof AppError) throw error;
      // Wrap unknown errors
      throw new InternalError(
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  };
}

/**
 * Create error response for Remix actions/loaders
 */
export function errorResponse(error: unknown) {
  const { error: message, code, statusCode, details } = toErrorResponse(error);

  return new Response(JSON.stringify({ error: message, code, details }), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}
